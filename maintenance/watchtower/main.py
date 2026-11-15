#!/usr/bin/env python3
"""Watchtower: watchers run on a schedule, alerts are de-duplicated, emailed once and can be muted.

  /api/...                        the page's API (needs the ADMIN_TOKEN as a Bearer token)
  GET|POST /mute/<token>          the link in an alert email: a page with a Mute button (open path, no sign-in)
"""

from __future__ import annotations

import hmac
import html
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

import watchtower

USER_AGENT = "automaton-watchtower"
MIN_ADMIN_TOKEN = 16
MAX_BODY = 4096


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


def email_recipients(raw: str) -> list[str]:
    return [item for item in raw.replace(";", ",").replace(" ", ",").split(",") if item] or ["administrators"]


def send_email(api_url: str, api_key: str, recipients: list[str], subject: str, text: str, timeout: float = 15) -> bool | None:
    """Emails through the server's SMTP with the notify:email permission.

    True: sent. None: email is not available (permission not approved, SMTP not set up, refused recipient), so
    retrying would not help. False: a temporary failure; try again later. Never logs the key.
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
        if error.code in (400, 403, 404, 409, 429):
            log(f"email not sent: HTTP {error.code} (is notify:email approved and SMTP set up?)")
            return None
        log(f"email failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"email failed: {type(getattr(error, 'reason', error)).__name__}")
    return False


class App:
    def __init__(self, env=None, now=time.time, email=None):
        env = os.environ if env is None else env
        self.now = now
        self.email = email or send_email
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        self.public_url = env.get("PUBLIC_URL", "").strip().rstrip("/")
        self.api_url = env.get("AUTOMATON_API_URL", "").strip()
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.email_to = email_recipients(env.get("EMAIL_TO", ""))
        interval = env.get("CHECK_INTERVAL_SECONDS", "").strip()
        self.interval = int(interval) if interval.isdigit() and 5 <= int(interval) <= 3600 else 10
        self.path = os.path.join(env.get("AUTOMATON_APP_DATA_DIR", "data"), "state.json")
        self.lock = threading.Lock()
        self.pass_lock = threading.Lock()  # one pass at a time, so an alert is never emailed twice
        self.state = watchtower.load_state(self.path)

    def mute_url(self, alert: dict) -> str | None:
        return f"{self.public_url}/mute/{alert['token']}" if self.public_url else None

    def run_pass(self, force: bool = False) -> int:
        with self.pass_lock:
            return self._run_pass(force)

    def _run_pass(self, force: bool) -> int:
        """Runs due watchers, then emails alerts that were never emailed and are not muted. Email is sent without the lock."""
        with self.lock:
            watchtower.run_watchers(self.state, self.now(), force=force, log=log)
            plan = [(a["id"], a["title"], watchtower.message(a, self.mute_url(a))) for a in watchtower.pending(self.state, self.now())]
            watchtower.save_state(self.path, self.state)
        sent = []
        for alert_id, title, text in plan:
            log(f"alert: {title}")
            # Not delivered only when email failed temporarily (False); None means email is unavailable, so the log and page are it.
            if self.email(self.api_url, self.api_key, self.email_to, f"[Watchtower] {title}", text) is not False:
                sent.append(alert_id)
        if sent:
            with self.lock:
                for alert in self.state["alerts"]:
                    if alert["id"] in sent and alert["notified_at"] is None:
                        watchtower.confirm(alert, self.now())
                watchtower.save_state(self.path, self.state)
        return len(sent)

    def loop(self) -> None:
        while True:
            try:
                self.run_pass()
            except Exception as error:  # keep watching whatever happens
                log(f"pass failed: {type(error).__name__}: {error}")
            time.sleep(self.interval)

    def authorized(self, header: str) -> bool:
        if len(self.admin_token) < MIN_ADMIN_TOKEN:
            return False
        given = header[7:] if header.startswith("Bearer ") else ""
        return hmac.compare_digest(given.encode(), self.admin_token.encode())

    def view(self) -> dict:
        with self.lock:
            return watchtower.public_state(self.state, self.now())

    def change(self, action):
        """Runs `action(state, now)` under the lock and saves the result."""
        with self.lock:
            result = action(self.state, self.now())
            watchtower.save_state(self.path, self.state)
            return result


MUTE_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Watchtower</title>
<style>body{{color-scheme:light dark;font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem}}button{{font:inherit;padding:.5rem 1rem}}</style></head>
<body><h1>Watchtower</h1><p>{text}</p>{form}</body></html>"""


def make_handler(app: App, page: bytes):
    class Handler(BaseHTTPRequestHandler):
        server_version = "watchtower"

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
                body = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
                return body
            except ValueError:
                self.json(400, {"error": "send a JSON object"})
                return None

        def guard(self) -> bool:
            if len(app.admin_token) < MIN_ADMIN_TOKEN:
                self.json(503, {"error": f"Set the ADMIN_TOKEN secret (at least {MIN_ADMIN_TOKEN} characters) to use Watchtower"})
                return False
            if not app.authorized(self.headers.get("Authorization", "")):
                time.sleep(0.5)  # slows guessing
                self.json(401, {"error": "Wrong or missing admin token"})
                return False
            return True

        def route(self):
            path = urlsplit(self.path).path
            parts = path.strip("/").split("/")
            if parts[0] == "mute" and len(parts) == 2 and self.command in ("GET", "POST"):
                self.mute_page(parts[1])
            elif path == "/health":
                self.reply(200, b"ok", "text/plain")
            elif path == "/" and self.command in ("GET", "HEAD"):
                self.reply(200, page, "text/html; charset=utf-8")
            elif path in ("/ui/app.css", "/ui/app.js", "/watchtower.css") and self.command in ("GET", "HEAD"):
                asset = Path(__file__).parent / path.lstrip("/")
                self.reply(200, asset.read_bytes(), "text/css" if path.endswith(".css") else "text/javascript")
            elif parts[0] == "api":
                self.api(parts[1:])
            else:
                self.reply(404, b"not found", "text/plain")

        def mute_page(self, token: str):
            """GET only shows the page, because mail scanners open links; the Mute button POSTs."""
            html_type = "text/html; charset=utf-8"
            with app.lock:
                alert = watchtower.find_by_token(app.state, token)
                title = alert["title"] if alert else None
            if not alert:
                return self.reply(404, MUTE_PAGE.format(text="This mute link is not valid.", form="").encode(), html_type)
            hours = watchtower.DEFAULT_MUTE_HOURS
            if self.command == "GET":
                form = f'<form method="post"><button>Mute for {hours} hours</button></form>'
                return self.reply(200, MUTE_PAGE.format(text=html.escape(title), form=form).encode(), html_type)
            def act(state, now):
                found = watchtower.find_by_token(state, token)
                if found:
                    watchtower.mute(found, hours, now)
                return found
            if not app.change(act):
                return self.reply(404, MUTE_PAGE.format(text="This mute link is not valid.", form="").encode(), html_type)
            self.reply(200, MUTE_PAGE.format(text=f"Muted for {hours} hours: {html.escape(title)}", form="").encode(), html_type)

        def api(self, rest: list[str]):
            if not self.guard():
                return
            command = self.command
            if rest == ["state"] and command == "GET":
                self.json(200, app.view())
            elif rest == ["run"] and command == "POST":
                self.json(200, {"sent": app.run_pass(force=True)})
            elif rest == ["dummy"] and command == "POST":
                body = self.body()
                if body is None:
                    return
                if not isinstance(body.get("on"), bool):
                    return self.json(400, {"error": "send {\"on\": true or false}"})
                app.change(lambda state, now: state.update(dummy=body["on"]))
                app.run_pass(force=True)
                self.json(200, app.view())
            elif len(rest) == 2 and rest[0] == "rules" and command == "PUT":
                body = self.body()
                if body is None:
                    return
                try:
                    app.change(lambda state, now: watchtower.set_rule(state, rest[1], body))
                except KeyError:
                    return self.json(404, {"error": "no such watcher"})
                except watchtower.InvalidInput as error:
                    return self.json(400, {"error": str(error)})
                self.json(200, app.view())
            elif len(rest) == 3 and rest[0] == "alerts" and rest[2] == "mute" and command in ("POST", "DELETE"):
                body = self.body() if command == "POST" else {}
                if body is None:
                    return

                def act(state, now):
                    alert = next((a for a in state["alerts"] if a["id"] == rest[1]), None)
                    if alert is None:
                        raise KeyError(rest[1])
                    if command == "POST":
                        watchtower.mute(alert, body.get("hours", watchtower.DEFAULT_MUTE_HOURS), now)
                    else:
                        watchtower.unmute(alert)
                try:
                    app.change(act)
                except KeyError:
                    return self.json(404, {"error": "no such alert"})
                except watchtower.InvalidInput as error:
                    return self.json(400, {"error": str(error)})
                self.json(200, app.view())
            else:
                self.json(404, {"error": "not found"})

        do_GET = do_POST = do_HEAD = do_PUT = do_DELETE = route

        def log_message(self, *args):  # request lines hold mute tokens
            pass
    return Handler


def main() -> int:
    try:
        app = App()
    except watchtower.CorruptState as error:
        log(f"cannot start: {error}")
        return 1
    if len(app.admin_token) < MIN_ADMIN_TOKEN:
        log(f"ADMIN_TOKEN is not set (or shorter than {MIN_ADMIN_TOKEN} characters): the page and API are locked")
    page = (Path(__file__).parent / "index.html").read_bytes()
    threading.Thread(target=app.loop, daemon=True).start()
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Watchtower listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app, page)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
