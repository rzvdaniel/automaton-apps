#!/usr/bin/env python3
"""Server Console: a dashboard for the health of your Automaton server, with 24 hours of history and webhook warnings.

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
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, urlopen

import console

HERE = os.path.dirname(os.path.abspath(__file__))
# Only these files are served; the page itself holds no data.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/console.css": ("console.css", "text/css; charset=utf-8"),
    "/dashboard.js": ("dashboard.js", "text/javascript; charset=utf-8"),
    "/ui/app.css": (os.path.join("ui", "app.css"), "text/css; charset=utf-8"),
    "/ui/app.js": (os.path.join("ui", "app.js"), "text/javascript; charset=utf-8"),
}


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


EMAIL_SUBJECTS = {"disk_low": "Disk space is low", "security_overdue": "Security updates are overdue", "reboot_overdue": "A restart is overdue"}


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
            log(f"check failed: {self.state['message']}")

    def loop(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.settings.interval)

    def view(self, machine: str | None = None) -> dict:
        with self.lock:
            return console.snapshot(self.state, self.settings, time.time(), machine)


CLEANUP_STATUS = {"ok": 200, "not_approved": 403, "unavailable": 404, "no_key": 403, "not_configured": 404}


def make_handler(app: Console):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ServerConsole"

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

        def maintain(self, call, *args) -> None:
            status, data, message = call(app.settings, *args)
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

        def do_POST(self):  # noqa: N802
            parts = urlsplit(self.path)
            # A page of this app sets this header; a form on another site cannot.
            operations = {"/api/maintenance/logs": "logs", "/api/maintenance/restart": "restart", "/api/maintenance/disk": "disk"}
            machine = {"/api/maintenance/os-update": "os-update", "/api/maintenance/reboot": "reboot"}
            if self.headers.get("X-Server-Console") != "1" or (parts.path != "/api/maintenance/cleanup" and parts.path not in operations and parts.path not in machine):
                return self.json(404, {"error": "Not found"})
            query = parse_qs(parts.query)
            runner = (query.get("runner") or [""])[0]
            token = self.headers.get("X-Automaton-Viewer-Token")
            if parts.path in machine:
                try:
                    body = json.loads(self.read_body(2000).decode("utf-8") or "{}")
                    confirm = body.get("confirm") if isinstance(body, dict) else None
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
            if path == "/api/cleanup":
                return self.cleanup()
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
    log(f"Server Console listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
