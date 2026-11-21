#!/usr/bin/env python3
"""Gauntlet: install, use, uninstall and reinstall tests on your own machines, with reports and failure issues.

  /                      the reports page
  /api/state             plans, targets, recent runs        (needs Studio's sign-in, or the ADMIN_TOKEN when run on its own)
  /api/runs/<id>         one run with each step's log
  POST /api/runs         {"plan": "smoke"} runs a plan now    (administrators only when run by Automaton, or the ADMIN_TOKEN:
                         the platform Actions that Studio's schedules run send it with "trigger": "action")
  /api/home-card         the card Studio Home shows           (no host names, no logs)
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import failures
import gauntlet

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "lib"))  # paramiko, installed by the build step
MIN_ADMIN_TOKEN = 16
MAX_BODY = 4096
log = failures.log
DRILL_NAMES = ("DRILL_BACKUP_KEY", "DRILL_S3_ACCESS_KEY_ID", "DRILL_S3_SECRET_ACCESS_KEY", "DRILL_S3_ENDPOINT", "DRILL_S3_REGION", "DRILL_S3_BUCKET")


class SshExecutor:
    """Runs a command on a target over SSH with the key from the SSH_KEY secret. The first host key seen for an address is
    remembered in the data folder and must match afterwards."""

    def __init__(self, key_text: str, known_path: str):
        self.key_text, self.known_path = key_text, known_path

    def connect(self, target: dict):
        import io
        import paramiko
        key = None
        for kind in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
            try:
                key = kind.from_private_key(io.StringIO(self.key_text))
                break
            except (paramiko.SSHException, ValueError):
                continue
        if key is None:
            raise RuntimeError("SSH_KEY is not a usable private key")
        user, _, address = target["host"].rpartition("@")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        known = self.read_known()
        if address not in known:
            probe = paramiko.Transport((address, 22))
            probe.start_client(timeout=20)
            known[address] = probe.get_remote_server_key().get_base64()
            probe.close()
            Path(self.known_path).write_text(json.dumps(known))
        client.get_host_keys().add(address, *self.stored_key(known[address]))
        client.connect(address, username=user or "root", pkey=key, timeout=20, banner_timeout=20, auth_timeout=20,
                       look_for_keys=False, allow_agent=False)
        return client

    def stored_key(self, text: str):
        import base64
        import paramiko
        blob = base64.b64decode(text)
        name = paramiko.Message(blob).get_text()
        cls = {"ssh-ed25519": paramiko.Ed25519Key, "ssh-rsa": paramiko.RSAKey}.get(name) or paramiko.ECDSAKey
        return name, cls(data=blob)

    def read_known(self) -> dict:
        try:
            return json.loads(Path(self.known_path).read_text())
        except (OSError, ValueError):
            return {}

    def run(self, target: dict, command: str, timeout: int, stdin: str | None = None) -> tuple[int | None, str]:
        """(exit status, output). The status is None when the command ran out of time; connection problems are status 255."""
        try:
            client = self.connect(target)
        except Exception as error:
            return 255, f"could not connect to the target: {type(error).__name__}"
        try:
            channel = client.get_transport().open_session()
            channel.settimeout(timeout)
            channel.set_combine_stderr(True)
            # `timeout` ends the command on the machine too; a pty would echo the script sent on stdin into the log
            channel.exec_command(f"timeout --kill-after=10 {timeout} bash -lc " + gauntlet.shell_quote(command))
            if stdin is not None:
                channel.sendall(stdin.encode())
                channel.shutdown_write()
            deadline, chunks = time.time() + timeout, []
            while True:
                if channel.recv_ready():
                    chunks.append(channel.recv(65536))
                elif channel.exit_status_ready():
                    while channel.recv_ready():
                        chunks.append(channel.recv(65536))
                    break
                elif time.time() > deadline:
                    channel.close()
                    return None, b"".join(chunks).decode("utf-8", "replace")
                else:
                    time.sleep(0.2)
            status = channel.recv_exit_status()
            return (None if status in (124, 137) else status), b"".join(chunks).decode("utf-8", "replace")  # timeout(1) ended it
        finally:
            client.close()


class App:
    def __init__(self, env=None, now=time.time, executor=None, email=None):
        env = os.environ if env is None else env
        self.now = now
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        data = env.get("AUTOMATON_APP_DATA_DIR", "data")
        os.makedirs(data, exist_ok=True)
        self.targets = gauntlet.parse_targets(env.get("TARGETS", ""))
        self.plans = gauntlet.load_plans(HERE / "plans", os.path.join(data, "plans"))
        self.repos = failures.parse_repos(env.get("ISSUE_REPOS", ""))
        self.store = gauntlet.Store(os.path.join(data, "gauntlet.db"), now)
        self.store.finish_orphans()
        manifest = json.loads((HERE / "automaton.json").read_text()).get("application", {})
        self.schedules = {s["action"]: s["cron"] + " UTC" for s in manifest.get("schedules", [])}
        self.ssh_key = env.get("SSH_KEY", "").replace("\\n", "\n")
        self.drill = {n: env.get(n, "").strip() if n != "DRILL_BACKUP_KEY" else env.get(n, "").replace("\\n", "\n").strip() for n in DRILL_NAMES}
        key_lines = [x.strip() for x in self.drill["DRILL_BACKUP_KEY"].splitlines()]
        self.secrets = [s for s in (self.ssh_key, *key_lines, self.drill["DRILL_S3_ACCESS_KEY_ID"], self.drill["DRILL_S3_SECRET_ACCESS_KEY"], env.get("GITHUB_TOKEN", "").strip(), env.get("APP_AUTOMATON_API_KEY", "").strip(), self.admin_token) if s]
        self.executor = executor or SshExecutor(self.ssh_key, os.path.join(data, "known_hosts.json"))
        api_url, api_key = env.get("AUTOMATON_API_URL", "").strip(), env.get("APP_AUTOMATON_API_KEY", "").strip()
        recipients = [x for x in env.get("EMAIL_TO", "").replace(";", ",").replace(" ", ",").split(",") if x] or ["administrators"]
        self.email = email or (lambda subject, text: failures.send_email(api_url, api_key, recipients, subject, text))
        token = env.get("GITHUB_TOKEN", "").strip()
        self.claude_target, self.claude_command = env.get("CLAUDE_TARGET", "").strip(), env.get("CLAUDE_COMMAND", "").strip()
        self.reporter = failures.Reporter(self.store, failures.GitHub(token) if token else None, self.repos,
                                          failures.parse_boards(env.get("BOARDS", "")), self.diagnose, self.email)
        self.lock = threading.Lock()
        self.running: dict | None = None  # {"id", "plan", "target"} while a run is in progress
        self.queue_lock = threading.Lock()

    def diagnose(self, prompt: str) -> dict | None:
        """Asks Claude Code, headless on a configured target with its own login, to read the failure and write the issue."""
        target = self.targets.get(self.claude_target)
        if not target or not self.claude_command:
            return None
        code, output = self.executor.run(target, self.claude_command, 600, stdin=prompt)
        return failures.parse_diagnosis(gauntlet.redact(output, self.secrets), self.repos) if code == 0 else None

    # --- access ---------------------------------------------------------------------------------------------
    def has_token(self, headers) -> bool:
        supplied = headers.get("Authorization", "")
        supplied = supplied[7:] if supplied.lower().startswith("bearer ") else ""
        return len(self.admin_token) >= MIN_ADMIN_TOKEN and hmac.compare_digest(supplied.encode(), self.admin_token.encode())

    def may_manage(self, headers) -> str | None:
        """None when the request may use the API, else why not: "signin" (run by Automaton) or "token" (standalone).
        The ADMIN_TOKEN works in both: it is how the platform Actions of the schedules call the app."""
        if self.has_token(headers):
            return None
        if self.managed:
            return None if headers.get("X-Automaton-Viewer-Role") and headers.get("X-Automaton-Viewer-Token") else "signin"
        return "token"

    def may_run(self, headers) -> bool:
        """Runs can wipe machines: run by Automaton only a system administrator (or the ADMIN_TOKEN) may start one."""
        return not self.managed or self.has_token(headers) or (headers.get("X-Automaton-Viewer-Role") or "").lower() == "administrator"

    # --- running ----------------------------------------------------------------------------------------------
    def start(self, plan_name: str, trigger: str) -> tuple[int | None, str | None]:
        """Starts a run in the background. (run id, None) or (None, why not)."""
        plan = self.plans.get(plan_name)
        if not plan:
            return None, "unknown plan"
        target = self.targets.get(plan["target"] or "")
        with self.queue_lock:
            if self.running:
                return None, "another run is in progress"
            run_id = self.store.begin(plan_name, plan["target"], trigger)
            self.running = {"id": run_id, "plan": plan_name, "target": plan["target"]}
        threading.Thread(target=self.work, args=(plan, target, run_id), daemon=True).start()
        return run_id, None

    def work(self, plan: dict, target: dict | None, run_id: int) -> None:
        try:
            result = gauntlet.execute(plan, target, self.executor, self.secrets, self.now, lambda partial: self.store.save(run_id, partial), HERE / "plans" / "scripts", self.drill)
            self.store.save(run_id, result)
            if result["status"] == "passed":
                self.reporter.passed(plan, result, run_id)
            else:
                self.reporter.failed(plan, result, run_id)
        except Exception as error:  # a broken run must never leave the app stuck as running
            log(f"run {run_id} broke: {type(error).__name__}")
            self.store.db.execute("update runs set status='failed', error=?, finished=? where id=?", (f"Gauntlet itself failed: {type(error).__name__}", self.now(), run_id))
        finally:
            self.running = None

    def prune_daily(self) -> None:
        while True:
            try:
                self.store.prune()
            except Exception as error:
                log(f"pruning failed: {type(error).__name__}")
            time.sleep(86400)

    # --- views ------------------------------------------------------------------------------------------------
    def state(self) -> dict:
        plans = []
        for name, plan in self.plans.items():
            runs = self.store.runs(10, name)
            for run in runs:
                run["failed_step"] = self.failed_step(run)
            if runs and runs[0]["status"] == "running":
                runs[0]["step"] = len(self.store.run(runs[0]["id"])["steps"]) + 1
            target = self.targets.get(plan["target"] or "")
            plans.append({"name": name, "title": plan["title"], "description": plan["description"], "target": plan["target"],
                          "wipes": plan["wipes"], "steps": len(plan["steps"]), "schedule": self.schedules.get(name),
                          "problem": gauntlet.refusal(plan, target), "last": runs[0] if runs else None, "runs": runs})
        return {"plans": plans, "running": self.running, "managed": self.managed,
                "targets": [{"name": t["name"], "disposable": t["disposable"]} for t in self.targets.values()],
                "github": bool(self.repos), "claude": bool(self.claude_target and self.claude_command)}

    def failed_step(self, run: dict) -> str | None:
        if run["status"] not in ("failed", "refused"):
            return None
        return next((s["name"] for s in self.store.run(run["id"])["steps"] if s["status"] != "passed"), None)

    def home_card(self) -> dict:
        now = self.now()
        lasts = [(p, (self.store.runs(1, p["name"]) or [None])[0]) for p in self.plans.values()]
        finished = [(p, r) for p, r in lasts if r and r["status"] != "running"]
        buttons = {"type": "buttons", "items": [{"label": "Reports", "path": "/"}]}
        if not finished:
            return {"status": "No run yet", "tone": "info", "detail": "Gauntlet has not finished a run.", "blocks": [buttons]}
        bad = [p for p, r in finished if r["status"] != "passed"]
        newest = max((r for _, r in finished), key=lambda r: r["finished"] or r["started"])
        blocks = [{"type": "badge", "label": p["title"], "text": gauntlet.summary(r, now), "tone": "ok" if r["status"] == "passed" else "critical"} for p, r in finished[:6]]
        return {"status": "Needs attention" if bad else "Last run: passed", "tone": "critical" if bad else "ok",
                "detail": "Last run " + gauntlet.ago(now - (newest["finished"] or newest["started"])), "blocks": blocks + [buttons]}


def make_handler(app: App, page: bytes):
    class Handler(BaseHTTPRequestHandler):
        server_version = "gauntlet"

        def reply(self, code: int, body: bytes = b"", kind: str = "application/json"):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def json(self, code: int, value):
            self.reply(code, json.dumps(value).encode())

        def guard(self) -> bool:
            refused = app.may_manage(self.headers)
            if refused == "signin":
                self.json(401, {"error": "Sign in through Automaton Studio"})
                return False
            if refused == "token":
                usable = len(app.admin_token) >= MIN_ADMIN_TOKEN
                if usable and self.headers.get("Authorization"):
                    time.sleep(0.5)  # slows guessing
                self.json(401, {"error": "Wrong or missing admin token: send the ADMIN_TOKEN as a Bearer token" if usable
                                else f"Set ADMIN_TOKEN (at least {MIN_ADMIN_TOKEN} characters) to use Gauntlet outside Automaton",
                                "mode": "token" if usable else "none"})
                return False
            if self.command != "GET" and self.headers.get("X-Gauntlet") != "1":
                self.json(403, {"error": "missing X-Gauntlet header"})
                return False
            return True

        def route(self):
            path = urlsplit(self.path).path
            parts = path.strip("/").split("/")
            if path == "/health":
                self.reply(200, b"ok", "text/plain")
            elif path == "/" and self.command in ("GET", "HEAD"):
                self.reply(200, page, "text/html; charset=utf-8")
            elif path in ("/ui/app.css", "/ui/app.js", "/gauntlet.css", "/gauntlet.js") and self.command in ("GET", "HEAD"):
                asset = HERE / path.lstrip("/")
                self.reply(200, asset.read_bytes(), "text/css" if path.endswith(".css") else "text/javascript")
            elif path == "/api/home-card" and self.command == "GET":  # a summary without host names or logs, read by the app's own action
                self.json(200, app.home_card())
            elif parts[0] == "api":
                self.api(parts[1:])
            else:
                self.reply(404, b"not found", "text/plain")

        def api(self, rest: list[str]):
            if not self.guard():
                return
            if rest == ["state"] and self.command == "GET":
                self.json(200, app.state())
            elif rest == ["runs"] and self.command == "GET":
                plan = parse_qs(urlsplit(self.path).query).get("plan", [""])[0]
                self.json(200, app.store.runs(200, plan) if plan in app.plans else [])
            elif len(rest) == 2 and rest[0] == "runs" and rest[1].isdigit() and self.command == "GET":
                run = app.store.run(int(rest[1]))
                self.json(200, run) if run else self.json(404, {"error": "no such run"})
            elif rest == ["runs"] and self.command == "POST":
                if not app.may_run(self.headers):
                    return self.json(403, {"error": "only an administrator can start a run"})
                try:
                    length = int(self.headers.get("Content-Length", 0))
                    if length < 0 or length > MAX_BODY:
                        return self.json(413, {"error": "request too large"})
                    body = json.loads(self.rfile.read(length) or b"{}")
                    plan = body.get("plan") if isinstance(body, dict) else None
                    trigger = "action" if app.has_token(self.headers) and isinstance(body, dict) and body.get("trigger") == "action" else "manual"
                except ValueError:
                    return self.json(400, {"error": "send a JSON object"})
                if not isinstance(plan, str):
                    return self.json(400, {"error": "say which plan to run"})
                run_id, why = app.start(plan, trigger)
                if run_id is None:
                    return self.json(404 if why == "unknown plan" else 409, {"error": why})
                self.json(202, {"id": run_id})
            else:
                self.json(404, {"error": "not found"})

        do_GET = do_POST = do_HEAD = route

        def log_message(self, *args):
            pass
    return Handler


def main() -> int:
    try:
        app = App()
    except (gauntlet.InvalidConfig, OSError) as error:
        log(f"cannot start: {error}")
        return 1
    threading.Thread(target=app.prune_daily, daemon=True).start()
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Gauntlet listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app, (HERE / "index.html").read_bytes())).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
