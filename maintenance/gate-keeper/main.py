#!/usr/bin/env python3
"""Gate Keeper: who fail2ban has banned and why, read-only.

Inside Automaton the page sits behind Automaton's sign-in and reads bans through the security:read permission.
On its own it reads fail2ban's database (mounted read-only) and needs an ADMIN_TOKEN:
  python3 main.py --once      read the bans once, print them as JSON and exit
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import gate

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_SECONDS = 20  # the Runner reports every 5 minutes; refreshing the page must not hammer the server
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/gate.css": ("gate.css", "text/css; charset=utf-8"),
    "/gate.js": ("gate.js", "text/javascript; charset=utf-8"),
    "/ui/app.css": (os.path.join("ui", "app.css"), "text/css; charset=utf-8"),
    "/ui/app.js": (os.path.join("ui", "app.js"), "text/javascript; charset=utf-8"),
}


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


class Gate:
    def __init__(self, env=None):
        self.settings = gate.Settings(env)
        self.lock = threading.Lock()
        self.cached: tuple[float, dict] | None = None

    def state(self) -> dict:
        with self.lock:
            now = time.time()
            if self.cached and now - self.cached[0] < CACHE_SECONDS:
                return self.cached[1]
            read = gate.read_server if self.settings.managed else gate.read_database
            status, figures, message = read(self.settings, now)
            if status != "ok":
                log(f"no figures: {status}: {message}")
            self.cached = (now, gate.view(status, figures, message, now))
            return self.cached[1]

    def allowed(self, headers) -> bool:
        """Inside Automaton the platform proxy has signed the visitor in. Outside it anyone could send those
        headers, so they are ignored and the ADMIN_TOKEN is required (and without one nothing is shown)."""
        if self.settings.managed:
            return True
        token = self.settings.admin_token
        auth = headers.get("Authorization") or ""
        supplied = auth[7:] if auth.lower().startswith("bearer ") else ""
        return len(token) >= gate.MIN_ADMIN_TOKEN and hmac.compare_digest(supplied.encode(), token.encode())


def make_handler(app: Gate):
    class Handler(BaseHTTPRequestHandler):
        server_version = "GateKeeper"

        def log_message(self, format, *args):
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

        def do_GET(self):  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/health":
                return self.send_body(200, b"ok", "text/plain")
            if path in ("/api/state", "/api/home-card", "/api/mode"):
                if path == "/api/mode":  # lets the page ask for the token before it has any figures
                    return self.json(200, {"managed": app.settings.managed,
                                           "tokenSet": len(app.settings.admin_token) >= gate.MIN_ADMIN_TOKEN})
                if not app.allowed(self.headers):
                    time.sleep(0.5)  # slows guessing
                    usable = len(app.settings.admin_token) >= gate.MIN_ADMIN_TOKEN
                    return self.json(401, {"error": "Wrong or missing admin token" if usable else
                                           f"Set ADMIN_TOKEN (at least {gate.MIN_ADMIN_TOKEN} characters) to open Gate Keeper outside Automaton"})
                state = app.state()
                return self.json(200, gate.build_card(state) if path == "/api/home-card" else state)
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
    app = Gate()
    if "--once" in argv:
        state = app.state()
        print(json.dumps(state, indent=2))
        return 0 if state["status"] == "ok" else 1
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Gate Keeper listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
