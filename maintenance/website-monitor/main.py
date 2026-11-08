#!/usr/bin/env python3
"""Website Monitor: checks your sites on an interval and sends one alert per outage.

Runs as an Automaton app (a small status page plus a background check loop), or from a terminal:
  python3 main.py --once      run one check cycle, print the results and exit (exit code 1 if a site is down)
"""

from __future__ import annotations

from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import monitor

MIN_INTERVAL = 60


def env_int(env, name: str, default: int, minimum: int, maximum: int) -> int:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    if not raw.isdigit() or not minimum <= int(raw) <= maximum:
        raise monitor.ConfigError(f"{name} must be a number from {minimum} to {maximum}")
    return int(raw)


def state_path(env) -> str:
    return os.path.join(env.get("AUTOMATON_APP_DATA_DIR", "data"), "state.json")


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.sites = monitor.parse_sites(env.get("SITES", ""))
        self.interval = env_int(env, "CHECK_INTERVAL_SECONDS", 300, MIN_INTERVAL, 86400)
        self.warn_days = env_int(env, "CERT_WARN_DAYS", 14, 1, 365)
        self.timeout = env_int(env, "TIMEOUT_SECONDS", 10, 1, 60)
        self.webhook = env.get("WEBHOOK_URL", "").strip()
        self.heartbeat = env.get("HEARTBEAT_URL", "").strip()


def post(url: str, payload: dict | None, timeout: float = 15) -> bool:
    """Sends a webhook (POST JSON) or a heartbeat ping (GET when payload is None). Never logs the URL, which holds a secret."""
    host = urlsplit(url).hostname or "?"
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"User-Agent": monitor.USER_AGENT}
    if data is not None:
        headers["Content-Type"] = "application/json"
    try:
        with urlopen(Request(url, data=data, headers=headers), timeout=timeout):
            return True
    except HTTPError as error:
        log(f"request to {host} failed: HTTP {error.code}")
    except (URLError, OSError, ValueError) as error:
        log(f"request to {host} failed: {monitor.describe_error(error)}")
    return False


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


class Monitor:
    def __init__(self, settings: Settings | None = None, env=None):
        self.settings = settings
        self.path = state_path(os.environ if env is None else env)
        self.interval = settings.interval if settings else 300
        self.lock = threading.Lock()
        self.state = monitor.load_state(self.path)
        self.last_run: float | None = None
        self.last_error: str | None = None

    def send(self, event: str, text: str, site: str) -> bool:
        log(text)
        if not self.settings or not self.settings.webhook:
            return True  # nothing to deliver to; the status page still shows it
        # "text" is Slack and Telegram, "content" is Discord; the other fields are for generic receivers.
        return post(self.settings.webhook, {"text": text, "content": text, "event": event, "site": site})

    def run_once(self) -> bool:
        """One cycle. Returns True when it completed (checks done and state saved); then the heartbeat is pinged."""
        try:
            settings = self.settings = Settings()
            self.interval = settings.interval
            with self.lock:
                state = monitor.run_cycle(settings.sites, self.state, settings.warn_days, settings.timeout, self.send)
                monitor.save_state(self.path, state)
                self.state = state
                self.last_run, self.last_error = time.time(), None
        except Exception as error:  # a crashed run must not ping the heartbeat
            self.last_error = f"{type(error).__name__}: {error}"
            log(f"run failed: {self.last_error}")
            return False
        if settings.heartbeat:
            post(settings.heartbeat, None)
        return True

    def loop(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.interval)

    def snapshot(self) -> dict:
        with self.lock:
            sites = [{"site": monitor.display_url(url), **{k: s.get(k) for k in ("up", "status", "ms", "error", "cert_days", "since", "checked")}}
                     for url, s in self.state.items()]
        return {"lastRun": self.last_run, "lastError": self.last_error, "sites": sites}


def render(snapshot: dict) -> str:
    rows = []
    for site in snapshot["sites"]:
        state = "UP" if site["up"] else "DOWN"
        cert = "" if site["cert_days"] is None else f'{site["cert_days"]} days'
        detail = escape(site["error"] or "")
        pill = "ok" if site["up"] else "critical"
        rows.append(f'<tr><td class="a-mono">{escape(site["site"])}</td><td><span class="a-pill a-pill--{pill}">{state}</span></td>'
                    f'<td class="a-num">{site["ms"] if site["ms"] is not None else ""}</td><td>{cert}</td><td>{detail}</td></tr>')
    failure = f'<p class="a-note a-note--critical">Last run failed: {escape(snapshot["lastError"])}</p>' if snapshot["lastError"] else ""
    last = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(snapshot["lastRun"])) if snapshot["lastRun"] else "not yet"
    up = sum(bool(site["up"]) for site in snapshot["sites"])
    total = len(snapshot["sites"])
    overall = "critical" if snapshot["lastError"] or up < total else "ok" if total else ""
    label = "Needs attention" if overall == "critical" else "All good" if overall == "ok" else "No sites yet"
    table = f'<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Site</th><th>Status</th><th class="a-num">ms</th><th>Certificate</th><th>Detail</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>' if rows else '<div class="a-empty"><div class="a-empty__title">No sites yet</div>Add sites in the SITES setting.</div>'
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Website Monitor</title>
<link rel="stylesheet" href="ui/app.css"><script src="ui/app.js"></script></head>
<body><main class="a-page"><header class="a-header"><div class="a-brand" aria-hidden="true">&gt;_</div>
<div class="a-header__text"><h1 class="a-header__title">Website Monitor</h1><p class="a-header__sub">Last run: {last}</p></div>
<div class="a-header__actions"><span class="a-pill a-pill--large {f'a-pill--{overall}' if overall else ''}">{label}</span>
<button class="a-btn a-btn--icon" type="button" data-theme-toggle aria-label="Switch light or dark theme">&#9680;</button></div></header>
{failure}<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Sites</h2><span class="a-pill">{up} of {total} up</span></div>{table}</section>
<p class="a-footer">Refreshes every minute.</p></main><script src="ui/theme.js"></script></body></html>"""


def make_handler(app: Monitor):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/health":
                self.reply(200, "text/plain", b"ok")
            elif path == "/status.json":
                self.reply(200, "application/json", json.dumps(app.snapshot()).encode())
            elif path == "/":
                self.reply(200, "text/html; charset=utf-8", render(app.snapshot()).encode())
            elif path in ("/ui/app.css", "/ui/app.js", "/ui/theme.js"):
                asset = Path(__file__).parent / path.lstrip("/")
                self.reply(200, "text/css" if path.endswith(".css") else "text/javascript", asset.read_bytes())
            else:
                self.reply(404, "text/plain", b"not found")

        def reply(self, code: int, kind: str, body: bytes):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):  # request lines are noise
            pass
    return Handler


def main(argv: list[str]) -> int:
    if "--once" in argv:
        try:
            settings = Settings()
        except monitor.ConfigError as error:
            print(f"Configuration error: {error}", file=sys.stderr)
            return 2
        app = Monitor(settings)
        ok = app.run_once()
        for site in app.snapshot()["sites"]:
            print(("UP   " if site["up"] else "DOWN ") + site["site"], site["error"] or "", f'cert {site["cert_days"]}d' if site["cert_days"] is not None else "")
        return 0 if ok and all(s["up"] for s in app.snapshot()["sites"]) else 1
    app = Monitor()  # settings are parsed on every run, so a wrong setting shows on the status page instead of crashing the app
    threading.Thread(target=app.loop, daemon=True).start()
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Website Monitor listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
