#!/usr/bin/env python3
"""Overseer: shows and runs the work queue of your coding agents, and its scheduled jobs, on any server.

  /                        the page: queue, schedules, morning report
  GET  /api/state          queue, jobs, report      (administrators; the ADMIN_TOKEN when run on its own)
  GET  /api/tasks/<name>   one task's log and its issue and pull request links
  POST /api/tasks          {"name", "prompt"} adds a task
  POST /api/tasks/<name>/cancel
  POST /api/queue          {"paused": true|false}
  POST /api/jobs/<job>     runs stall-check, report, lessons or pick-up now (the schedules call this too)
"""

from __future__ import annotations

import hmac
import io
import json
import os
import shlex
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "lib"))  # paramiko, installed by the build step
import overseer  # noqa: E402

MIN_ADMIN_TOKEN = 16
MAX_BODY = 20000


def log(message: str) -> None:
    print(message, flush=True)


class SshExecutor:
    """Runs a command on the queue machine over SSH. The first host key seen for the address is remembered in the data folder
    and must match afterwards."""

    def __init__(self, host: str, key_text: str, known_path: str):
        self.user, _, self.address = host.rpartition("@")
        self.user = self.user or "root"
        self.key_text, self.known_path = key_text, known_path

    def known(self) -> dict:
        try:
            return json.loads(Path(self.known_path).read_text())
        except (OSError, ValueError):
            return {}

    def connect(self):
        import base64
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
        known = self.known()
        if self.address not in known:
            probe = paramiko.Transport((self.address, 22))
            probe.start_client(timeout=20)
            known[self.address] = probe.get_remote_server_key().get_base64()
            probe.close()
            Path(self.known_path).write_text(json.dumps(known))
        blob = base64.b64decode(known[self.address])
        name = paramiko.Message(blob).get_text()
        cls = {"ssh-ed25519": paramiko.Ed25519Key, "ssh-rsa": paramiko.RSAKey}.get(name) or paramiko.ECDSAKey
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.get_host_keys().add(self.address, name, cls(data=blob))
        client.connect(self.address, username=self.user, pkey=key, timeout=20, banner_timeout=20, auth_timeout=20,
                       look_for_keys=False, allow_agent=False)
        return client

    def run(self, command: str, timeout: int, stdin: str | None = None) -> tuple[int | None, str]:
        """(exit status, output). The status is None when the command ran out of time; connection problems are 255."""
        try:
            client = self.connect()
        except Exception as error:
            return 255, f"could not connect to the queue machine: {type(error).__name__}"
        try:
            import shlex
            channel = client.get_transport().open_session()
            channel.settimeout(timeout)
            channel.set_combine_stderr(True)
            channel.exec_command(f"timeout --kill-after=10 {timeout} bash -c " + shlex.quote(command))
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
                    time.sleep(0.1)
            status = channel.recv_exit_status()
            return (None if status in (124, 137) else status), b"".join(chunks).decode("utf-8", "replace")
        finally:
            client.close()


class App:
    def __init__(self, env=None, now=time.time, executor=None, fetch_board=None, move_card=None, comment=None):
        env = os.environ if env is None else env
        self.now = now
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())
        self.app_id = env.get("AUTOMATON_APP_ID", "").strip()
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        data = env.get("AUTOMATON_APP_DATA_DIR", "data")
        os.makedirs(data, exist_ok=True)
        key = env.get("SSH_KEY", "").replace("\\n", "\n")
        self.github_token = env.get("GITHUB_TOKEN", "").strip()
        self.api_url, self.api_key = env.get("AUTOMATON_API_URL", "").strip(), env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.secrets = [s for s in (key, self.github_token, self.api_key, self.admin_token) if s]
        host = env.get("QUEUE_HOST", "").strip()
        if not executor and not host:
            raise overseer.InvalidConfig("QUEUE_HOST is not set (user@address of the machine where agent-queue runs)")
        executor = executor or SshExecutor(host, key, os.path.join(data, "known_hosts.json"))
        self.queue = overseer.Queue(executor, env.get("QUEUE_BIN", "").strip(), env.get("QUEUE_HOME", "").strip(),
                                    env.get("RUNNER", "").strip() or "claude-task", self.number(env, "STALL_MINUTES", 120))
        self.jobs = overseer.Jobs(os.path.join(data, "overseer.json"), now)
        self.repo = env.get("ISSUE_REPO", "").strip()
        self.env = env  # AGENT_BOARDS and PAUSE_BETWEEN are read at each run, so a change applies from the next one
        self.lessons = env.get("LESSONS_PROMPT", "").strip() or overseer.DEFAULT_LESSONS
        self.cli_server, self.cli_key = env.get("CLI_SERVER", "").strip(), env.get("CLI_API_KEY", "").strip()
        self.release_repo, self.email_to = env.get("RELEASE_REPO", "").strip(), env.get("EMAIL_TO", "").strip()
        self.secrets += [self.cli_key] if self.cli_key else []
        self.fetch_board = fetch_board or overseer.fetch_column
        self.move_card, self.comment = move_card or overseer.move_card, comment or overseer.comment_issue
        self.job_lock = threading.Lock()
        self.status_cache: tuple[float, dict | None] = (0.0, None)

    @staticmethod
    def number(env, name: str, default: int) -> int:
        try:
            return max(1, int(env.get(name, "").strip() or default))
        except ValueError:
            raise overseer.InvalidConfig(f"{name} must be a whole number")

    # --- access ---------------------------------------------------------------------------------------------
    def may_manage(self, headers) -> str | None:
        """None when the request may use the API, else why not: "signin" (run by Automaton) or "token" (standalone).
        Tasks run an agent on a machine, so only administrators (or the token, used by the schedules) may do anything."""
        supplied = headers.get("Authorization", "")
        supplied = supplied[7:] if supplied.lower().startswith("bearer ") else ""
        if len(self.admin_token) >= MIN_ADMIN_TOKEN and supplied and hmac.compare_digest(supplied.encode(), self.admin_token.encode()):
            return None
        if self.managed:
            if (headers.get("X-Automaton-Viewer-Role") or "").lower() == "administrator" and headers.get("X-Automaton-Viewer-Token"):
                return None
            return "signin"
        return "token"

    # --- jobs -----------------------------------------------------------------------------------------------
    def run_job(self, job: str, trigger: str) -> tuple[bool, str]:
        if job not in overseer.JOBS:
            return False, "unknown job"
        if not self.job_lock.acquire(blocking=False):
            return False, "another job is running"
        try:
            ok, text = getattr(self, "job_" + job.replace("-", "_"))()
        except Exception as error:
            ok, text = False, f"{job} failed: {type(error).__name__}: {overseer.redact(str(error), self.secrets)[:200]}"
        finally:
            self.job_lock.release()
        text = overseer.redact(text, self.secrets)
        self.jobs.record(job, ok, text, trigger)
        return ok, text

    def job_stall_check(self) -> tuple[bool, str]:
        return self.queue.orchestrate(False)

    def job_report(self) -> tuple[bool, str]:
        return self.queue.orchestrate(True)

    def job_lessons(self) -> tuple[bool, str]:
        name = "lessons-" + datetime.fromtimestamp(self.now(), timezone.utc).strftime("%Y%m%d")
        why = self.queue.add(name, self.lessons)
        return (False, why) if why else (True, f"queued {name}")

    def job_pick_up(self) -> tuple[bool, str]:
        spec, pause = self.env.get("AGENT_BOARDS", "").strip(), self.env.get("PAUSE_BETWEEN", "").strip()
        if not spec:
            self.jobs.set_pickup([], [])
            return True, "AGENT_BOARDS is empty: nothing queued"
        if overseer.in_pause(pause, self.now()):
            return True, f"paused ({pause} UTC): nothing queued"
        if not self.github_token:
            return False, "GITHUB_TOKEN is not set: AGENT_BOARDS is set, so Pick-up needs a token with read:project; nothing queued"
        mode = self.env.get("PICKUP_MODE", "").strip().lower() or "one"
        if mode not in ("one", "all"):
            return False, f'PICKUP_MODE is "{mode[:20]}": use one or all; nothing queued'
        if mode == "one":
            status = self.queue.status()
            busy = status["running"] + status["pending"]
            if busy:
                return True, f"the queue is not free ({len(status['running'])} running, {len(status['pending'])} pending): nothing queued"
        boards = overseer.parse_boards(spec)
        queued, skipped, problems = [], [], []
        for board, column in boards:
            if mode == "one" and queued:
                break
            result = self.fetch_board(self.github_token, board, column)
            if result["problem"]:
                problems.append(result["problem"])
                continue
            for item in result["items"]:
                problem = overseer.shape_problem(item)
                if problem:
                    skipped.append({"url": item["url"], "number": item["number"], "repo": item["repo"], "reason": "not ready: " + problem})
                    problems += self.send_back(item, column, result.get("board") or {}, problem)
                    continue
                if self.jobs.was_queued(item["url"]):
                    continue
                name = overseer.pick_name(item)
                if not self.queue.has(name):
                    why = self.queue.add(name, overseer.pick_prompt(item))
                    if why:
                        self.jobs.set_pickup(skipped, problems)
                        return False, f"could not queue {item['url']}: {why}"
                self.jobs.mark_queued(item["url"])
                queued.append(f"#{item['number']}")
                if mode == "one":
                    break
        self.jobs.set_pickup(skipped, problems)
        text = ("queued " + ", ".join(queued)) if queued else "nothing new: nothing queued"
        if skipped:
            text += "; skipped " + ", ".join(f"#{s['number']}" for s in skipped) + " (not ready, moved back)"
        return not problems, "; ".join([text] + problems)

    def send_back(self, item: dict, column: str, board: dict, problem: str) -> list[str]:
        """Moves a card whose issue is not ready out of the column and says so on the issue once (again only after the issue changes).
        Returns what went wrong. A card that could not be moved is left alone and not commented, so the next run tries again."""
        why = self.move_card(self.github_token, board, item, column)
        if why:
            return [f"{item['repo']}#{item['number']}: {why}"]
        if self.jobs.notify_once(item["url"], overseer.shape_fingerprint(item)):
            why = self.comment(self.github_token, item, overseer.shape_comment(problem))
            if why:
                return [f"{item['repo']}#{item['number']}: {why}"]
        return []

    # --- release check --------------------------------------------------------------------------------------
    def start_release_check(self, version: str, spawn=None) -> tuple[int, str]:
        """Answers at once: 202 started, 200 already started for this version, 400 bad input, 409 not set up. The work goes on in a thread."""
        version = version.strip().removeprefix("server-v").removeprefix("v")
        if not overseer.VERSION_RE.match(version):
            return 400, 'send {"version": "0.2.176"}'
        if not self.cli_server or not self.cli_key or not self.release_repo:
            return 409, "set CLI_SERVER, CLI_API_KEY and RELEASE_REPO first"
        if not self.jobs.claim_release(version):
            return 200, f"the release check for {version} was already started: nothing done"
        (spawn or (lambda f: threading.Thread(target=f, daemon=True).start()))(lambda: self.release_check(version))
        return 202, f"upgrading the test server to {version}, then queuing its release check"

    def release_check(self, version: str) -> None:
        try:
            ok, text = self.upgrade_and_queue(version)
        except Exception as error:
            ok, text = False, f"release check {version} failed: {type(error).__name__}"
        text = overseer.redact(text, self.secrets)
        self.jobs.finish_release(version, ok, text)
        if not ok:
            self.report_failure(version, text.split(": ")[0])  # the release notes are public: no output of the command

    def upgrade_and_queue(self, version: str) -> tuple[bool, str]:
        # the key travels on standard input, so it is not in the command line or the process list
        command = (f"IFS= read -r AUTOMATON_API_KEY; export AUTOMATON_API_KEY AUTOMATON_SERVER={shlex.quote(self.cli_server)}; "
                   f"automaton server update --version server-v{version} --wait")
        code, out = self.queue.run(command, 1200, self.cli_key + "\n")
        if code != 0:
            last = (out.strip().splitlines() or ["no output"])[-1][:200]
            return False, f"the upgrade to {version} failed" + (" (timed out)" if code is None else f" (exit {code}): {last}")
        name = "release-check-" + version.replace(".", "-")
        if not self.queue.has(name):
            why = self.queue.add(name, overseer.release_prompt(version, self.release_repo))
            if why:
                return False, f"upgraded to {version}, but could not queue the check: {why}"
        return True, f"upgraded to {version} and queued {name}"

    def report_failure(self, version: str, text: str) -> None:
        """Posts the error on the release (with the queue machine's gh) and emails the owner (notify:email); neither may break the run."""
        note = f"\n\n## Release check\nThe test server upgrade did not finish: {text}\n"
        self.queue.run(f'gh release view server-v{version} -R {shlex.quote(self.release_repo)} --json body -q .body > "$HOME/.overseer-notes.$$" && '
                       f'cat >> "$HOME/.overseer-notes.$$" && gh release edit server-v{version} -R {shlex.quote(self.release_repo)} '
                       f'--notes-file "$HOME/.overseer-notes.$$"; rm -f "$HOME/.overseer-notes.$$"', 60, note)
        if self.email_to and self.api_url and self.api_key:
            try:
                body = json.dumps({"to": [a.strip() for a in self.email_to.split(",") if a.strip()],
                                   "subject": f"Release check {version} did not start", "text": text}).encode()
                urlopen(Request(self.api_url.rstrip("/") + "/api/notify/email", body, {"Authorization": "Bearer " + self.api_key,
                        "Content-Type": "application/json", "User-Agent": "Automaton-Overseer/1.0"}, method="POST"), timeout=15).close()
            except (HTTPError, URLError, ValueError, OSError):
                log("failure email not sent")

    # --- views ------------------------------------------------------------------------------------------------
    def schedule_info(self) -> dict | None:
        """The app's next and last scheduled run, from the platform (needs the approved apps:read-status permission)."""
        if not (self.api_url and self.api_key and self.app_id):
            return None
        when, cached = self.status_cache
        if self.now() - when < 60:
            return cached
        info = None
        try:
            request = Request(self.api_url.rstrip("/") + "/api/apps/status", headers={"Authorization": "Bearer " + self.api_key, "Accept": "application/json"})
            with urlopen(request, timeout=10) as response:
                for item in json.loads(response.read()):
                    if str(item.get("id", "")).lower() == self.app_id.lower():
                        info = {"next": item.get("nextActionRunAtUtc"), "paused": item.get("isPaused")}
        except (HTTPError, URLError, ValueError, OSError):
            info = None
        self.status_cache = (self.now(), info)
        return info

    def state(self) -> dict:
        try:
            queue, problem = self.queue.status(), None
        except RuntimeError as error:
            queue, problem = None, str(error)
        jobs = [{"name": name, "what": what, "last": self.jobs.data["jobs"].get(name)} for name, what in overseer.JOBS.items()]
        report = overseer.redact(self.queue.report(), self.secrets) if queue else ""
        pickup = self.jobs.data["pickup"]
        if pickup["skipped"] or pickup["problems"]:
            report += "\n\n## Pick-up\n" + "".join(f"- Skipped: {s['repo']}#{s['number']} {s['reason']}\n" for s in pickup["skipped"]) \
                + "".join(f"- {p}\n" for p in pickup["problems"])
        return {"queue": queue, "problem": problem, "jobs": jobs, "schedule": self.schedule_info(), "report": report[-20000:],
                "pickup": {"boards": self.env.get("AGENT_BOARDS", "").strip(), "pause": self.env.get("PAUSE_BETWEEN", "").strip(),
                           "ready": bool(self.env.get("AGENT_BOARDS", "").strip() and self.github_token),
                           "warning": "AGENT_BOARDS is set but GITHUB_TOKEN is empty: Pick-up fails until a classic token with read:project is added." if self.env.get("AGENT_BOARDS", "").strip() and not self.github_token else "",
                           "skipped": pickup["skipped"], "problems": pickup["problems"]}}

    def task(self, name: str) -> dict | None:
        text = self.queue.log(name)
        if text is None:
            return None
        text = overseer.redact(text, self.secrets)
        return {"name": name, "log": text, **overseer.links(name, text, self.repo)}


def make_handler(app: App, page: bytes):
    class Handler(BaseHTTPRequestHandler):
        server_version = "overseer"

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

        def body(self) -> dict | None:
            try:
                length = int(self.headers.get("Content-Length", 0))
                if length < 0 or length > MAX_BODY:
                    self.json(413, {"error": "request too large"})
                    return None
                value = json.loads(self.rfile.read(length) or b"{}")
                if isinstance(value, dict):
                    return value
            except ValueError:
                pass
            self.json(400, {"error": "send a JSON object"})
            return None

        def guard(self) -> bool:
            refused = app.may_manage(self.headers)
            if refused is None:
                if self.command != "GET" and not self.headers.get("Authorization") and self.headers.get("X-Overseer") != "1":
                    self.json(403, {"error": "missing X-Overseer header"})
                    return False
                return True
            if refused == "signin":
                self.json(401, {"error": "Sign in to Automaton Studio as an administrator"})
            else:
                usable = len(app.admin_token) >= MIN_ADMIN_TOKEN
                if usable and self.headers.get("Authorization"):
                    time.sleep(0.5)  # slows guessing
                self.json(401, {"error": "Wrong or missing admin token: send the ADMIN_TOKEN as a Bearer token" if usable
                                else f"Set ADMIN_TOKEN (at least {MIN_ADMIN_TOKEN} characters) to use Overseer outside Automaton",
                                "mode": "token" if usable else "none"})
            return False

        def route(self):
            path = urlsplit(self.path).path
            if path == "/health":
                self.reply(200, b"ok", "text/plain")
            elif path == "/" and self.command in ("GET", "HEAD"):
                self.reply(200, page, "text/html; charset=utf-8")
            elif path in ("/ui/app.css", "/ui/app.js", "/overseer.css", "/overseer.js") and self.command in ("GET", "HEAD"):
                self.reply(200, (HERE / path.lstrip("/")).read_bytes(), "text/css" if path.endswith(".css") else "text/javascript")
            elif path.startswith("/api/"):
                if self.guard():
                    self.api(path.strip("/").split("/")[1:])
            else:
                self.reply(404, b"not found", "text/plain")

        def api(self, rest: list[str]):
            get, post = self.command == "GET", self.command == "POST"
            if rest == ["state"] and get:
                self.json(200, app.state())
            elif len(rest) == 2 and rest[0] == "tasks" and get:
                task = app.task(rest[1])
                self.json(200, task) if task else self.json(404, {"error": "no such task"})
            elif rest == ["tasks"] and post:
                body = self.body()
                if body is None:
                    return
                why = app.queue.add(str(body.get("name", "")), str(body.get("prompt", "")))
                self.json(400 if why else 202, {"error": why} if why else {"queued": body["name"]})
            elif len(rest) == 3 and rest[0] == "tasks" and rest[2] == "cancel" and post:
                why = app.queue.cancel(rest[1])
                self.json(404 if why else 200, {"error": why} if why else {"cancelled": rest[1]})
            elif rest == ["queue"] and post:
                body = self.body()
                if body is None or not isinstance(body.get("paused"), bool):
                    return body is None or self.json(400, {"error": "send paused: true or false"})
                why = app.queue.pause(body["paused"])
                self.json(502 if why else 200, {"error": why} if why else {"paused": body["paused"]})
            elif rest == ["release-check"] and post:
                body = self.body()
                if body is None:
                    return
                code, text = app.start_release_check(str(body.get("version", "")))
                self.json(code, {"ok": code < 300, "text": text})
            elif len(rest) == 2 and rest[0] == "jobs" and post:
                if rest[1] not in overseer.JOBS:
                    return self.json(404, {"error": "unknown job"})
                ok, text = app.run_job(rest[1], "schedule" if self.headers.get("Authorization") else "manual")
                self.json(200 if ok else 502, {"ok": ok, "text": text})
            else:
                self.json(404, {"error": "not found"})

        do_GET = do_POST = do_HEAD = route

        def log_message(self, *args):
            pass
    return Handler


def main() -> int:
    try:
        app = App()
    except (overseer.InvalidConfig, OSError) as error:
        log(f"cannot start: {error}")
        return 1
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Overseer listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app, (HERE / "index.html").read_bytes())).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
