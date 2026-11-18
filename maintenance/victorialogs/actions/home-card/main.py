#!/usr/bin/env python3
"""Home card for VictoriaLogs: errors and warnings of the last hour.

Prints the card language (https://automaton.monster/schemas/home-card.schema.json): ingestion counters,
a 24 hour log-volume chart and a storage meter. A glance only: details stay in the app.
"""

from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

COUNT_QUERY = '_time:1h | stats by (severity_text) count() c'
AUTOMATON_QUERY = '_time:1h service.name:in("automaton-api", "automaton-worker", "automaton-runner") | stats count() c'
VOLUME_QUERY = '_time:24h | stats by (_time:1h) count() c | sort by (_time)'


class CardError(RuntimeError):
    """A failure that is safe to report."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def base_url(raw: str, own: str = "") -> str:
    """LOGS_URL, or this app's own internal address when the setting is empty."""
    raw = (raw.strip() or own.strip()).rstrip("/")
    parsed = urlparse(raw)
    if not raw:
        raise CardError("Set LOGS_URL to turn the card on.")
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.path not in ("", "/"):
        raise CardError("LOGS_URL must be a plain http(s) address without a path or credentials.")
    return raw


def query(base: str, logsql: str) -> list[dict]:
    body = ("query=" + quote(logsql)).encode()
    request = Request(base + "/select/logsql/query", data=body, method="POST",
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            lines = response.read(1_000_000).decode("utf-8", "replace").splitlines()
    except (HTTPError, URLError, OSError) as error:
        raise CardError(f"VictoriaLogs did not answer: {type(error).__name__}.") from None
    rows = []
    for line in lines:
        if line.strip():
            try:
                rows.append(json.loads(line))
            except ValueError:
                raise CardError("VictoriaLogs sent an answer the Home card cannot read.") from None
    return rows


def storage(base: str) -> tuple[float, float] | None:
    """(used bytes, used + free bytes) from the server's own /metrics, or None when it does not say."""
    try:
        with build_opener(NoRedirect()).open(Request(base + "/metrics"), timeout=15) as response:
            text = response.read(2_000_000).decode("utf-8", "replace")
    except (HTTPError, URLError, OSError):
        return None
    used = free = None
    for line in text.splitlines():
        try:
            name, value = line.rsplit(" ", 1)
            number = float(value)
        except ValueError:
            continue
        if number != number or number in (float("inf"), float("-inf")):
            continue
        if name.startswith("vl_data_size_bytes{") or name == "vl_data_size_bytes":
            used = (used or 0) + number
        elif name.startswith("vl_free_disk_space_bytes{") or name == "vl_free_disk_space_bytes":
            free = number
    return (used, used + free) if used is not None and free is not None else None


def gigabytes(value: float) -> float:
    return round(value / 1e9, 2)


def build_card(counts: list[dict], volume: list[dict], disk: tuple[float, float] | None = None,
               own_logs: int | None = None, endpoint: str = "") -> dict:
    total = errors = warnings = 0
    for row in counts:
        level = str(row.get("severity_text", "")).lower()
        value = int(row.get("c", 0))
        total += value
        if level in ("error", "fatal", "critical"):
            errors += value
        elif level in ("warn", "warning"):
            warnings += value
    blocks: list[dict] = []
    if own_logs == 0:
        where = endpoint or "this app's address"
        blocks.append({"type": "alert", "severity": "info", "text":
                       f"Automaton's own logs are not arriving. Set Logging__Otlp__Endpoint to {where} on the API, Worker and Runners."})
    if errors:
        blocks.append({"type": "alert", "severity": "warning", "text": f"{errors} errors in the last hour"})
    blocks.append({"type": "counters", "items": [
        {"label": "Logs (1h)", "value": total},
        {"label": "Errors", "value": errors, "tone": "critical" if errors else "ok"},
        {"label": "Warnings", "value": warnings, "tone": "warning" if warnings else "ok"},
    ]})
    points = [(str(r.get("_time", ""))[11:16], int(r.get("c", 0))) for r in volume][-24:]
    if len(points) >= 2:
        blocks.append({"type": "chart", "kind": "area", "title": "Log volume, 24 h",
                       "labels": [p[0] for p in points],
                       "series": [{"name": "Logs per hour", "tone": "info", "values": [p[1] for p in points]}]})
    if disk and disk[1] > 0:
        blocks.append({"type": "meter", "label": "Storage", "value": gigabytes(disk[0]), "max": gigabytes(disk[1]),
                       "unit": "GB", "warnAt": gigabytes(disk[1] * 0.8), "critAt": gigabytes(disk[1] * 0.95)})
    status = f"{errors} errors in the last hour" if errors else "No errors in the last hour"
    return {"status": status, "tone": "warning" if errors else "ok", "blocks": blocks}


def own_log_count(base: str) -> int | None:
    rows = query(base, AUTOMATON_QUERY)
    return int(rows[0].get("c", 0)) if rows else 0


def no_data_card(reason: str) -> dict:
    """A card with only its reason: Studio shows one line and a link to the app's settings."""
    return {"status": "No log data", "detail": reason, "tone": "warning", "blocks": []}


def main() -> int:
    try:
        base = base_url(os.environ.get("LOGS_URL", ""), os.environ.get("AUTOMATON_APP_INTERNAL_URL", ""))
        card = build_card(query(base, COUNT_QUERY), query(base, VOLUME_QUERY), storage(base), own_log_count(base), base)
    except CardError as error:
        card = no_data_card(str(error))
    print(json.dumps(card))
    return 0


if __name__ == "__main__":
    sys.exit(main())
