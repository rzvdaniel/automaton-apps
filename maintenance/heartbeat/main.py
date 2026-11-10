#!/usr/bin/env python3
"""Heartbeat: a check-in URL per job, and an alert when a check-in is missed.

Runs as an Automaton app (web page, API, check-in endpoint and a background loop that finds overdue checks).
  GET|POST|HEAD /ping/<token>     a job checks in
  /api/checks                     manage checks (needs the ADMIN_TOKEN as a Bearer token)
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
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import heartbeat

USER_AGENT = "automaton-heartbeat"
MIN_ADMIN_TOKEN = 16
MAX_BODY = 4096


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


def post_webhook(url: str, payload: dict, timeout: float = 15) -> bool:
    """POSTs JSON. Never logs the URL, which holds a secret."""
    host = urlsplit(url).hostname or "?"
    request = Request(url, data=json.dumps(payload).encode(), headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=timeout):
            return True
    except HTTPError as error:
        log(f"webhook to {host} failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"webhook to {host} failed: {type(getattr(error, 'reason', error)).__name__}")
    return False


def email_recipients(raw: str) -> list[str]:
    """EMAIL_TO: names or addresses separated by commas, ';' or spaces. Empty means the server's administrators."""
    return [item for item in raw.replace(";", ",").replace(" ", ",").split(",") if item] or ["administrators"]


def send_email(api_url: str, api_key: str, recipients: list[str], subject: str, text: str, timeout: float = 15) -> bool | None:
    """Emails through the server's SMTP with the notify:email permission.

    True: sent. None: email is not available (no key because the permission is not approved, SMTP not set up, or
    a recipient the server refuses), so retrying would not help. False: a temporary failure; try again later.
    Never logs the key.
    """
    if not api_url or not api_key:
        return None
    body = json.dumps({"to": recipients, "subject": subject, "text": text}).encode()
    request = Request(api_url.rstrip("/") + "/api/notify/email", data=body, method="POST",
                      headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout):
            return True
    except HTTPError as error:
        if error.code in (400, 403, 404, 409):
            log(f"email not sent: HTTP {error.code} (is notify:email approved and SMTP set up?)")
            return None
        log(f"email failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"email failed: {type(getattr(error, 'reason', error)).__name__}")
    return False


def deliver(results: list[bool | None]) -> bool:
    """An alert counts as delivered when any channel took it, or when no channel is available (the log and page show it).
    It is retried on the next run only when every available channel failed, so a working channel is not repeated."""
    available = [r for r in results if r is not None]
    return True if not available else any(available)


class App:
    def __init__(self, env=None, now=time.time, post=post_webhook, email=None):
        env = os.environ if env is None else env
        self.now, self.post = now, post
        self.email = email or send_email
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        self.webhook = env.get("WEBHOOK_URL", "").strip()
        self.api_url = env.get("AUTOMATON_API_URL", "").strip()
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.email_to = email_recipients(env.get("EMAIL_TO", ""))
        interval = env.get("CHECK_INTERVAL_SECONDS", "").strip()
        self.interval = int(interval) if interval.isdigit() and 5 <= int(interval) <= 3600 else 30
        self.path = os.path.join(env.get("AUTOMATON_APP_DATA_DIR", "data"), "checks.json")
        self.lock = threading.Lock()
        self.checks = heartbeat.load_checks(self.path)

    # --- alerts -------------------------------------------------------------------------------------------------
    def send(self, event: str, text: str, name: str) -> bool:
        log(text)
        results: list[bool | None] = []
        if self.webhook:
            # "text" is Slack and Telegram, "content" is Discord; the other fields are for generic receivers.
            results.append(self.post(self.webhook, {"text": text, "content": text, "event": event, "check": name}))
        results.append(self.email(self.api_url, self.api_key, self.email_to, f"{event}: {name}", text))
        return deliver(results)

    def check_overdue(self) -> int:
        """Finds overdue checks and sends their alerts. The webhook is called without the lock, so a slow or
        failing webhook never delays check-ins."""
        with self.lock:
            plan = heartbeat.plan_alerts(self.checks, self.now())
        delivered = [(check_id, event) for check_id, event, text, name in plan if self.send(event, text, name)]
        if delivered:
            with self.lock:
                for check_id, event in delivered:
                    check = next((c for c in self.checks if c["id"] == check_id), None)
                    if check:
                        heartbeat.confirm(check, event)
                heartbeat.save_checks(self.path, self.checks)
        return len(delivered)

    def loop(self) -> None:
        while True:
            try:
                self.check_overdue()
            except Exception as error:  # keep watching whatever happens
                log(f"pass failed: {type(error).__name__}: {error}")
            time.sleep(self.interval)

    # --- operations used by the handler -------------------------------------------------------------------------
    def ping(self, token: str) -> bool:
        with self.lock:
            check = heartbeat.find_by_token(self.checks, token)
            if not check:
                return False
            heartbeat.record_ping(check, self.now())
            heartbeat.save_checks(self.path, self.checks)
            return True

    def authorized(self, header: str) -> bool:
        if len(self.admin_token) < MIN_ADMIN_TOKEN:
            return False
        given = header[7:] if header.startswith("Bearer ") else ""
        return hmac.compare_digest(given.encode(), self.admin_token.encode())

    def list_checks(self) -> list[dict]:
        with self.lock:
            now = self.now()
            return [heartbeat.public_view(c, now) for c in self.checks]

    def create(self, body: dict) -> dict:
        with self.lock:
            check = heartbeat.new_check(body.get("name"), body.get("period"), body.get("grace"), self.now(), self.checks)
            self.checks.append(check)
            heartbeat.save_checks(self.path, self.checks)
            return heartbeat.public_view(check, self.now())

    def delete(self, check_id: str) -> bool:
        with self.lock:
            kept = [c for c in self.checks if c["id"] != check_id]
            if len(kept) == len(self.checks):
                return False
            self.checks = kept
            heartbeat.save_checks(self.path, self.checks)
            return True


def make_handler(app: App, page: bytes):
    class Handler(BaseHTTPRequestHandler):
        server_version = "heartbeat"

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
            """True when the admin API may be used; otherwise the answer has been sent."""
            if len(app.admin_token) < MIN_ADMIN_TOKEN:
                self.json(503, {"error": f"Set the ADMIN_TOKEN secret (at least {MIN_ADMIN_TOKEN} characters) to manage checks"})
                return False
            if not app.authorized(self.headers.get("Authorization", "")):
                time.sleep(0.5)  # slows guessing
                self.json(401, {"error": "Wrong or missing admin token"})
                return False
            return True

        def route(self):
            path = urlsplit(self.path).path
            parts = path.strip("/").split("/")
            if parts[0] == "ping" and len(parts) == 2 and self.command in ("GET", "POST", "HEAD"):
                if app.ping(parts[1]):
                    self.reply(200, b"OK", "text/plain")
                else:
                    self.reply(404, b"unknown check", "text/plain")
            elif path == "/health":
                self.reply(200, b"ok", "text/plain")
            elif path == "/" and self.command in ("GET", "HEAD"):
                self.reply(200, page, "text/html; charset=utf-8")
            elif path in ("/ui/app.css", "/ui/app.js", "/heartbeat.css") and self.command in ("GET", "HEAD"):
                asset = Path(__file__).parent / path.lstrip("/")
                self.reply(200, asset.read_bytes(), "text/css" if path.endswith(".css") else "text/javascript")
            elif parts[0] == "api" and parts[1:2] == ["checks"]:
                self.api(parts[2:])
            else:
                self.reply(404, b"not found", "text/plain")

        def api(self, rest: list[str]):
            if not self.guard():
                return
            if not rest and self.command == "GET":
                self.json(200, app.list_checks())
            elif not rest and self.command == "POST":
                try:
                    length = int(self.headers.get("Content-Length", 0))
                    if length < 0 or length > MAX_BODY:
                        return self.json(413, {"error": "request too large"})
                    body = json.loads(self.rfile.read(length) or b"{}")
                    if not isinstance(body, dict):
                        raise ValueError
                except ValueError:
                    return self.json(400, {"error": "send a JSON object"})
                try:
                    self.json(201, app.create(body))
                except heartbeat.InvalidInput as error:
                    self.json(400, {"error": str(error)})
            elif len(rest) == 1 and self.command == "DELETE":
                if app.delete(rest[0]):
                    self.reply(204)
                else:
                    self.json(404, {"error": "no such check"})
            else:
                self.json(405, {"error": "method not allowed"})

        do_GET = do_POST = do_HEAD = do_DELETE = route

        def log_message(self, *args):  # request lines hold check-in tokens
            pass
    return Handler


def main() -> int:
    try:
        app = App()
    except heartbeat.CorruptState as error:
        log(f"cannot start: {error}")
        return 1
    if len(app.admin_token) < MIN_ADMIN_TOKEN:
        log(f"ADMIN_TOKEN is not set (or shorter than {MIN_ADMIN_TOKEN} characters): checks cannot be managed, existing check-ins still work")
    page = (Path(__file__).parent / "index.html").read_bytes()
    threading.Thread(target=app.loop, daemon=True).start()
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Heartbeat listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app, page)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
