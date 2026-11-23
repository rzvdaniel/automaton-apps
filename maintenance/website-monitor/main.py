#!/usr/bin/env python3
"""Website Monitor: checks your sites on an interval and sends one alert per outage.

Runs as an Automaton app (a small status page plus a background check loop), or from a terminal:
  python3 main.py --once      run one check cycle, print the results and exit (exit code 1 if a site is down)
"""

from __future__ import annotations

from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import hmac
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

import monitor

MIN_INTERVAL = 60
MIN_ADMIN_TOKEN = 16


def env_int(env, name: str, default: int, minimum: int, maximum: int) -> int:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    if not raw.isdigit() or not minimum <= int(raw) <= maximum:
        raise monitor.ConfigError(f"{name} must be a number from {minimum} to {maximum}")
    return int(raw)


def data_path(env, name: str) -> str:
    return os.path.join(env.get("AUTOMATON_APP_DATA_DIR", "data"), name)


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.interval = env_int(env, "CHECK_INTERVAL_SECONDS", 300, MIN_INTERVAL, 86400)
        self.warn_days = env_int(env, "CERT_WARN_DAYS", 14, 1, 365)
        self.timeout = env_int(env, "TIMEOUT_SECONDS", 10, 1, 60)
        self.webhook = env.get("WEBHOOK_URL", "").strip()
        self.heartbeat = env.get("HEARTBEAT_URL", "").strip()
        self.api_url = env.get("AUTOMATON_API_URL", "").strip()
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.email_to = email_recipients(env.get("EMAIL_TO", ""))


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
                      headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "User-Agent": monitor.USER_AGENT})
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


def deliver(results: list[bool | None]) -> bool:
    """An alert counts as delivered when any channel took it, or when no channel is available (the log and page show it).
    It is retried on the next run only when every available channel failed, so a working channel is not repeated."""
    available = [r for r in results if r is not None]
    return True if not available else any(available)


class Monitor:
    def __init__(self, settings: Settings | None = None, env=None):
        self.settings = settings
        env = os.environ if env is None else env
        self.path = data_path(env, "state.json")
        self.sites_path = data_path(env, "sites.json")
        self.history_path = data_path(env, "history.json")
        self.sites = monitor.load_sites(self.sites_path, env.get("SITES", ""))  # SITES: the old setting, imported once
        self.wake = threading.Event()
        self.sites_lock = threading.Lock()
        # The platform sets AUTOMATON_APP_ID for every app it runs; only then are its viewer headers to be trusted.
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        self.interval = settings.interval if settings else 300
        self.lock = threading.Lock()
        self.state = monitor.load_state(self.path)
        self.history = monitor.load_history(self.history_path)
        self.last_run: float | None = None
        self.last_error: str | None = None

    def send(self, event: str, text: str, site: str) -> bool:
        log(text)
        settings = self.settings
        if not settings:
            return True
        results: list[bool | None] = []
        if settings.webhook:
            # "text" is Slack and Telegram, "content" is Discord; the other fields are for generic receivers.
            results.append(post(settings.webhook, {"text": text, "content": text, "event": event, "site": site}))
        results.append(send_email(settings.api_url, settings.api_key, settings.email_to, f"{event.replace('_', ' ')}: {site}", text))
        return deliver(results)

    def run_once(self) -> bool:
        """One cycle. Returns True when it completed (checks done and state saved); then the heartbeat is pinged."""
        try:
            settings = self.settings = Settings()
            self.interval = settings.interval
            with self.lock:
                state = monitor.run_cycle(monitor.to_sites(self.sites), self.state, settings.warn_days, settings.timeout, self.send)
                monitor.save_state(self.path, state)
                self.state = state
                self.history = monitor.add_history(self.history, state, time.time())
                monitor.save_state(self.history_path, {"points": self.history})
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
            self.wake.wait(self.interval)
            self.wake.clear()

    def snapshot(self) -> dict:
        with self.lock, self.sites_lock:
            sites = []
            for record in self.sites:
                s = self.state.get(record["url"], {})
                sites.append({"id": record["id"], "site": monitor.display_url(record["url"]), "expected": record.get("status"),
                              "keyword": record.get("keyword"), "up": s.get("up"), "pending": not s,
                              **{k: s.get(k) for k in ("status", "ms", "error", "cert_days", "since", "checked")}})
        return {"lastRun": self.last_run, "lastError": self.last_error, "sites": sites, "history": self.history}

    def edit(self, action: str, fields: dict[str, str]) -> str | None:
        """Adds, edits or removes a site. Returns an error text, or None when done."""
        with self.sites_lock:
            sites = list(self.sites)
            index = next((i for i, s in enumerate(sites) if s["id"] == fields.get("id")), None)
            if action == "remove":
                if index is None:
                    return "That site no longer exists."
                del sites[index]
            else:
                try:
                    site = monitor.make_site(fields.get("url", ""), fields.get("status"), fields.get("keyword"))
                except monitor.ConfigError as error:
                    return str(error)
                if blocked_target(site.url):
                    return "That address points at this server itself, so it can't be monitored."
                if action == "edit" and index is None:
                    return "That site no longer exists."
                if any(s["url"] == site.url and i != index for i, s in enumerate(sites)):
                    return "That site is already listed."
                if action == "add":
                    if len(sites) >= monitor.MAX_SITES:
                        return f"At most {monitor.MAX_SITES} sites are supported."
                    sites.append(monitor.site_record(site))
                else:
                    sites[index] = {**sites[index], "url": site.url, "status": site.expected_status, "keyword": site.keyword}
            monitor.save_state(self.sites_path, sites)
            self.sites = sites
        self.wake.set()  # check the change now instead of at the next interval
        return None


def site_row(site: dict, token_field: str = "") -> str:
    pill = "" if site["pending"] else ("ok" if site["up"] else "critical")
    state = "Checking…" if site["pending"] else "UP" if site["up"] else "DOWN"
    cert = "" if site["cert_days"] is None else f'{site["cert_days"]} days'
    ms = "" if site["ms"] is None else site["ms"]
    sid = escape(site["id"], quote=True)
    edit = (f'<details><summary class="a-btn">Edit</summary><form class="a-form" method="post" action="sites/edit">'
            f'<input type="hidden" name="id" value="{sid}">{site_fields(site["site"], site["expected"], site["keyword"])}{token_field}'
            f'<button class="a-btn a-btn--primary" type="submit">Save</button></form></details>')
    remove = f'<form method="post" action="sites/remove"><input type="hidden" name="id" value="{sid}">{token_field}<button class="a-btn" type="submit">Remove</button></form>'
    return (f'<tr><td class="a-mono">{escape(site["site"])}</td><td><span class="a-pill a-pill--{pill}">{state}</span></td>'
            f'<td class="a-num">{ms}</td><td>{cert}</td><td>{escape(site["error"] or "")}</td>'
            f'<td><div style="display:flex;gap:8px;align-items:flex-start">{edit}{remove}</div></td></tr>')


def site_fields(url: str = "", expected=None, keyword=None) -> str:
    return (f'<label class="a-field">Address<input class="a-input" name="url" type="url" required maxlength="2000" placeholder="https://example.com" value="{escape(url, quote=True)}"></label>'
            f'<label class="a-field">Expected status (optional)<input class="a-input" name="status" inputmode="numeric" maxlength="3" placeholder="any below 400" value="{"" if expected is None else expected}"></label>'
            f'<label class="a-field">Keyword the page must contain (optional)<input class="a-input" name="keyword" maxlength="200" value="{escape(keyword or "", quote=True)}"></label>')


TOKEN_FIELD = '<label class="a-field">Admin token<input class="a-input" name="admin_token" type="password" autocomplete="off" required></label>'


def render(snapshot: dict, error: str = "", standalone: bool = False) -> str:
    token_field = TOKEN_FIELD if standalone else ""
    rows = [site_row(site, token_field) for site in snapshot["sites"]]
    failure = f'<p class="a-note a-note--critical">Last run failed: {escape(snapshot["lastError"])}</p>' if snapshot["lastError"] else ""
    problem = f'<p class="a-note a-note--critical" role="alert">{escape(error)}</p>' if error else ""
    last = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(snapshot["lastRun"])) if snapshot["lastRun"] else "not yet"
    checked = [site for site in snapshot["sites"] if not site["pending"]]
    up = sum(bool(site["up"]) for site in checked)
    total = len(snapshot["sites"])
    overall = "critical" if snapshot["lastError"] or up < len(checked) else "ok" if checked else ""
    label = "Needs attention" if overall == "critical" else "All good" if overall == "ok" else "No sites yet" if not total else "Checking…"
    table = f'<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Site</th><th>Status</th><th class="a-num">ms</th><th>Certificate</th><th>Detail</th><th></th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>' if rows else '<div class="a-empty"><div class="a-empty__title">Add your first site</div>Enter its address below. It is checked right away.</div>'
    add = (f'<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Add a site</h2></div>{problem}'
           f'<form class="a-form" method="post" action="sites/add">{site_fields()}{token_field}<div><button class="a-btn a-btn--primary" type="submit">Add site</button></div></form></section>')
    return f"""<!doctype html><html lang="en" data-look="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Website Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="ui/app.css"><script src="ui/app.js"></script></head>
<body><header class="a-topbar"><div class="a-topbar__inner"><div style="display:flex;gap:12px;align-items:center"><svg class="a-brand" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10"/><path d="M10 15l5 4-5 4M30 15l-5 4 5 4M17 27h6"/></svg>
<div><h1 class="a-header__title">Website Monitor</h1><p class="a-header__sub">Last run: {last}</p></div></div>
<div class="a-header__actions"><span class="a-pill a-pill--large {f'a-pill--{overall}' if overall else ''}">{label}</span>
<button class="a-btn a-btn--icon" type="button" data-theme-toggle aria-label="Switch light or dark theme">&#9680;</button></div></div></header>
<main class="a-page">{failure}<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Sites</h2><span class="a-pill">{up} of {total} up</span></div>{table}</section>
{add}<p class="a-footer">Refreshes every minute.</p></main><script src="ui/theme.js"></script><script src="ui/page.js"></script></body></html>"""


def blocked_target(url: str) -> bool:
    """True for an address that points at the server itself: localhost, loopback, link-local or unspecified IPs (cloud metadata sits at 169.254.169.254)."""
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    if host == "localhost" or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        try:
            ip = ipaddress.ip_address(socket.inet_ntoa(socket.inet_aton(host)))  # numeric forms such as 127.1, 2130706433, 0x7f000001
        except OSError:
            return False
    ip = ip.ipv4_mapped or ip if isinstance(ip, ipaddress.IPv6Address) else ip
    return ip.is_loopback or ip.is_link_local or ip.is_unspecified


def signed_in(headers) -> bool:
    """The platform proxy sets both viewer headers for a signed-in user and replaces any the client sent."""
    return bool(headers.get("X-Automaton-Viewer-Role")) and bool(headers.get("X-Automaton-Viewer-Token"))


def may_manage(app: Monitor, headers, form: dict) -> bool:
    """Run by Automaton, the proxy's sign-in decides. Run anywhere else, anyone could forge the viewer headers, so
    they are ignored and management needs the ADMIN_TOKEN (sent as a Bearer token or by the page's form); without
    an ADMIN_TOKEN nothing is managed."""
    if app.managed:
        return signed_in(headers)
    supplied = form.get("admin_token", "")
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        supplied = auth[7:]
    if len(app.admin_token) < MIN_ADMIN_TOKEN:
        return False
    if hmac.compare_digest(supplied.encode(), app.admin_token.encode()):
        return True
    time.sleep(0.5)  # slows guessing
    return False


def same_origin(headers) -> bool:
    """A form post must come from this app's own page: its Origin names the host it was sent to."""
    origin = headers.get("Origin", "")
    hosts = {headers.get("Host", ""), headers.get("X-Forwarded-Host", "")} - {""}
    return bool(origin) and urlsplit(origin).netloc in hosts


def make_handler(app: Monitor):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parts = urlsplit(self.path)
            path = parts.path
            if path == "/health":
                self.reply(200, "text/plain", b"ok")
            elif path == "/status.json":
                snapshot = app.snapshot()
                snapshot["sites"] = [{k: v for k, v in site.items() if k not in ("id", "expected", "keyword", "pending")} for site in snapshot["sites"]]
                self.reply(200, "application/json", json.dumps(snapshot).encode())
            elif path == "/":
                error = parse_qs(parts.query).get("error", [""])[0][:200]
                self.reply(200, "text/html; charset=utf-8", render(app.snapshot(), error, not app.managed).encode())
            elif path in ("/ui/app.css", "/ui/app.js", "/ui/theme.js", "/ui/page.js"):
                asset = Path(__file__).parent / path.lstrip("/")
                self.reply(200, "text/css" if path.endswith(".css") else "text/javascript", asset.read_bytes())
            else:
                self.reply(404, "text/plain", b"not found")

        def do_POST(self):
            path = urlsplit(self.path).path
            action = path.removeprefix("/sites/")
            if action not in ("add", "edit", "remove") or not path.startswith("/sites/"):
                self.reply(404, "text/plain", b"not found")
            elif app.managed and not signed_in(self.headers):
                self.reply(401, "text/plain", b"sign in required")
            elif not same_origin(self.headers):
                self.reply(403, "text/plain", b"forbidden")
            else:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    length = -1
                if not 0 <= length <= 8192:
                    self.reply(413, "text/plain", b"too large")
                    return
                form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode("utf-8", "replace"), keep_blank_values=True).items()}
                if not may_manage(app, self.headers, form):
                    if app.managed:
                        self.reply(401, "text/plain", b"sign in required")
                    else:  # the page again, with its token field empty: nothing typed is kept, so it asks again
                        problem = "Wrong admin token" if len(app.admin_token) >= MIN_ADMIN_TOKEN else f"Set ADMIN_TOKEN (at least {MIN_ADMIN_TOKEN} characters) to manage sites outside Automaton"
                        self.reply(401, "text/html; charset=utf-8", render(app.snapshot(), problem, True).encode())
                    return
                error = app.edit(action, form)
                self.send_response(303)
                self.send_header("Location", "../?" + urlencode({"error": error}) if error else "../")
                self.send_header("Content-Length", "0")
                self.end_headers()

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
