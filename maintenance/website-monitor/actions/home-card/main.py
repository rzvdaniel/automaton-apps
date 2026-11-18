#!/usr/bin/env python3
"""Home card for Website Monitor: counters, a 24 hour response-time chart and the sites that are down.

Reads the app's own /status.json (AUTOMATON_APP_INTERNAL_URL) and prints the card language
(https://automaton.monster/schemas/home-card.schema.json). A glance only: details stay in the app.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen


class CardError(RuntimeError):
    """A failure that is safe to report."""


def fetch(base: str) -> dict:
    if not base.startswith(("http://", "https://")):
        raise CardError("AUTOMATON_APP_INTERNAL_URL is not set; run this Action from an installed app.")
    try:
        with urlopen(Request(base.rstrip("/") + "/status.json"), timeout=10) as response:
            data = json.loads(response.read(1_000_000))
    except (URLError, OSError, ValueError) as error:
        raise CardError(f"The app did not answer: {type(error).__name__}.") from None
    if not isinstance(data, dict):
        raise CardError("The app sent a status the Home card cannot read.")
    return data


def hourly(history: list, now: float) -> tuple[list[str], list[int]]:
    """Averages the history into up to 24 hourly points, oldest first, skipping hours without a check."""
    buckets: dict[int, list[float]] = {}
    for point in history:
        if isinstance(point, list) and len(point) == 4 and point[1] > 0:
            buckets.setdefault(int(point[0] // 3600), []).append(point[1])
    last = int(now // 3600)
    labels, values = [], []
    for hour in range(last - 23, last + 1):
        if hour in buckets:
            labels.append(datetime.fromtimestamp(hour * 3600, timezone.utc).strftime("%H:00"))
            values.append(round(sum(buckets[hour]) / len(buckets[hour])))
    return labels, values


def build_card(snapshot: dict, now: float) -> dict:
    sites = [s for s in snapshot.get("sites", []) if isinstance(s, dict) and s.get("up") is not None]
    down = [s for s in sites if not s["up"]]
    times = [s["ms"] for s in sites if s["up"] and isinstance(s.get("ms"), (int, float))]
    average = round(sum(times) / len(times)) if times else None
    if not sites:
        return {"status": "No sites yet", "tone": "info",
                "blocks": [{"type": "buttons", "items": [{"label": "See sites", "path": "/"}]}]}
    status = f"{len(down)} of {len(sites)} sites down" if down else f"All {len(sites)} sites up"
    blocks: list[dict] = [{"type": "counters", "items": [
        {"label": "Up", "value": str(len(sites) - len(down)), "tone": "ok"},
        {"label": "Down", "value": str(len(down)), "tone": "critical" if down else "ok"},
        {"label": "Avg ms", "value": "-" if average is None else str(average)},
    ]}]
    labels, values = hourly(snapshot.get("history", []), now)
    if len(values) >= 2:
        blocks.append({"type": "chart", "kind": "area", "title": "Response time, 24 h", "labels": labels,
                       "series": [{"name": "Average ms", "tone": "info", "values": values}]})
    if down:
        blocks.append({"type": "list", "rows": [
            {"text": str(s.get("site", ""))[:120], "note": str(s.get("error") or "down")[:120], "tone": "critical"}
            for s in down[:5]]})
    blocks.append({"type": "buttons", "items": [{"label": "See sites", "path": "/"}]})
    card = {"status": status, "tone": "critical" if down else "ok", "blocks": blocks}
    if down:
        card["blocks"].insert(0, {"type": "alert", "severity": "critical", "text": f"{len(down)} of {len(sites)} sites are down"})
    return card


def main() -> int:
    import time
    try:
        card = build_card(fetch(os.environ.get("AUTOMATON_APP_INTERNAL_URL", "")), time.time())
    except CardError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(card))
    return 0


if __name__ == "__main__":
    sys.exit(main())
