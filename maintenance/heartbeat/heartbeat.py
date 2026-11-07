"""Check logic for Heartbeat: durations, check-in bookkeeping and the decision to alert.

Python standard library only. A check is a dict:
  id, name, token, period (seconds), grace (seconds), created, last_ping (or None), pings, alerted ('up' or 'down')
"""

from __future__ import annotations

import json
import os
import re
import secrets
import uuid

MAX_CHECKS = 200
MIN_PERIOD = 60
MAX_SECONDS = 400 * 86400
MAX_NAME = 80
_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


class CorruptState(RuntimeError):
    """The stored checks cannot be used; the app refuses to start rather than overwrite them."""


class InvalidInput(ValueError):
    """A request value the caller can fix; the message is safe to show."""


def parse_duration(value, what: str = "duration", allow_zero: bool = False) -> int:
    """Seconds from 90, '90', '5m', '24h', '1h30m' or '2d'."""
    if isinstance(value, bool) or value is None:
        raise InvalidInput(f"{what} is required")
    text = str(value).strip().lower().replace(" ", "")
    if text.isdigit():
        seconds = int(text)
    else:
        parts = re.fullmatch(r"(?:\d+[smhd])+", text)
        if not parts:
            raise InvalidInput(f"{what} must look like 90, 5m, 24h or 1h30m")
        seconds = sum(int(number) * _UNITS[unit] for number, unit in re.findall(r"(\d+)([smhd])", text))
    if seconds > MAX_SECONDS:
        raise InvalidInput(f"{what} is at most 400 days")
    if seconds == 0 and not allow_zero:
        raise InvalidInput(f"{what} must be more than zero")
    return seconds


def format_duration(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    return " ".join(f"{n}{u}" for n, u in ((days, "d"), (hours, "h"), (minutes, "m")) if n)


def new_check(name, period, grace, now: float, existing: list[dict]) -> dict:
    name = str(name or "").strip()
    if not name or len(name) > MAX_NAME:
        raise InvalidInput(f"name is required (at most {MAX_NAME} characters)")
    if len(existing) >= MAX_CHECKS:
        raise InvalidInput(f"at most {MAX_CHECKS} checks")
    if any(check["name"].lower() == name.lower() for check in existing):
        raise InvalidInput("a check with this name already exists")
    period_s = parse_duration(period, "period")
    if period_s < MIN_PERIOD:
        raise InvalidInput("period must be at least 1m")
    grace_s = parse_duration(grace if grace not in (None, "") else "0", "grace", allow_zero=True)
    return {"id": uuid.uuid4().hex[:12], "name": name, "token": secrets.token_urlsafe(24), "period": period_s,
            "grace": grace_s, "created": now, "last_ping": None, "pings": 0, "alerted": "up"}


def find_by_token(checks: list[dict], token: str) -> dict | None:
    """Looks a check-in token up without stopping at the first match (no timing difference between near misses)."""
    found = None
    for check in checks:
        if secrets.compare_digest(check["token"].encode(), token.encode()):
            found = check
    return found


def record_ping(check: dict, now: float) -> None:
    check["last_ping"] = now
    check["pings"] += 1


def due_at(check: dict) -> float:
    """When the next check-in must have arrived: from the last one (or from creation), plus period and grace."""
    return (check["last_ping"] if check["last_ping"] is not None else check["created"]) + check["period"] + check["grace"]


def status(check: dict, now: float) -> str:
    if now > due_at(check):
        return "late"
    return "new" if check["last_ping"] is None else "up"


def decide(check: dict, now: float) -> str | None:
    """'missed' once when a check goes overdue, 'recovered' once when it checks in again; None otherwise.

    `alerted` only changes through `confirm`, so an alert that could not be delivered is retried on the next pass.
    """
    late = status(check, now) == "late"
    if late and check["alerted"] != "down":
        return "missed"
    if not late and check["alerted"] == "down":
        return "recovered"
    return None


def confirm(check: dict, event: str) -> None:
    check["alerted"] = "down" if event == "missed" else "up"


def message(event: str, check: dict, now: float) -> str:
    name = check["name"]
    if event == "missed":
        since = check["last_ping"] if check["last_ping"] is not None else check["created"]
        seen = "no check-in for " + format_duration(now - since) if check["last_ping"] is not None else "never checked in"
        return f"MISSED: {name} - {seen} (expected every {format_duration(check['period'])}, {format_duration(check['grace']) or '0s'} grace)"
    return f"RECOVERED: {name} checked in again"


def plan_alerts(checks: list[dict], now: float) -> list[tuple[str, str, str, str]]:
    """The alerts to send now, as (check id, event, text, name). Nothing is changed until `confirm`."""
    plan = []
    for check in checks:
        event = decide(check, now)
        if event:
            plan.append((check["id"], event, message(event, check, now), check["name"]))
    return plan


def run_pass(checks: list[dict], now: float, send) -> int:
    """Plans, sends and confirms in one go. `send(event, text, name)` returns True when delivered."""
    sent = 0
    for check_id, event, text, name in plan_alerts(checks, now):
        if send(event, text, name):
            confirm(next(c for c in checks if c["id"] == check_id), event)
            sent += 1
    return sent


def public_view(check: dict, now: float, with_token: bool = True) -> dict:
    view = {k: check[k] for k in ("id", "name", "period", "grace", "created", "last_ping", "pings")}
    view["status"] = status(check, now)
    view["due"] = due_at(check)
    if with_token:
        view["token"] = check["token"]
    return view


_REQUIRED = {"id": str, "name": str, "token": str, "period": (int, float), "grace": (int, float), "created": (int, float)}


def _valid(check) -> bool:
    return isinstance(check, dict) and all(isinstance(check.get(k), t) and not isinstance(check.get(k), bool)
                                           for k, t in _REQUIRED.items())


def load_checks(path: str) -> list[dict]:
    """Reads the checks. A file that cannot be read raises CorruptState, so the app does not start with an empty
    list that the next change would save over it."""
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as error:
        raise CorruptState(f"{os.path.basename(path)} cannot be read ({type(error).__name__}); fix or remove it") from error
    if not isinstance(data, list):
        raise CorruptState(f"{os.path.basename(path)} is not a list of checks; fix or remove it")
    checks = []
    for check in data:
        if not _valid(check):
            raise CorruptState(f"{os.path.basename(path)} holds a damaged check record; fix or remove it")
        check.setdefault("last_ping", None)
        check.setdefault("pings", 0)
        check.setdefault("alerted", "up")
        checks.append(check)
    return checks


def save_checks(path: str, checks: list[dict]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temp = path + ".tmp"
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(checks, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)
