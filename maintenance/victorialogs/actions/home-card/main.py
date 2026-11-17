#!/usr/bin/env python3
"""Home card for VictoriaLogs: errors and warnings of the last hour.

Prints {"status", "facts", "alerts"}: plain text, at most 3 facts.
"""

from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

COUNT_QUERY = '_time:1h severity_text:~"(?i)^(error|warn|warning|fatal|critical)$" | stats by (severity_text) count() c'
SOURCE_QUERY = '_time:1h severity_text:~"(?i)^(error|fatal|critical)$" | stats by (service.name) count() c | sort by (c desc) | limit 1'


class CardError(RuntimeError):
    """A failure that is safe to report."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def base_url(raw: str) -> str:
    raw = raw.strip().rstrip("/")
    parsed = urlparse(raw)
    if not raw:
        raise CardError("Set the LOGS_URL setting to turn the Home card on.")
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
            rows.append(json.loads(line))
    return rows


def build_card(counts: list[dict], top_sources: list[dict]) -> dict:
    errors = warnings = 0
    for row in counts:
        level = str(row.get("severity_text", "")).lower()
        value = int(row.get("c", 0))
        if level in ("error", "fatal", "critical"):
            errors += value
        else:
            warnings += value
    facts = [{"label": "Errors (1h)", "value": str(errors)}, {"label": "Warnings (1h)", "value": str(warnings)}]
    if top_sources and errors:
        facts.append({"label": "Top source", "value": str(top_sources[0].get("service.name", "unknown"))[:60]})
    alerts = []
    if errors:
        alerts.append({"severity": "warning", "text": f"{errors} errors in the last hour"})
    status = f"{errors} errors in the last hour" if errors else "No errors in the last hour"
    return {"status": status, "facts": facts[:3], "alerts": alerts}


def main() -> int:
    try:
        base = base_url(os.environ.get("LOGS_URL", ""))
        card = build_card(query(base, COUNT_QUERY), query(base, SOURCE_QUERY))
    except CardError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(card))
    return 0


if __name__ == "__main__":
    sys.exit(main())
