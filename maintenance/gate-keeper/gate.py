"""Gate Keeper logic: who fail2ban has banned and why, read-only.

Inside Automaton the bans come from the server's `GET /api/server/security/fail2ban` (permission security:read).
On its own the app reads fail2ban's SQLite database, mounted read-only. Both end in the same shape, so the page and
the Home card do not care where the figures came from. Plain functions of their inputs, so they test without a server.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

USER_AGENT = "Automaton-Gate-Keeper/1.0"
MAX_BANS_PER_JAIL = 200
MAX_JAILS = 50
HOUR, DAY = 3600, 86400
MIN_ADMIN_TOKEN = 16


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # the key must not follow a redirect to another host
        return None


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())  # only then does Automaton's sign-in sit in front, and only then is the server key used
        self.api_base_url = (env.get("AUTOMATON_API_URL", "").strip() or env.get("API_BASE_URL", "").strip()).rstrip("/")
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.admin_token = env.get("ADMIN_TOKEN", "").strip()
        self.db_path = env.get("FAIL2BAN_DB", "").strip() or "/host/fail2ban.sqlite3"
        self.pid_path = env.get("FAIL2BAN_PID", "").strip() or "/host/fail2ban.pid"


def parse_time(value) -> float | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"(\.\d{6})\d+", r"\1", value.strip())
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).timestamp()


def iso(epoch: float | None) -> str | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _count(value) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _address(value) -> str | None:
    try:
        return str(ipaddress.ip_address(str(value)))
    except ValueError:
        return None  # whatever is not an address never reaches the page


def normalize(payload: dict, now: float) -> dict:
    """The server's answer (camelCase) in the app's own shape. Expired bans are dropped, addresses are validated."""
    jails = []
    for raw in (payload.get("jails") or [])[:MAX_JAILS]:
        if not isinstance(raw, dict):
            continue
        bans = []
        for ban in raw.get("currentBans") or []:
            ip = _address(ban.get("ip")) if isinstance(ban, dict) else None
            banned, until = (parse_time(ban.get("bannedAtUtc")), parse_time(ban.get("expiresAtUtc"))) if ip else (None, None)
            if ip and (until is None or until > now):
                bans.append({"ip": ip, "bannedAt": iso(banned), "expiresAt": iso(until)})  # no expiry: a permanent ban
        bans.sort(key=lambda b: b["bannedAt"] or "", reverse=True)
        jails.append({"name": str(raw.get("name") or "?")[:60], "enabled": raw.get("enabled") is not False,
                      "lastHour": _count(raw.get("bannedLastHour")), "last24Hours": _count(raw.get("bannedLast24Hours")),
                      "banned": len(bans), "bans": bans[:MAX_BANS_PER_JAIL]})
    return {"reported": bool(payload.get("reported", True)), "running": payload.get("running"),
            "ageSeconds": payload.get("reportAgeSeconds"), "jails": jails}


def read_server(settings: Settings, now: float, timeout: float = 15) -> tuple[str, dict | None, str]:
    """(status, figures, message). status: ok, no_key, not_approved, unavailable."""
    if not settings.api_base_url or not settings.api_key:
        return "no_key", None, "The server did not give this app an API address and key."
    request = Request(settings.api_base_url + "/api/server/security/fail2ban", headers={
        "Authorization": "Bearer " + settings.api_key, "Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with build_opener(_NoRedirect()).open(request, timeout=timeout) as response:
            payload = json.loads(response.read(2 * 1024 * 1024).decode("utf-8"))
    except HTTPError as error:
        if error.code in (401, 403):
            return "not_approved", None, "An administrator must approve security:read for this app."
        return "unavailable", None, f"The server answered HTTP {error.code}."
    except (URLError, OSError, ValueError) as error:
        return "unavailable", None, f"The server could not be reached ({type(error).__name__})."
    if not isinstance(payload, dict):
        return "unavailable", None, "The server answered with something unexpected."
    return "ok", normalize(payload, now), ""


def read_database(settings: Settings, now: float) -> tuple[str, dict | None, str]:
    """Standalone: fail2ban's own database, opened read-only. Bans count as current until their recorded expiry."""
    if not os.path.isfile(settings.db_path):
        return "unavailable", None, "The fail2ban database is not mounted at FAIL2BAN_DB."
    uri = "file:" + settings.db_path.replace("?", "%3f").replace("#", "%23") + "?mode=ro"
    try:
        db = sqlite3.connect(uri, uri=True, timeout=5)
        try:
            enabled = {name: bool(flag) for name, flag in db.execute("SELECT name, enabled FROM jails")}
            rows = db.execute("SELECT jail, ip, timeofban, bantime FROM bans WHERE timeofban >= ? OR bantime < 0 OR timeofban + bantime > ? "
                              "ORDER BY timeofban DESC", (now - DAY, now)).fetchall()
        finally:
            db.close()
    except sqlite3.Error as error:
        return "unavailable", None, f"The fail2ban database could not be read ({type(error).__name__})."
    jails: dict[str, dict] = {name: {"name": name, "enabled": flag, "bannedLastHour": 0, "bannedLast24Hours": 0, "currentBans": []}
                              for name, flag in enabled.items()}
    seen_recent: dict[str, set] = {}
    seen_hour: dict[str, set] = {}
    seen_current: set = set()
    for jail, ip, banned, bantime in rows:
        entry = jails.setdefault(jail, {"name": jail, "enabled": True, "bannedLastHour": 0, "bannedLast24Hours": 0, "currentBans": []})
        if banned >= now - DAY and ip not in seen_recent.setdefault(jail, set()):
            seen_recent[jail].add(ip)
            entry["bannedLast24Hours"] += 1
        if banned >= now - HOUR and ip not in seen_hour.setdefault(jail, set()):
            seen_hour[jail].add(ip)
            entry["bannedLastHour"] += 1
        if (bantime < 0 or banned + bantime > now) and (jail, ip) not in seen_current:
            seen_current.add((jail, ip))
            entry["currentBans"].append({"ip": ip, "bannedAtUtc": iso(banned), "expiresAtUtc": None if bantime < 0 else iso(banned + bantime)})
    payload = {"reported": True, "running": os.path.exists(settings.pid_path), "reportAgeSeconds": 0, "jails": list(jails.values())}
    return "ok", normalize(payload, now), ""


def totals(figures: dict) -> dict:
    jails = figures["jails"]
    return {"banned": sum(j["banned"] for j in jails), "lastHour": sum(j["lastHour"] for j in jails),
            "last24Hours": sum(j["last24Hours"] for j in jails)}


def view(status: str, figures: dict | None, message: str, fetched_at: float) -> dict:
    out = {"status": status, "message": message, "fetchedAt": iso(fetched_at)}
    if figures:
        out.update(figures, totals=totals(figures))
    return out


def build_card(state: dict) -> dict:
    """The Home card: counts and jail names only. Banned addresses stay on the app's page behind Automaton's sign-in."""
    buttons = {"type": "buttons", "items": [{"label": "Open", "path": "/"}]}
    status = state.get("status")
    if status != "ok":
        waiting = status in ("no_key", "not_approved")
        return {"status": "Waiting for approval" if waiting else "No figures yet", "tone": "info" if waiting else "warning",
                "detail": "An administrator must approve security:read for this app." if waiting else "Gate Keeper could not read the bans.",
                "blocks": [buttons]}
    if not state.get("reported"):
        return {"status": "No figures yet", "tone": "info", "detail": "The server has not reported fail2ban yet; this can take a few minutes.",
                "blocks": [buttons]}
    if state.get("running") is False:
        return {"status": "Fail2ban is not running", "tone": "warning", "detail": "Nothing is being banned on this server.", "blocks": [buttons]}
    total = state["totals"]
    jails = [j for j in state["jails"] if j["banned"] or j["last24Hours"]]
    jails.sort(key=lambda j: (-j["banned"], -j["last24Hours"], j["name"]))
    blocks: list[dict] = [{"type": "counters", "items": [
        {"label": "Banned now", "value": total["banned"], "tone": "info" if total["banned"] else "ok"},
        {"label": "Last hour", "value": total["lastHour"]}, {"label": "Last 24 h", "value": total["last24Hours"]}]}]
    if jails:
        blocks.append({"type": "list", "rows": [{"text": j["name"][:120], "note": f"{j['banned']} now, {j['last24Hours']} in 24 h"} for j in jails[:5]]})
    blocks.append(buttons)
    return {"status": f"{total['banned']} {'address' if total['banned'] == 1 else 'addresses'} banned" if total["banned"] else "No active bans",
            "tone": "ok", "detail": "Fail2ban is running." if state.get("running") else "Fail2ban status unknown.", "blocks": blocks}
