"""Watchtower core: watchers, rules, de-duplicated alerts and mute.

Python standard library only. State is one dict:
  rules   {watcher: {enabled, interval, last_run}}
  alerts  [{id, key, watcher, title, detail, severity, token, first_seen, last_seen, resolved_at, notified_at, muted_until}]
  dummy   bool, the condition the dummy watcher reports
An alert is one occurrence of a condition: it is created when a watcher first reports its key, emailed once, and
resolved when the watcher stops reporting it. The same key reported again later is a new alert.
"""

from __future__ import annotations

import json
import os
import secrets
import time
import uuid
from datetime import datetime

MAX_ALERTS = 500
MIN_INTERVAL = 10
MAX_INTERVAL = 86400
MAX_MUTE_HOURS = 168
DEFAULT_MUTE_HOURS = 24


class CorruptState(RuntimeError):
    """The stored state cannot be used; the app refuses to start rather than overwrite it."""


class InvalidInput(ValueError):
    """A request value the caller can fix; the message is safe to show."""


def finding(key: str, title: str, detail: str = "", severity: str = "warning") -> dict:
    return {"key": key, "title": title, "detail": detail, "severity": severity}


def dummy_watcher(state: dict) -> list[dict]:
    """Reports one finding while the dummy condition is on. Real watchers are added to WATCHERS in later issues."""
    if state.get("dummy"):
        return [finding("dummy", "Dummy watcher: the test condition is on", "Turn it off on the Watchtower page to resolve this alert.")]
    return []


BACKUP_MAX_AGE = 26 * 3600

# Data sources the app plugs in (name -> callable returning the server's data); a source that raises keeps the alerts.
SOURCES: dict = {}


def parse_time(value) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def backup_watcher(state: dict) -> list[dict]:
    """Server backups (GET /api/Install/backups, permission backups:read): too old, or the last run failed."""
    source = SOURCES.get("backups")
    data = source() if source else None
    if not isinstance(data, dict) or not data.get("available"):
        return []  # this server does not report backups; nothing to judge
    now = time.time()
    times = [parse_time(data.get("lastSuccessAt"))]
    times += [parse_time(b.get("createdAt")) for b in data.get("backups") or [] if isinstance(b, dict)]
    newest = max((t for t in times if t is not None), default=None)
    found = []
    if newest is None:
        found.append(finding("server-backup-old", "No server backup exists", "The server reports no backup at all.", "critical"))
    elif now - newest > BACKUP_MAX_AGE:
        hours = int((now - newest) // 3600)
        found.append(finding("server-backup-old", f"The newest server backup is {hours} hours old",
                             "Nightly backups should be less than 26 hours apart. Check the server's backup timer.", "critical"))
    if data.get("lastError"):
        found.append(finding("server-backup-failed", "The last server backup failed", str(data["lastError"])[:300], "critical"))
    return found


def offsite_watcher(state: dict) -> list[dict]:
    """The off-site backup app (GET /api/apps/status, permission apps:read-status): its last run failed or is too old."""
    source = SOURCES.get("apps")
    data = source() if source else None
    if not isinstance(data, list):
        return []
    app = next((a for a in data if isinstance(a, dict) and "off-site" in str(a.get("name", "")).lower()), None)
    if app is None:
        return []  # no off-site backup app on this server; nothing to judge
    run = app.get("lastActionRun") if isinstance(app.get("lastActionRun"), dict) else None
    found = []
    when = parse_time(run.get("createdAtUtc")) if run else None
    if run and str(run.get("status", "")).lower() in ("failed", "timedout", "cancelled"):
        found.append(finding("offsite-backup-failed", "The last off-site backup run failed",
                             f"{run.get('moduleKey', 'run')} ended {run.get('status')}. Open the Off-site Backup app for the reason.", "critical"))
    if when is None:
        found.append(finding("offsite-backup-old", "The off-site backup has not run", "The server shows no run of the off-site backup app.", "critical"))
    elif time.time() - when > BACKUP_MAX_AGE:
        found.append(finding("offsite-backup-old", f"The last off-site backup run is {int((time.time() - when) // 3600)} hours old",
                             "The off-site backup should run at least once a day. Check that the app is deployed and not paused.", "critical"))
    return found


# name -> (label, default interval in seconds, run(state) -> list of findings)
WATCHERS = {"dummy": ("Dummy watcher", 30, dummy_watcher), "backups": ("Server backups", 600, backup_watcher),
            "offsite": ("Off-site backup", 600, offsite_watcher)}


def new_state() -> dict:
    return {"rules": {}, "alerts": [], "dummy": False}


def rule(state: dict, name: str) -> dict:
    return state["rules"].setdefault(name, {"enabled": True, "interval": WATCHERS[name][1], "last_run": None})


def set_rule(state: dict, name: str, body: dict) -> dict:
    if name not in WATCHERS:
        raise KeyError(name)
    current = rule(state, name)
    if "enabled" in body:
        if not isinstance(body["enabled"], bool):
            raise InvalidInput("enabled must be true or false")
        current["enabled"] = body["enabled"]
        if not body["enabled"]:  # a watcher that no longer runs cannot clear its alerts
            for alert in active(state):
                if alert["watcher"] == name:
                    alert["resolved_at"] = time.time()
    if "interval" in body:
        value = body["interval"]
        if isinstance(value, bool) or not isinstance(value, int) or not MIN_INTERVAL <= value <= MAX_INTERVAL:
            raise InvalidInput(f"interval must be {MIN_INTERVAL} to {MAX_INTERVAL} seconds")
        current["interval"] = value
    return current


def active(state: dict) -> list[dict]:
    return [a for a in state["alerts"] if a["resolved_at"] is None]


def is_muted(alert: dict, now: float) -> bool:
    return bool(alert["muted_until"]) and alert["muted_until"] > now


def run_watchers(state: dict, now: float, only: str | None = None, force: bool = False, log=lambda text: None) -> None:
    """Runs the watchers that are enabled and due, and updates the alerts. A watcher that raises keeps its alerts."""
    for name, (_label, _default, run) in WATCHERS.items():
        current = rule(state, name)
        if only and name != only:
            continue
        if not current["enabled"] or not force and current["last_run"] is not None and now - current["last_run"] < current["interval"]:
            continue
        try:
            findings = run(state)
        except Exception as error:
            log(f"watcher {name} failed: {type(error).__name__}: {error}")
            continue
        current["last_run"] = now
        seen = set()
        for item in findings:
            seen.add(item["key"])
            existing = next((a for a in active(state) if a["watcher"] == name and a["key"] == item["key"]), None)
            if existing:
                existing["last_seen"] = now
                existing["detail"] = item["detail"]
            else:
                state["alerts"].append({"id": uuid.uuid4().hex[:12], "key": item["key"], "watcher": name, "title": item["title"],
                                        "detail": item["detail"], "severity": item["severity"], "token": secrets.token_urlsafe(24),
                                        "first_seen": now, "last_seen": now, "resolved_at": None, "notified_at": None, "muted_until": None})
        for alert in active(state):
            if alert["watcher"] == name and alert["key"] not in seen:
                alert["resolved_at"] = now
    trim(state)


def trim(state: dict) -> None:
    extra = len(state["alerts"]) - MAX_ALERTS
    if extra > 0:
        gone = {a["id"] for a in [a for a in state["alerts"] if a["resolved_at"] is not None][:extra]}
        state["alerts"] = [a for a in state["alerts"] if a["id"] not in gone]


def pending(state: dict, now: float) -> list[dict]:
    """Alerts to email now: active, never emailed, not muted. Nothing changes until `confirm`."""
    return [a for a in active(state) if a["notified_at"] is None and not is_muted(a, now)]


def confirm(alert: dict, now: float) -> None:
    alert["notified_at"] = now


def mute(alert: dict, hours, now: float) -> None:
    if isinstance(hours, bool) or not isinstance(hours, int) or not 1 <= hours <= MAX_MUTE_HOURS:
        raise InvalidInput(f"hours must be 1 to {MAX_MUTE_HOURS}")
    alert["muted_until"] = now + hours * 3600


def unmute(alert: dict) -> None:
    alert["muted_until"] = None


def find_by_token(state: dict, token: str) -> dict | None:
    found = None
    for alert in state["alerts"]:
        if secrets.compare_digest(alert["token"].encode(), token.encode()):
            found = alert
    return found


def message(alert: dict, mute_url: str | None) -> str:
    lines = [alert["title"]]
    if alert["detail"]:
        lines += ["", alert["detail"]]
    if mute_url:
        lines += ["", f"Mute for {DEFAULT_MUTE_HOURS} hours: {mute_url}"]
    return "\n".join(lines)


def public_alert(alert: dict, now: float) -> dict:
    view = {k: alert[k] for k in ("id", "key", "watcher", "title", "detail", "severity", "first_seen", "last_seen", "resolved_at", "notified_at", "muted_until")}
    view["muted"] = is_muted(alert, now)
    return view


def public_state(state: dict, now: float) -> dict:
    watchers = []
    for name, (label, _default, _run) in WATCHERS.items():
        watchers.append({"name": name, "label": label, **rule(state, name)})
    ordered = sorted(state["alerts"], key=lambda a: a["first_seen"], reverse=True)
    return {"watchers": watchers, "dummy": state["dummy"], "alerts": [public_alert(a, now) for a in ordered]}


_ALERT_KEYS = {"id": str, "key": str, "watcher": str, "title": str, "token": str, "first_seen": (int, float)}


def load_state(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return new_state()
    except (OSError, ValueError) as error:
        raise CorruptState(f"{os.path.basename(path)} cannot be read ({type(error).__name__}); fix or remove it") from error
    if not isinstance(data, dict) or not isinstance(data.get("alerts"), list) or not isinstance(data.get("rules", {}), dict):
        raise CorruptState(f"{os.path.basename(path)} is not Watchtower state; fix or remove it")
    for alert in data["alerts"]:
        if not isinstance(alert, dict) or not all(isinstance(alert.get(k), t) for k, t in _ALERT_KEYS.items()):
            raise CorruptState(f"{os.path.basename(path)} holds a damaged alert record; fix or remove it")
        for k, v in (("detail", ""), ("severity", "warning"), ("last_seen", alert["first_seen"]), ("resolved_at", None),
                     ("notified_at", None), ("muted_until", None)):
            alert.setdefault(k, v)
    data.setdefault("rules", {})
    data["dummy"] = bool(data.get("dummy", False))
    return data


def save_state(path: str, state: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temp = path + ".tmp"
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(state, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)
