"""HTTP server for Release Keeper."""

import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from github_sync import run_sync
from report import generate_daily_report
from store import Store

UI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
DATA_DIR = os.environ.get("DATA_DIR", "data")
DB_PATH = os.path.join(DATA_DIR, "release_keeper.db")

_SESSION_SECRET = secrets.token_hex(32)


def is_automaton_env() -> bool:
    return bool(os.environ.get("AUTOMATON_APP_ID") or os.environ.get("AUTOMATON_API_URL"))


def get_admin_token() -> str:
    return os.environ.get("RK_ADMIN_TOKEN", "").strip()


def _make_cookie_sig(token: str) -> str:
    return hmac.new(_SESSION_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()


class ReleaseKeeperHandler(BaseHTTPRequestHandler):
    store: Store = None  # type: ignore

    def log_message(self, format: str, *args) -> None:
        pass

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: str) -> None:
        if not os.path.isfile(path):
            self._send_json(404, {"error": "Not found"})
            return
        ctype, _ = mimetypes.guess_type(path)
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _is_authorized(self) -> bool:
        if is_automaton_env():
            return True
        admin_token = get_admin_token()
        if not admin_token:
            return True
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer ") and hmac.compare_digest(auth[7:].strip(), admin_token):
            return True
        cookie = self.headers.get("Cookie", "")
        expected = _make_cookie_sig(admin_token)
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "rk_session" and hmac.compare_digest(v, expected):
                return True
        return False

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._send_json(200, {"ok": True})
            return

        if path == "/":
            self._send_file(os.path.join(UI_DIR, "index.html"))
            return

        if path.startswith("/ui/"):
            rel = os.path.normpath(path[4:]).lstrip(os.sep)
            if ".." in rel:
                self._send_json(403, {"error": "Forbidden"})
                return
            self._send_file(os.path.join(UI_DIR, rel))
            return

        if path == "/api/auth/status":
            self._send_json(
                200,
                {
                    "authenticated": self._is_authorized(),
                    "requires_token": (not is_automaton_env()) and bool(get_admin_token()),
                    "viewer": self.headers.get("X-Automaton-Viewer-Login", "") if is_automaton_env() else "",
                },
            )
            return

        if not self._is_authorized():
            self._send_json(401, {"error": "Unauthorized"})
            return

        if path == "/api/now":
            rels = self.store.list_releases(limit=1, offset=0)
            reps = self.store.list_reports(limit=1, offset=0)
            less = self.store.list_lessons(f="open", limit=1, offset=0)
            self._send_json(
                200,
                {
                    "prod_version": self.store.get_meta("prod_version", "—"),
                    "test_version": self.store.get_meta("test_version", "—"),
                    "ready_count": rels["counts"].get("ready", 0),
                    "open_lessons": less["counts"].get("open", 0),
                    "needs_you": self.store.get_meta_json("needs_you", []),
                    "pipeline": self.store.get_meta_json(
                        "pipeline", {"Inbox": 0, "Ready": 0, "In progress": 0, "Verify": 0, "Done": 0}
                    ),
                    "latest_report": reps["items"][0] if reps["items"] else None,
                    "latest_release": rels["items"][0] if rels["items"] else None,
                    "last_sync_at": self.store.get_meta("last_sync_at", ""),
                    "last_sync_error": self.store.get_meta("last_sync_error", ""),
                },
            )
            return

        if path == "/api/releases":
            f = qs.get("f", ["all"])[0]
            q = qs.get("q", [""])[0]
            limit = min(100, max(1, int(qs.get("limit", ["20"])[0])))
            offset = max(0, int(qs.get("offset", ["0"])[0]))
            self._send_json(200, self.store.list_releases(f=f, q=q, limit=limit, offset=offset))
            return

        if path.startswith("/api/releases/"):
            ver = unquote(path[len("/api/releases/") :])
            rel = self.store.get_release(ver)
            if not rel:
                self._send_json(404, {"error": "Release not found"})
                return
            self._send_json(200, rel)
            return

        if path == "/api/reports":
            f = qs.get("f", ["all"])[0]
            q = qs.get("q", [""])[0]
            date = qs.get("date", [""])[0]
            limit = min(100, max(1, int(qs.get("limit", ["20"])[0])))
            offset = max(0, int(qs.get("offset", ["0"])[0]))
            self._send_json(200, self.store.list_reports(f=f, q=q, date=date, limit=limit, offset=offset))
            return

        if path.startswith("/api/reports/"):
            rid = unquote(path[len("/api/reports/") :])
            rep = self.store.get_report(rid)
            if not rep:
                self._send_json(404, {"error": "Report not found"})
                return
            self._send_json(200, rep)
            return

        if path == "/api/lessons":
            f = qs.get("f", ["all"])[0]
            area = qs.get("area", [""])[0]
            q = qs.get("q", [""])[0]
            limit = min(100, max(1, int(qs.get("limit", ["20"])[0])))
            offset = max(0, int(qs.get("offset", ["0"])[0]))
            self._send_json(200, self.store.list_lessons(f=f, area=area, q=q, limit=limit, offset=offset))
            return

        if path.startswith("/api/lessons/"):
            lid = unquote(path[len("/api/lessons/") :])
            les = self.store.get_lesson(lid)
            if not les:
                self._send_json(404, {"error": "Lesson not found"})
                return
            self._send_json(200, les)
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/login":
            body = self._read_json_body()
            token = str(body.get("token", "")).strip()
            admin_token = get_admin_token()
            if not admin_token or len(admin_token) < 16:
                self._send_json(400, {"error": "RK_ADMIN_TOKEN must be at least 16 characters"})
                return
            if not hmac.compare_digest(token, admin_token):
                time.sleep(1.0)
                self._send_json(401, {"error": "Invalid token"})
                return
            sig = _make_cookie_sig(admin_token)
            payload = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Set-Cookie", f"rk_session={sig}; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if not self._is_authorized():
            self._send_json(401, {"error": "Unauthorized"})
            return

        if path in ("/api/sync", "/actions/sync"):
            res = run_sync(self.store)
            self._send_json(200, res)
            return

        if path in ("/api/reports/generate", "/actions/daily-report"):
            body = self._read_json_body()
            kind = str(body.get("kind", "morning"))
            rep = generate_daily_report(self.store, kind=kind, send_email=True)
            self._send_json(200, rep)
            return

        if path.startswith("/api/lessons/") and path.endswith("/triage"):
            lid = unquote(path[len("/api/lessons/") : -len("/triage")])
            body = self._read_json_body()
            action = str(body.get("action", ""))
            les = self.store.triage_lesson(lid, action)
            if not les:
                self._send_json(404, {"error": "Lesson or action not found"})
                return
            self._send_json(200, les)
            return

        self._send_json(404, {"error": "Not found"})


def make_server(host: str = "0.0.0.0", port: int = 8080, db_path: str = DB_PATH) -> ThreadingHTTPServer:
    store = Store(db_path)

    class Handler(ReleaseKeeperHandler):
        pass

    Handler.store = store
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    srv = make_server("0.0.0.0", port, DB_PATH)
    print(f"Release Keeper listening on :{port}", flush=True)
    srv.serve_forever()
