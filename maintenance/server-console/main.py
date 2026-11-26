#!/usr/bin/env python3
"""Server Keeper: a dashboard for the health of your Automaton server, with 24 hours of history and webhook warnings.

Runs as an Automaton app (a page plus a background check every few minutes), or from a terminal:
  python3 main.py --once      run one check, print the result as JSON and exit
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, build_opener, urlopen

import console
import homecard

HERE = os.path.dirname(os.path.abspath(__file__))
# Only these files are served; the page itself holds no data.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/console.css": ("console.css", "text/css; charset=utf-8"),
    "/dashboard.js": ("dashboard.js", "text/javascript; charset=utf-8"),
    "/ui/app.css": (os.path.join("ui", "app.css"), "text/css; charset=utf-8"),
    "/ui/app.js": (os.path.join("ui", "app.js"), "text/javascript; charset=utf-8"),
}


RETRY_SECONDS = (15, 30, 60)


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


def state_path(env=None) -> str:
    return os.path.join((os.environ if env is None else env).get("AUTOMATON_APP_DATA_DIR", "data"), "state.json")


def post_webhook(url: str, payload: dict, timeout: float = 15) -> bool:
    """POSTs JSON to the webhook. Never logs the URL, which holds a secret."""
    host = urlsplit(url).hostname or "?"
    request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "User-Agent": console.USER_AGENT})
    try:
        with urlopen(request, timeout=timeout):
            return True
    except HTTPError as error:
        log(f"webhook request to {host} failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"webhook request to {host} failed: {type(error).__name__}")
    return False


EMAIL_SUBJECTS = {"disk_low": "Disk space is low", "disk_docker_low": "Docker disk space is low", "security_overdue": "Security updates are overdue", "reboot_overdue": "A restart is overdue",
                 "backup_old": "The server backup is too old", "backup_failed": "The last server backup failed",
                 "offsite_old": "The off-site backup has not run", "offsite_failed": "The last off-site backup failed"}


def send_email(settings: console.Settings, condition: str, text: str, timeout: float = 20) -> bool | None:
    """Emails through the server's SMTP (platform permission notify:email). True sent, False worth retrying, None
    not available (turned off, no key, not approved, SMTP not set up). The key is never logged."""
    if settings.email_to == "off" or not settings.api_base_url or not settings.api_key:
        return None
    body = {"to": [settings.email_to], "subject": EMAIL_SUBJECTS.get(condition, "Warning"),
            "text": text + "\n\n" + console.ADVICE.get(condition, "")}
    request = Request(settings.api_base_url + "/api/notify/email", data=json.dumps(body).encode(), method="POST",
                      headers={"Authorization": "Bearer " + settings.api_key, "Content-Type": "application/json",
                               "User-Agent": console.USER_AGENT})
    try:
        with build_opener(console._NoRedirect()).open(request, timeout=timeout):
            return True
    except HTTPError as error:
        if error.code in (400, 403, 404, 409, 429):
            log({403: "email not sent: notify:email is not approved or the address is not allowed",
                 404: "email not sent: no recipient found", 409: "email not sent: the server has no SMTP set up",
                 400: "email not sent: the server refused the message", 429: "email not sent: the hourly limit of 10 emails is used up"}[error.code])
            return None
        log(f"email request failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"email request failed: {type(error).__name__}")
    return False


class Console:
    def __init__(self, env=None):
        self.env = os.environ if env is None else env
        self.path = state_path(self.env)
        self.lock = threading.Lock()
        self.state = console.load_state(self.path)
        self.settings = console.Settings(self.env)
        self.retries = 0
        self.next_read = 0.0

    def send(self, event: str, condition: str, text: str) -> bool:
        log(text)
        # A channel that already sent this warning is not asked again when the other one has to be retried.
        key = f"{event}:{condition}"
        done = self.state.setdefault("sent", {}).setdefault(key, [])
        results = [True] * len(done)
        if self.settings.webhook and "webhook" not in done:
            # "text" is Slack and Telegram, "content" is Discord; the other fields are for generic receivers.
            ok = post_webhook(self.settings.webhook, {"text": text, "content": text, "event": event, "condition": condition})
            results.append(ok)
            if ok:
                done.append("webhook")
        if event == "warning" and "email" not in done:  # one email when a warning starts; recovery goes to the webhook only
            ok = send_email(self.settings, condition, text)
            results.append(ok)
            if ok:
                done.append("email")
        finished = console.delivered(results)
        if finished:
            self.state["sent"].pop(key, None)
        return finished

    def run_once(self) -> None:
        try:
            self.settings = console.Settings(self.env)
            with self.lock:
                console.run_cycle(self.settings, self.state, time.time(), self.send)
                console.save_state(self.path, self.state)
            if self.state["status"] != "ok":
                log(f"no figures: {self.state['status']}: {self.state['message']}")
        except Exception as error:  # a bad setting or a full disk must not stop the loop
            with self.lock:
                self.state["status"], self.state["message"] = "error", f"{type(error).__name__}: {error}"
                self.state["failedAt"] = int(time.time())
            log(f"check failed: {self.state['message']}")

    def schedule_next(self) -> None:
        """After a failed read try again in 15, 30 and 60 seconds, then wait the normal interval."""
        with self.lock:
            if self.state.get("status") in ("ok", "no_key", "not_approved"):
                self.retries = 0
            else:
                self.retries = self.retries + 1
            wait = RETRY_SECONDS[self.retries - 1] if 0 < self.retries <= len(RETRY_SECONDS) else self.settings.interval
            if self.retries > len(RETRY_SECONDS):
                self.retries = 0
            self.next_read = time.time() + wait

    def loop(self) -> None:
        while True:
            self.run_once()
            self.schedule_next()
            while time.time() < self.next_read:  # a read the page asked for moves next_read, so check again
                time.sleep(max(0.2, min(1.0, self.next_read - time.time())))

    def next_retry(self) -> int | None:
        """Seconds until the next read while the last one failed and a quick retry is pending."""
        if self.state.get("status") in ("ok", "starting", "no_key", "not_approved") or not self.retries:
            return None
        return max(0, int(self.next_read - time.time() + 0.5))

    def log_run(self, task: str, status: str, message: str | None) -> None:
        result = "started" if status == "ok" else "refused" if status in ("forbidden", "not_approved", "no_key") else "failed"
        with self.lock:
            console.record_run(self.state, task, result, None if status == "ok" else message, time.time())
            console.save_state(self.path, self.state)

    def view(self, machine: str | None = None) -> dict:
        with self.lock:
            data = console.snapshot(self.state, self.settings, time.time(), machine)
            data["retryIn"] = self.next_retry()
            return data


CLEANUP_STATUS = {"ok": 200, "not_approved": 403, "unavailable": 404, "no_key": 403, "not_configured": 404}


def make_handler(app: Console):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ServerKeeper"

        def log_message(self, format, *args):  # request lines carry nothing worth logging
            pass

        def send_body(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def json(self, status: int, payload: dict) -> None:
            self.send_body(status, json.dumps(payload).encode(), "application/json")

        def cleanup(self) -> None:
            status, data, message = console.cleanup_call(app.settings)
            if status != "ok":
                return self.json(CLEANUP_STATUS.get(status, 502), {"status": status, "message": message})
            data["warning"] = console.cleanup_warning(data, time.time())
            data["studioUrl"] = console.studio_server_url(app.settings, data.get("studioUrl"))
            self.json(200, {"status": "ok", "cleanup": data})

        def maintain(self, call, *args, task=None) -> None:
            status, data, message = call(app.settings, *args)
            if task:
                app.log_run(task, status, message)
            code = {"ok": 200, "not_approved": 403, "forbidden": 403, "not_found": 404, "conflict": 409, "no_key": 403, "not_configured": 404}.get(status, 502)
            self.json(code, {"status": status, "message": message, "data": data})

        def read_body(self, limit: int) -> bytes:
            """The request body, at most `limit` bytes. A proxy may send it chunked instead of with a Content-Length."""
            if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
                data = b""
                while len(data) <= limit:
                    size = int((self.rfile.readline(20).split(b";")[0].strip() or b"0"), 16)
                    if size <= 0:
                        break
                    data += self.rfile.read(min(size, limit + 1 - len(data)))
                    self.rfile.readline(3)
                return data[:limit]
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            return self.rfile.read(max(0, min(length, limit)))

        def task(self, parts) -> None:
            """The Maintenance section's four changes. Each passes the viewer token on; the server decides who may."""
            name = parts.path[len("/api/tasks/"):]
            if self.headers.get("X-Server-Console") != "1" or name not in ("cleanup-run", "cleanup-settings", "backup", "os-updates", "restart", "upgrade", "refresh"):
                return self.json(404, {"error": "Not found"})
            token = self.headers.get("X-Automaton-Viewer-Token")
            if name == "refresh":  # read the server's figures now (the page asks after an install); no secret, no new access
                with app.lock:
                    due = time.time() - getattr(app, "refreshed", 0) > 20  # at most one extra read every 20 seconds
                    if due:
                        app.refreshed = time.time()
                if due:
                    threading.Thread(target=lambda: (app.run_once(), app.schedule_next()), daemon=True).start()
                return self.json(200, {"status": "ok"})
            if name == "cleanup-run":
                return self.maintain(console.server_cleanup_run, token, task="Cleanup")
            if name == "backup":
                return self.maintain(console.backup_run, token, task="Backup")
            if name == "os-updates":
                try:
                    body = json.loads(self.read_body(2000).decode("utf-8") or "null")
                except (ValueError, UnicodeDecodeError):
                    body = None
                scope = body.get("scope") if isinstance(body, dict) else "security"
                return self.maintain(console.os_updates_run, token, scope, task="OS updates")
            if name == "restart":
                try:
                    body = json.loads(self.read_body(2000).decode("utf-8") or "null")
                except (ValueError, UnicodeDecodeError):
                    body = None
                if not isinstance(body, dict) or "restartAtUtc" not in body:  # a dropped body must never turn a scheduled restart into one now
                    return self.json(400, {"status": "error", "message": "The restart time did not arrive. Try again."})
                return self.maintain(console.server_restart_run, token, body["restartAtUtc"], task="Restart server")
            if name == "upgrade":
                return self.maintain(console.runner_upgrade, (parse_qs(parts.query).get("runner") or [""])[0], token, task="Upgrade Runners")
            try:
                body = json.loads(self.read_body(2000).decode("utf-8") or "null")
            except (ValueError, UnicodeDecodeError):
                body = None
            self.maintain(console.server_cleanup_settings, body, token)

        def do_POST(self):  # noqa: N802
            parts = urlsplit(self.path)
            if parts.path.startswith("/api/tasks/"):
                return self.task(parts)
            # A page of this app sets this header; a form on another site cannot.
            operations = {"/api/maintenance/logs": "logs", "/api/maintenance/restart": "restart", "/api/maintenance/disk": "disk"}
            machine = {"/api/maintenance/os-update": "os-update", "/api/maintenance/reboot": "reboot"}
            if self.headers.get("X-Server-Console") != "1" or (parts.path != "/api/maintenance/cleanup" and parts.path not in operations and parts.path not in machine):
                return self.json(404, {"error": "Not found"})
            query = parse_qs(parts.query)
            runner = (query.get("runner") or [""])[0]
            token = self.headers.get("X-Automaton-Viewer-Token")
            if parts.path in machine:
                # The typed name travels in a header (URL-encoded) as well as in the body: the platform's proxy does not always pass a body on.
                header_name = self.headers.get("X-Confirm-Machine")
                try:
                    if header_name is not None and len(header_name) <= 600:
                        raise KeyError
                    body = json.loads(self.read_body(2000).decode("utf-8") or "{}")
                    confirm = body.get("confirm") if isinstance(body, dict) else None
                except KeyError:
                    confirm = unquote(header_name)
                except (ValueError, UnicodeDecodeError):
                    confirm = None
                return self.maintain(lambda settings: console.machine_operation(settings, machine[parts.path], runner, confirm, token))
            if parts.path in operations:
                return self.maintain(lambda settings: console.app_operation(settings, operations[parts.path], runner,
                                                                           (query.get("target") or [""])[0], token, (query.get("lines") or ["100"])[0]))
            self.maintain(lambda settings, r, t: console.start_cleanup(settings, r, t), runner, token)

        def do_GET(self):  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/health":
                return self.send_body(200, b"ok", "text/plain")
            if path == "/api/status":  # lets the page explain what is missing before any figures exist
                with app.lock:
                    status = app.state.get("status")
                return self.json(200, {"status": status})
            if path == "/api/state":
                query = parse_qs(urlsplit(self.path).query)
                return self.json(200, app.view((query.get("machine") or [None])[0]))
            if path == "/api/home-card":  # no host, path or Runner name in it: the Home card is for everyone who may see the app
                with app.lock:
                    return self.json(200, homecard.build_card(app.state, time.time()))
            if path == "/api/cleanup":
                return self.cleanup()
            if path == "/api/tasks":  # the proxy's role header is for display only; the server checks every change
                return self.json(200, {"admin": (self.headers.get("X-Automaton-Viewer-Role") or "").lower() == "administrator"})
            if path == "/api/tasks/os-updates":
                return self.maintain(console.os_updates_status)
            if path == "/api/tasks/restart":
                return self.maintain(console.server_restart_status)
            if path == "/api/tasks/upgrade":
                return self.maintain(console.runner_upgrade, (parse_qs(urlsplit(self.path).query).get("runner") or [""])[0], None, False)
            if path == "/api/maintenance":
                return self.maintain(console.maintenance_permissions)
            if path == "/api/maintenance/apps":
                return self.maintain(console.runner_apps, (parse_qs(urlsplit(self.path).query).get("runner") or [""])[0])
            if path == "/api/maintenance/cleanup":
                query = parse_qs(urlsplit(self.path).query)
                return self.maintain(console.cleanup_run, (query.get("runner") or [""])[0], (query.get("run") or [""])[0])
            entry = STATIC.get(path)
            if not entry:
                return self.json(404, {"error": "Not found"})
            try:
                with open(os.path.join(HERE, entry[0]), "rb") as handle:
                    return self.send_body(200, handle.read(), entry[1])
            except OSError:
                return self.json(404, {"error": "Not found"})

    return Handler


def main(argv: list[str]) -> int:
    try:
        app = Console()
    except console.ConfigError as error:
        print(f"Invalid setting: {error}", file=sys.stderr)
        return 2
    if "--once" in argv:
        app.run_once()
        print(json.dumps(app.view(), indent=2))
        return 0 if app.state["status"] == "ok" else 1
    threading.Thread(target=app.loop, daemon=True).start()
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Server Keeper listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
