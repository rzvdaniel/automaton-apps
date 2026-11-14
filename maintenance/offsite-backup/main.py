#!/usr/bin/env python3
"""Off-site Backup page: shows the newest server backup and lets an administrator start one now.
The upload itself is the `upload` Action, which runs every 15 minutes and sends any new copy to your bucket."""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import backup

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/backup.js": ("backup.js", "text/javascript; charset=utf-8"),
    "/ui/app.css": (os.path.join("ui", "app.css"), "text/css; charset=utf-8"),
    "/ui/app.js": (os.path.join("ui", "app.js"), "text/javascript; charset=utf-8"),
}
CODES = {"ok": 200, "forbidden": 403, "not_found": 404, "conflict": 409, "unavailable": 503, "no_key": 403, "not_configured": 404}


def make_handler(settings: backup.Settings):
    class Handler(BaseHTTPRequestHandler):
        server_version = "OffsiteBackup"

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

        def reply(self, result) -> None:
            status, data, message = result
            self.json(CODES.get(status, 502), {"status": status, "message": message, "data": data})

        def do_POST(self):  # noqa: N802
            # A page of this app sets this header; a form on another site cannot.
            if urlsplit(self.path).path != "/api/backup" or self.headers.get("X-Offsite-Backup") != "1":
                return self.json(404, {"error": "Not found"})
            self.reply(backup.run_backup(settings, self.headers.get("X-Automaton-Viewer-Token")))

        def do_GET(self):  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/health":
                return self.send_body(200, b"ok", "text/plain")
            if path == "/api/state":
                status, data, message = backup.backups(settings)
                administrator = self.headers.get("X-Automaton-Viewer-Role") == "administrator"
                return self.json(CODES.get(status, 502), {"status": status, "message": message, "data": data, "administrator": administrator})
            entry = STATIC.get(path)
            if not entry:
                return self.json(404, {"error": "Not found"})
            try:
                with open(os.path.join(HERE, entry[0]), "rb") as handle:
                    return self.send_body(200, handle.read(), entry[1])
            except OSError:
                return self.json(404, {"error": "Not found"})

    return Handler


def main() -> int:
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(backup.Settings())).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
