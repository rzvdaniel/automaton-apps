"""Server Console logic: read the server health, keep 24 hours of history, judge it and warn once per condition.

Everything here is a plain function of its inputs so it can be tested without a server.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

USER_AGENT = "Automaton-Server-Console/1.0"
HISTORY_SECONDS = 24 * 3600
STALE_HOST_SECONDS = 15 * 60
DAY = 86400
CONDITIONS = ("disk_low", "security_overdue", "reboot_overdue")

# Status levels, worst last.
OK, WARNING, CRITICAL, UNKNOWN = "ok", "warning", "critical", "unknown"
_RANK = {UNKNOWN: -1, OK: 0, WARNING: 1, CRITICAL: 2}


class ConfigError(ValueError):
    """A setting is invalid; the message says which one and what is allowed."""


def env_int(env, name: str, default: int, minimum: int, maximum: int) -> int:
    raw = str(env.get(name, "")).strip()
    if not raw:
        return default
    if not raw.isdigit() or not minimum <= int(raw) <= maximum:
        raise ConfigError(f"{name} must be a whole number from {minimum} to {maximum}")
    return int(raw)


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.api_base_url = env.get("API_BASE_URL", "").strip().rstrip("/")
        self.api_source = "setting" if self.api_base_url else "none"
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.webhook = env.get("WEBHOOK_URL", "").strip()
        self.interval = env_int(env, "CHECK_INTERVAL_SECONDS", 300, 60, 3600)
        self.disk_free_percent = env_int(env, "DISK_FREE_WARN_PERCENT", 15, 1, 99)
        self.security_days = env_int(env, "SECURITY_UPDATE_DAYS", 7, 0, 365)
        self.reboot_days = env_int(env, "REBOOT_DAYS", 3, 0, 365)
        if self.api_base_url and urlsplit(self.api_base_url).scheme not in ("http", "https"):
            raise ConfigError("API_BASE_URL must start with https:// (or http:// on a local server)")

    def public(self) -> dict:
        return {"intervalSeconds": self.interval, "diskFreePercent": self.disk_free_percent,
                "securityUpdateDays": self.security_days, "rebootDays": self.reboot_days,
                "webhookConfigured": bool(self.webhook), "webhookHost": webhook_host(self.webhook),
                "apiBaseSource": self.api_source}


def webhook_host(url: str) -> str | None:
    """Only the host of a webhook is ever shown: the rest of the URL is a secret."""
    return (urlsplit(url).hostname or None) if url else None


_HOST = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?){2,}$")


def derive_api_base(host: str | None, proto: str | None = None) -> str | None:
    """Works out the API address from the address the app is opened at.

    The server does not hand apps its API address, so we use the convention of Automaton servers: an app is served at
    app-<id>.apps.<domain> (or <slug>.apps.<domain>) and the API at api.<domain>. Returns None when the host does not
    look like that (an IP address, localhost, or too few labels); then API_BASE_URL must be set.
    """
    host = (host or "").split(":")[0].strip().lower().rstrip(".")
    if not _HOST.match(host) or host.replace(".", "").isdigit():
        return None
    domain = host.split(".", 1)[1]
    domain = domain[len("apps."):] if domain.startswith("apps.") else domain
    if "." not in domain:
        return None
    return ("http" if proto == "http" else "https") + "://api." + domain


# --- Reading the platform API ---------------------------------------------------------------------------------------

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # the key must never follow a redirect to another host
        return None


def fetch_health(settings: Settings, timeout: float = 20, opener=None) -> tuple[str, dict | None, str | None]:
    """Returns (status, health, message). Status is ok, no_key, not_approved, not_configured, unavailable or error."""
    if not settings.api_base_url:
        return "not_configured", None, "The server address is not known yet: open this page once, or set API_BASE_URL."
    if not settings.api_key:
        return "no_key", None, "The app has no server:read key yet."
    request = Request(settings.api_base_url + "/api/server/health",
                      headers={"Authorization": "Bearer " + settings.api_key, "Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with (opener or build_opener(_NoRedirect())).open(request, timeout=timeout) as response:
            return "ok", json.loads(response.read(2_000_000).decode("utf-8")), None
    except HTTPError as error:
        if error.code in (401, 403):
            return "not_approved", None, "The server refused the key: server:read is not approved (or was revoked)."
        if error.code == 404:
            return "unavailable", None, "This server does not offer server health yet; update Automaton."
        return "error", None, f"The server answered HTTP {error.code}."
    except (URLError, OSError, ValueError) as error:
        return "error", None, f"The server could not be reached: {type(error).__name__}."


# --- History and state ----------------------------------------------------------------------------------------------

def new_state() -> dict:
    return {"history": [], "health": None, "fetchedAt": None, "status": "starting", "message": None,
            "alerts": {}, "securitySince": None, "webhook": "", "derivedApiBase": None}


def load_state(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as handle:
            loaded = json.load(handle)
        state = new_state()
        state.update({key: loaded[key] for key in state if key in loaded})
        return state
    except (OSError, ValueError):
        return new_state()


def save_state(path: str, state: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(state, handle)
    os.replace(temporary, path)


def percent(part, total) -> float | None:
    if not isinstance(part, (int, float)) or not isinstance(total, (int, float)) or total <= 0:
        return None
    return round(100.0 * part / total, 1)


def sample(health: dict, now: float) -> dict:
    host = health.get("host") or {}
    memory_free = percent(host.get("memoryAvailableBytes"), host.get("memoryTotalBytes"))
    disk_free = percent(host.get("diskAvailableBytes"), host.get("diskTotalBytes"))
    return {"t": int(now), "cpu": host.get("cpuPercent"),
            "mem": None if memory_free is None else round(100 - memory_free, 1),
            "disk": None if disk_free is None else round(100 - disk_free, 1)}


def record(state: dict, health: dict, now: float) -> None:
    """Stores the sample, keeps 24 hours, and tracks how long security updates have been waiting."""
    state["history"] = [item for item in state["history"] if now - item["t"] < HISTORY_SECONDS] + [sample(health, now)]
    waiting = (health.get("host") or {}).get("securityUpdates")
    if isinstance(waiting, int) and waiting > 0:
        state["securitySince"] = state["securitySince"] or int(now)
    elif isinstance(waiting, int):
        state["securitySince"] = None


# --- Judging the figures --------------------------------------------------------------------------------------------

def worst(*levels: str) -> str:
    known = [level for level in levels if level in _RANK]
    return max(known, key=_RANK.get) if known else UNKNOWN


def _by(value, warn, critical, above=True):
    if value is None:
        return UNKNOWN
    if above:
        return CRITICAL if value >= critical else WARNING if value >= warn else OK
    return CRITICAL if value <= critical else WARNING if value <= warn else OK


def _age(timestamp, now) -> float | None:
    """Seconds since an ISO-8601 time (as sent by the API), or None."""
    if not timestamp:
        return None
    try:
        moment = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return now - moment.timestamp()
    except ValueError:
        return None


def assess(health: dict | None, state: dict, settings: Settings, now: float) -> dict:
    """Status per card and per figure: ok, warning, critical or unknown."""
    if not health:
        return {"overall": UNKNOWN}
    host = health.get("host") or {}
    server = health.get("server") or {}
    disk_free = percent(host.get("diskAvailableBytes"), host.get("diskTotalBytes"))
    memory_used = None if (m := percent(host.get("memoryAvailableBytes"), host.get("memoryTotalBytes"))) is None else 100 - m
    cpus = host.get("cpuCount") or 1
    load = host.get("load5")
    security_age = None if not state.get("securitySince") else now - state["securitySince"]
    reboot_age = _age(host.get("rebootRequiredSinceUtc"), now)

    status = {
        "disk": UNKNOWN if disk_free is None else CRITICAL if disk_free < settings.disk_free_percent
        else WARNING if disk_free < settings.disk_free_percent + 10 else OK,
        "memory": _by(memory_used, 90, 96),
        "cpu": _by(host.get("cpuPercent"), 85, 95),
        "load": UNKNOWN if load is None else _by(load / cpus, 1.0, 2.0),
    }
    security = host.get("securityUpdates")
    status["security"] = UNKNOWN if security is None else OK if security == 0 else CRITICAL if (
        security_age is not None and security_age > settings.security_days * DAY) else WARNING
    pending = host.get("updatesPending")
    status["pending"] = UNKNOWN if pending is None else WARNING if pending >= 25 else OK
    reboot = host.get("rebootRequired")
    status["reboot"] = UNKNOWN if reboot is None else OK if not reboot else CRITICAL if (
        reboot_age is not None and reboot_age > settings.reboot_days * DAY) else WARNING
    backup = health.get("backup") or {}
    hours = backup.get("lastSuccessAgeHours")
    status["backup"] = UNKNOWN if not backup.get("available") else CRITICAL if hours is None else _by(hours, 36, 72)
    certificates = [(_by(c.get("daysRemaining"), 14, 7, above=False) if c.get("daysRemaining") is not None else CRITICAL)
                    for c in health.get("certificates") or []]
    status["certificates"] = worst(*certificates) if certificates else UNKNOWN
    runners = [CRITICAL if str(r.get("status", "")).lower() != "online" else WARNING if r.get("upgradeAvailable") else OK
               for r in health.get("runners") or []]
    status["runners"] = worst(*runners) if runners else UNKNOWN
    status["server"] = WARNING if server.get("updateAvailable") else OK if server.get("version") else UNKNOWN
    age = health.get("hostAgeSeconds")
    status["freshness"] = UNKNOWN if age is None else WARNING if age > STALE_HOST_SECONDS else OK
    status["resources"] = worst(status["disk"], status["memory"], status["cpu"], status["load"], status["freshness"])
    status["updates"] = worst(status["security"], status["pending"], status["reboot"])
    status["overall"] = worst(*(status[k] for k in ("server", "runners", "updates", "resources", "backup", "certificates")))
    status["securityDays"] = None if security_age is None else round(security_age / DAY, 1)
    return status


# --- Warnings -------------------------------------------------------------------------------------------------------

def conditions(health: dict, state: dict, settings: Settings, now: float) -> dict[str, tuple[bool, str]]:
    """Each warning condition: (is it true now, the message that describes it)."""
    host = health.get("host") or {}
    result: dict[str, tuple[bool, str]] = {}
    free = percent(host.get("diskAvailableBytes"), host.get("diskTotalBytes"))
    if free is not None:
        result["disk_low"] = (free < settings.disk_free_percent,
                              f"disk space is low: {free:g}% free (warning below {settings.disk_free_percent}%)")
    security = host.get("securityUpdates")
    if isinstance(security, int):
        since = state.get("securitySince")
        days = 0 if not since else (now - since) / DAY
        result["security_overdue"] = (security > 0 and days > settings.security_days,
                                      f"{security} security update(s) have been waiting for {days:.0f} days (warning after {settings.security_days})")
    reboot = host.get("rebootRequired")
    if isinstance(reboot, bool):
        age = _age(host.get("rebootRequiredSinceUtc"), now)
        days = 0 if age is None else age / DAY
        result["reboot_overdue"] = (reboot and days > settings.reboot_days,
                                    f"a restart has been required for {days:.0f} days (warning after {settings.reboot_days})")
    return result


def evaluate_alerts(state: dict, found: dict[str, tuple[bool, str]], send, deliver: bool, now: float) -> list[str]:
    """Sends one warning when a condition starts and one recovery message when it ends.

    `send(event, condition, text)` returns True when delivered. A warning that could not be delivered is retried on
    the next run. Without a webhook (`deliver` False) the state is still tracked so the page shows what is active.
    """
    sent: list[str] = []
    alerts = state.setdefault("alerts", {})
    for name in CONDITIONS:
        if name not in found:
            continue
        active, message = found[name]
        if active and name not in alerts:
            if not deliver or send("warning", name, "Server Console warning: " + message + "."):
                alerts[name] = {"since": int(now), "message": message}
                sent.append(f"warning:{name}")
        elif not active and name in alerts:
            if not deliver or send("recovered", name, f"Server Console: recovered, {message}."):
                del alerts[name]
                sent.append(f"recovered:{name}")
    return sent


def run_cycle(settings: Settings, state: dict, now: float, send, fetch=fetch_health) -> dict:
    """One poll: fetch, record, judge, warn. Returns the updated state."""
    if not settings.api_base_url and state.get("derivedApiBase"):
        settings.api_base_url, settings.api_source = state["derivedApiBase"], "derived"
    if state.get("webhook"):  # set in the app; takes the place of the WEBHOOK_URL environment variable
        settings.webhook = state["webhook"]
    status, health, message = fetch(settings)
    state["status"], state["message"] = status, message
    if status == "ok" and health:
        state["health"], state["fetchedAt"] = health, int(now)
        record(state, health, now)
        evaluate_alerts(state, conditions(health, state, settings, now), send, bool(settings.webhook), now)
    return state


def snapshot(state: dict, settings: Settings, now: float) -> dict:
    """What the page receives. Without approval nothing from the server is shown; a passing error keeps the last figures."""
    status = state.get("status")
    shown = status in ("ok", "error")
    health = state.get("health") if shown else None
    return {"status": status, "message": state.get("message"), "fetchedAt": state.get("fetchedAt"),
            "now": int(now), "health": health, "assessment": assess(health, state, settings, now),
            "history": state.get("history", []) if shown else [], "alerts": state.get("alerts", {}) if shown else {},
            "settings": settings.public()}
