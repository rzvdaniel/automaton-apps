"""Server Console logic: read the server health, keep 24 hours of history, judge it and warn once per condition.

Everything here is a plain function of its inputs so it can be tested without a server.
"""

from __future__ import annotations

import json
import os
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
# What to do about each warning, shown on the page and in the email.
ADVICE = {
    "disk_low": "Free some space: run `docker image prune -a` on the server (Automaton also frees unused images every night) or remove old backups and logs.",
    "security_overdue": "Install the updates on the server: `sudo apt update && sudo apt upgrade`.",
    "reboot_overdue": "Restart the server at a quiet time: `sudo reboot`.",
}
EMAIL_TARGETS = ("administrators", "owner", "project")

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
        # The server provides AUTOMATON_API_URL; API_BASE_URL is the older setting and still works.
        self.api_base_url = (env.get("AUTOMATON_API_URL", "").strip() or env.get("API_BASE_URL", "").strip()).rstrip("/")
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.webhook = env.get("WEBHOOK_URL", "").strip()
        self.email_to = (env.get("EMAIL_TO", "").strip().lower() or "administrators")
        if self.email_to not in EMAIL_TARGETS + ("off",):
            raise ConfigError("EMAIL_TO must be administrators, owner, project or off")
        self.interval = env_int(env, "CHECK_INTERVAL_SECONDS", 300, 60, 3600)
        self.disk_free_percent = env_int(env, "DISK_FREE_WARN_PERCENT", 20, 1, 99)
        self.security_days = env_int(env, "SECURITY_UPDATE_DAYS", 7, 0, 365)
        self.reboot_days = env_int(env, "REBOOT_DAYS", 3, 0, 365)
        if self.api_base_url and urlsplit(self.api_base_url).scheme not in ("http", "https"):
            raise ConfigError("The server address (AUTOMATON_API_URL or API_BASE_URL) must start with https:// (or http:// on a local server)")

    def public(self) -> dict:
        return {"intervalSeconds": self.interval, "diskFreePercent": self.disk_free_percent,
                "securityUpdateDays": self.security_days, "rebootDays": self.reboot_days,
                "webhookConfigured": bool(self.webhook), "emailTo": self.email_to}


# --- Reading the platform API ---------------------------------------------------------------------------------------

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # the key must never follow a redirect to another host
        return None


def fetch_health(settings: Settings, timeout: float = 20, opener=None) -> tuple[str, dict | None, str | None]:
    """Returns (status, health, message). Status is ok, no_key, not_approved, not_configured, unavailable or error."""
    if not settings.api_base_url:
        return "not_configured", None, "The server address (AUTOMATON_API_URL) is not set."
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
            "alerts": {}, "securitySince": None, "sent": {}}


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
        "disk": UNKNOWN if disk_free is None else CRITICAL if disk_free < settings.disk_free_percent / 2
        else WARNING if disk_free < settings.disk_free_percent else OK,
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


# --- What needs the administrator ------------------------------------------------------------------------------------

def plural(count, word: str) -> str:
    return f"{count} {word}" + ("" if count == 1 else "s")


def reclaimable(host: dict) -> dict:
    """Docker disk use from the host report. Images and build cache are what `docker image prune -a` and the
    nightly cleanup can free (an upper bound: images a container uses stay)."""
    parts = {key: host.get(name) for key, name in (("images", "dockerImagesBytes"), ("buildCache", "dockerBuildCacheBytes"),
                                                   ("volumes", "dockerVolumesBytes"), ("containers", "dockerContainersBytes"))}
    known = [value for value in parts.values() if isinstance(value, (int, float))]
    freeable = [parts[key] for key in ("images", "buildCache") if isinstance(parts[key], (int, float))]
    return dict(parts, total=sum(known) if known else None, freeable=sum(freeable) if freeable else None)


def attention(health: dict | None, status: dict, settings: Settings, now: float) -> list[dict]:
    """What needs the administrator now, worst first, from the same live figures the cards show (so one number per
    fact). Each item: level, title, detail and the command to run, if there is one."""
    if not health:
        return []
    host = health.get("host") or {}
    items: list[dict] = []

    def add(level, title, detail, command=""):
        if level in (WARNING, CRITICAL):
            items.append({"level": level, "title": title, "detail": detail, "command": command})

    free = percent(host.get("diskAvailableBytes"), host.get("diskTotalBytes"))
    if free is not None:
        add(status.get("disk"), "Free disk space.",
            f"{100 - free:g}% of the disk is used (warning above {100 - settings.disk_free_percent}%). Automaton frees unused Docker images every night; to do it now:",
            "docker image prune -a")
    if host.get("rebootRequired") is True:
        age = _age(host.get("rebootRequiredSinceUtc"), now)
        waited = "" if age is None else f"Updates have waited for a restart for {plural(int(age // DAY), 'day')} (warning after {settings.reboot_days}). "
        add(status.get("reboot"), "Restart the server.", waited + "At a quiet time:", "sudo reboot")
    security = host.get("securityUpdates")
    if isinstance(security, int) and security > 0:
        days = status.get("securityDays")
        add(status.get("security"), f"Install {plural(security, 'security update')}.",
            "" if days is None else f"Waiting {plural(days, 'day') if days == 1 else str(days) + ' days'} (warning after {settings.security_days}):", "sudo apt upgrade")
    add(status.get("backup"), "Check the backups.", "The last successful backup is too old or missing.")
    expiring = [c.get("host") for c in health.get("certificates") or [] if c.get("daysRemaining") is None or c["daysRemaining"] <= 14]
    add(status.get("certificates"), "A certificate is close to expiring.", ", ".join(str(h) for h in expiring))
    offline = [r.get("name") for r in health.get("runners") or [] if str(r.get("status", "")).lower() != "online"]
    add(CRITICAL if offline else OK, "A Runner is offline.", ", ".join(str(n) for n in offline))
    add(status.get("server"), "Update Automaton.", "A newer release is available.")
    add(status.get("freshness"), "The Runner has not reported for a while.", "The host figures are old.")
    items.sort(key=lambda item: _RANK[item["level"]], reverse=True)
    return items


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


def delivered(results: list) -> bool:
    """Whether a warning is done. Each channel reports True (sent), False (failed, worth retrying) or None (not
    available: not configured, not approved or refused). It is done when no channel failed; the caller does not
    ask a channel again once it has sent."""
    return not any(r is False for r in results)


def evaluate_alerts(state: dict, found: dict[str, tuple[bool, str]], send, deliver: bool, now: float) -> list[str]:
    """Sends one warning when a condition starts and one recovery message when it ends.

    `send(event, condition, text)` returns True when delivered. A warning that could not be delivered is retried on
    the next run. With `deliver` False the state is still tracked so the page shows what is active.
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
    status, health, message = fetch(settings)
    state["status"], state["message"] = status, message
    if status == "ok" and health:
        state["health"], state["fetchedAt"] = health, int(now)
        record(state, health, now)
        evaluate_alerts(state, conditions(health, state, settings, now), send, True, now)
    return state


def snapshot(state: dict, settings: Settings, now: float) -> dict:
    """What the page receives. Without approval nothing from the server is shown; a passing error keeps the last figures."""
    status = state.get("status")
    shown = status in ("ok", "error")
    health = state.get("health") if shown else None
    return {"status": status, "message": state.get("message"), "fetchedAt": state.get("fetchedAt"),
            "now": int(now), "health": health, "assessment": assess(health, state, settings, now),
            "attention": attention(health, assess(health, state, settings, now), settings, now) if health else [],
            "reclaim": reclaimable((health or {}).get("host") or {}),
            "history": state.get("history", []) if shown else [], "alerts": {k: dict(v, advice=ADVICE.get(k, "")) for k, v in state.get("alerts", {}).items()} if shown else {},
            "settings": settings.public()}
