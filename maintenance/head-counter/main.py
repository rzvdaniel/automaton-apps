#!/usr/bin/env python3
"""Count public release downloads without contacting installed servers."""
import datetime as dt
import hmac
import json
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

SERVER_INSTALLER = "install-automaton.sh"
CLI_INSTALLER = "install.sh"
BUNDLE = "automaton-server.tar.gz"
API = "https://api.github.com/repos/rzvdaniel/automaton/releases"
ROOT = Path(__file__).resolve().parent
UTC = dt.timezone.utc


def asset_kind(name):
    if name == SERVER_INSTALLER:
        return "server"
    if name == CLI_INSTALLER or (isinstance(name, str) and re.fullmatch(
            r"automaton-(?:linux|osx|win)-[a-z0-9_]+(?:\.exe)?", name)):
        return "cli"
    if name == BUNDLE:
        return "bundle"
    return None


def timestamp():
    return dt.datetime.now(UTC).isoformat(timespec="microseconds")


def fetch_releases():
    releases = {}
    for page in range(1, 10001):
        request = Request(f"{API}?per_page=100&page={page}", headers={
            "User-Agent": "automaton-head-counter", "Accept": "application/vnd.github+json"})
        with urlopen(request, timeout=30) as response:
            batch = json.load(response)
        if not isinstance(batch, list):
            raise ValueError("unexpected GitHub response")
        for release in batch:
            tag = release["tag_name"]
            if not tag.startswith("server-v") or release.get("draft"):
                continue
            counts = {}
            for asset in release["assets"]:
                if asset_kind(asset["name"]):
                    count = asset["download_count"]
                    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                        raise ValueError("invalid download count")
                    counts[asset["name"]] = count
            releases[tag.removeprefix("server-v")] = counts
        if len(batch) < 100:
            return releases
    raise ValueError("too many release pages")


class App:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        self.token = env.get("HEAD_COUNTER_TOKEN", "").strip()
        directory = Path(env.get("AUTOMATON_APP_DATA_DIR", "data"))
        directory.mkdir(parents=True, exist_ok=True)
        self.db = directory / "counter.sqlite3"
        self.lock = threading.RLock()
        self.error = None
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS snapshots (day TEXT PRIMARY KEY, at TEXT NOT NULL, counts TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS baseline (id INTEGER PRIMARY KEY CHECK(id = 1), at TEXT NOT NULL, counts TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS snapshots_v2 (day TEXT PRIMARY KEY, at TEXT NOT NULL, counts TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS baseline_v2 (id INTEGER PRIMARY KEY CHECK(id = 1), at TEXT NOT NULL, counts TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS ours (id INTEGER PRIMARY KEY, at TEXT NOT NULL, file TEXT NOT NULL,
                                                  version TEXT NOT NULL, source TEXT NOT NULL);
            """)
        os.chmod(self.db, 0o600)

    def connect(self):
        return sqlite3.connect(self.db, timeout=30)

    def token_ok(self, supplied, expected):
        value = supplied[7:] if supplied.lower().startswith("bearer ") else ""
        return len(expected) >= 16 and hmac.compare_digest(value.encode(), expected.encode())

    def may_manage(self, headers):
        if self.managed:
            return bool(headers.get("X-Automaton-Viewer-Role") and headers.get("X-Automaton-Viewer-Token"))
        return self.token_ok(headers.get("Authorization", ""), self.admin_token)

    def snapshot(self, counts, at=None):
        at = at or timestamp()
        with self.lock, self.connect() as db:
            db.execute("INSERT OR IGNORE INTO baseline_v2 VALUES (1, ?, ?)", (at, json.dumps(counts)))
            db.execute("INSERT OR REPLACE INTO snapshots_v2 VALUES (?, ?, ?)", (at[:10], at, json.dumps(counts)))
            self.error = None

    def refresh(self):
        try:
            counts = fetch_releases()
            self.snapshot(counts)
        except Exception as error:
            with self.lock:
                self.error = f"GitHub refresh failed ({type(error).__name__})"
            print(self.error, flush=True)

    def loop(self):
        while True:
            self.refresh()
            time.sleep(3600)

    def record(self, body):
        if not isinstance(body, dict):
            raise ValueError("send a JSON object")
        file, version, source = (body.get(k) for k in ("file", "version", "source"))
        if not asset_kind(file) or not isinstance(version, str) or not isinstance(source, str):
            raise ValueError("file must be a server installer, CLI installer, server bundle, or CLI binary; version and source are required")
        version = version.strip().removeprefix("server-v").removeprefix("v")
        source = source.strip()
        if not version or len(version) > 100 or not source or len(source) > 200:
            raise ValueError("version and source must be nonempty and at most 100 and 200 characters")
        with self.lock, self.connect() as db:
            db.execute("INSERT INTO ours(at, file, version, source) VALUES (?, ?, ?, ?)",
                       (timestamp(), file, version, source))

    def summary(self):
        with self.lock, self.connect() as db:
            snapshots = db.execute("SELECT at, counts FROM snapshots_v2 ORDER BY at").fetchall()
            baseline = db.execute("SELECT at, counts FROM baseline_v2 WHERE id = 1").fetchone()
            ours = db.execute("SELECT at, file, version, source FROM ours ORDER BY id DESC").fetchall()
            error = self.error
        result = {"observed_from": None, "updated_at": None, "error": error, "week_error": None, "github": [],
                  "week": None, "since_start": None,
                  "ours": [dict(zip(("at", "file", "version", "source"), row)) for row in ours[:100]]}
        if not snapshots:
            return result
        now = dt.datetime.now(UTC)
        monday = (now - dt.timedelta(days=now.weekday())).date().isoformat()
        first_at, first_raw = baseline
        latest_at, latest_raw = snapshots[-1]
        before_week = [row for row in snapshots if row[0][:10] < monday]
        week_at, week_raw = before_week[-1] if before_week else baseline
        latest = json.loads(latest_raw)
        result.update(observed_from=first_at, updated_at=latest_at)
        for version, counts in sorted(latest.items(), reverse=True):
            files = []
            for file, count in sorted(counts.items()):
                own = sum(1 for _, f, v, _ in ours if f == file and v == version)
                files.append({"file": file, "downloads": count, "ours": own, "others": max(0, count - own)})
            result["github"].append({
                "version": version, "files": files,
                "server_downloads": sum(f["downloads"] for f in files if asset_kind(f["file"]) == "server"),
                "cli_downloads": sum(f["downloads"] for f in files if asset_kind(f["file"]) == "cli"),
                "others_server": sum(f["others"] for f in files if asset_kind(f["file"]) == "server"),
                "others_cli": sum(f["others"] for f in files if asset_kind(f["file"]) == "cli")})

        def period(at, raw):
            baseline = json.loads(raw)
            rows = []
            for version, counts in sorted(latest.items(), reverse=True):
                old = baseline.get(version, {})
                values = {}
                for file, count in counts.items():
                    downloaded = max(0, count - old.get(file, 0))
                    own = sum(1 for when, f, v, _ in ours if at < when and f == file and v == version)
                    values[file] = max(0, downloaded - own)
                rows.append({"version": version,
                             "server_installs": sum(n for f, n in values.items() if asset_kind(f) == "server"),
                             "cli_installs": sum(n for f, n in values.items() if asset_kind(f) == "cli")})
            return {"from": at, "to": latest_at, "server_installs": sum(r["server_installs"] for r in rows),
                    "cli_installs": sum(r["cli_installs"] for r in rows), "releases": rows}
        sunday = (now - dt.timedelta(days=now.weekday() + 1)).date().isoformat()
        if latest_at[:10] < monday:
            result["week_error"] = "No snapshot this week."
        elif week_at[:10] < sunday:
            result["week_error"] = "No recent snapshot before this week; weekly counts are unavailable."
        else:
            result["week"] = period(week_at, week_raw)
            result["week"]["partial"] = week_at[:10] >= monday
        result["since_start"] = period(first_at, first_raw)
        return result


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def reply(self, status, data, content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def json(self, status, value):
            self.reply(status, json.dumps(value).encode())

        def guard(self, machine=False):
            ok = (app.token_ok(self.headers.get("Authorization", ""), app.token) if machine
                  else app.may_manage(self.headers))
            if not ok:
                time.sleep(0.5)
                self.json(401, {"error": "Authentication required", "mode": "signin" if app.managed and not machine else "token"})
            return ok

        def body(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 1 or size > 4096:
                    raise ValueError()
                return json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                raise ValueError("send a JSON object of at most 4096 bytes")

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/health":
                return self.reply(200, b"ok", "text/plain")
            if path in ("/", "/ui/app.css", "/ui/app.js", "/page.js"):
                filename = "index.html" if path == "/" else path[1:]
                kind = "text/html; charset=utf-8" if path == "/" else ("text/css" if path.endswith(".css") else "text/javascript")
                return self.reply(200, (ROOT / filename).read_bytes(), kind)
            if path in ("/summary.json", "/api/summary"):
                if self.guard(machine=path == "/summary.json"):
                    return self.json(200, app.summary())
                return
            self.json(404, {"error": "not found"})

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in ("/ours", "/api/manual"):
                return self.json(404, {"error": "not found"})
            if not self.guard(machine=path == "/ours"):
                return
            if path == "/api/manual" and self.headers.get("X-Head-Counter") != "1":
                return self.json(403, {"error": "missing X-Head-Counter header"})
            try:
                body = self.body()
                if path == "/api/manual" and isinstance(body, dict):
                    body["source"] = "manual"
                app.record(body)
            except ValueError as error:
                return self.json(400, {"error": str(error)})
            self.json(201, {"ok": True})

    return Handler


if __name__ == "__main__":
    app = App()
    threading.Thread(target=app.loop, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("AUTOMATON_PORT", "8080"))), make_handler(app)).serve_forever()
