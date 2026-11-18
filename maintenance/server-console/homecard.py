"""Server Keeper's card for Studio Home: one glance at the server, built from the figures the app already has.

The card follows the Home card language (https://automaton.monster/schemas/home-card.schema.json): plain text and tones
only. It holds no host name, path, Runner name or backup error text: the people who see Home are not all administrators,
and the details stay on the app's own page (behind Automaton's sign-in) and in the warnings sent to administrators.
"""

from __future__ import annotations

from console import percent

DISK_WARN_AT = 85
DISK_CRIT_AT = 95
_SEVERITY_RANK = {"critical": 0, "warning": 1, "info": 2}
MAX_ALERTS = 5


def ago(seconds: float) -> str:
    if seconds < 3600:
        return f"{max(1, int(seconds // 60))} min ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)} h ago"
    return f"{int(seconds // 86400)} d ago"


def plural(count: int, word: str) -> str:
    return f"{count} {word}" + ("" if count == 1 else "s")


def _alerts(health: dict, state: dict, used: float | None) -> list[dict]:
    found = state.get("found") or {}
    host = health.get("host") or {}
    alerts: list[tuple[str, str]] = []
    if found.get("backup_failed"):
        alerts.append(("critical", "The last server backup failed. Open Server Keeper for details."))
    if found.get("backup_old"):
        alerts.append(("critical", "The server backup is too old (over 26 hours)."))
    if found.get("offsite_failed"):
        alerts.append(("critical", "The last Off-site Backup run failed."))
    if found.get("offsite_old"):
        alerts.append(("critical", "Off-site Backup has not run in over 26 hours."))
    if used is not None and used > DISK_CRIT_AT:
        alerts.append(("critical", f"The disk is {used:g}% full."))
    elif used is not None and used > DISK_WARN_AT:
        alerts.append(("warning", f"The disk is {used:g}% full."))
    offline = sum(1 for r in health.get("runners") or [] if str(r.get("status", "")).lower() != "online")
    if offline:
        alerts.append(("warning", "A Runner is offline." if offline == 1 else f"{offline} Runners are offline."))
    failing = state.get("failingApps")
    if isinstance(failing, int) and failing > 0:
        alerts.append(("warning", "An app is failing." if failing == 1 else f"{failing} apps are failing."))
    if found.get("security_overdue"):
        alerts.append(("warning", "Security updates have been waiting too long."))
    if found.get("reboot_overdue"):
        alerts.append(("warning", "A restart is overdue."))
    if (health.get("server") or {}).get("updateAvailable"):
        alerts.append(("info", "A newer Automaton release is available."))
    alerts.sort(key=lambda a: _SEVERITY_RANK[a[0]])  # stable: the order above breaks ties
    return [{"severity": severity, "text": text} for severity, text in alerts[:MAX_ALERTS]]


def _backup_badge(health: dict, state: dict, now: float) -> dict:
    found = state.get("found") or {}
    hours = (health.get("backup") or {}).get("lastSuccessAgeHours")
    if found.get("backup_failed"):
        text, tone = "Failed", "critical"
    elif not (health.get("backup") or {}).get("available"):
        text, tone = "Unknown", "info"
    elif hours is None:
        text, tone = "None yet", "critical"
    else:
        text, tone = ago(hours * 3600), "critical" if found.get("backup_old") else "ok"
    return {"type": "badge", "label": "Last backup", "text": text, "tone": tone}


def build_card(state: dict, now: float) -> dict:
    """The card for the last known figures. Without figures it says why instead of showing numbers."""
    health = state.get("health")
    if not health or state.get("status") not in ("ok", "error"):
        waiting = state.get("status") in ("no_key", "not_approved")
        return {"status": "Waiting for approval" if waiting else "No figures yet", "tone": "info" if waiting else "warning",
                "detail": "An administrator must approve server:read for this app." if waiting else "Server Keeper has not read the server yet.",
                "blocks": [{"type": "buttons", "items": [{"label": "Open", "path": "/"}]}]}
    host = health.get("host") or {}
    free = percent(host.get("diskAvailableBytes"), host.get("diskTotalBytes"))
    used = None if free is None else round(100 - free, 1)
    alerts = _alerts(health, state, used)
    worst = alerts[0]["severity"] if alerts else "info"
    status, tone = {"critical": ("Needs attention now", "critical"), "warning": ("Needs attention", "warning")}.get(worst, ("All good", "ok"))
    server = health.get("server") or {}
    blocks: list[dict] = []
    if used is not None:
        blocks.append({"type": "meter", "label": "Disk", "value": used, "max": 100, "unit": "%", "warnAt": DISK_WARN_AT, "critAt": DISK_CRIT_AT})
    blocks.append(_backup_badge(health, state, now))
    if server.get("version"):
        blocks.append({"type": "fact", "label": "Automaton", "value": str(server["version"])[:120]})
    if server.get("updateAvailable"):
        latest = server.get("latestVersion")
        blocks.append({"type": "badge", "label": "Update", "text": str(latest)[:40] if latest else "Available", "tone": "info"})
    blocks.append({"type": "buttons", "items": [{"label": "Update", "path": "/#server"}, {"label": "Backups", "path": "/#backups"}]})
    fetched = state.get("fetchedAt")
    card = {"status": status, "tone": tone, "blocks": blocks, "alerts": alerts}
    if fetched:
        card["detail"] = f"Checked {ago(max(0, now - fetched))}" + ("; the last check failed" if state.get("status") == "error" else "")
    return card
