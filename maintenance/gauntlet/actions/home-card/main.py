#!/usr/bin/env python3
"""Gauntlet's home-card Action: asks the running app for its card and prints it as the result.

The platform runs this every 15 minutes in a small container. AUTOMATON_APP_INTERNAL_URL is the address of the running app on
the Runner's private network; the app builds the card from the figures it already holds, so nothing here talks to the server.
A failed run keeps the previous card on Home, so a problem exits with 1 and says what was wrong.
"""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def fetch_card(base: str, opener=None, timeout: float = 15) -> dict:
    if not base.startswith(("http://", "https://")):
        raise ValueError("AUTOMATON_APP_INTERNAL_URL is not an address")
    request = Request(base.rstrip("/") + "/api/home-card", headers={"Accept": "application/json", "User-Agent": "Automaton-Gauntlet-Action/1.0"})
    with (opener or urlopen)(request, timeout=timeout) as response:
        card = json.loads(response.read(64 * 1024).decode("utf-8"))
    if not isinstance(card, dict) or not isinstance(card.get("status"), str):
        raise ValueError("the app answered with something that is not a card")
    return card


def main() -> int:
    base = os.environ.get("AUTOMATON_APP_INTERNAL_URL", "").strip()
    if not base:
        print("Gauntlet is not running, so there is no card to show.", file=sys.stderr)
        return 1
    try:
        print(json.dumps(fetch_card(base), separators=(",", ":")))
        return 0
    except HTTPError as error:
        print(f"The app answered HTTP {error.code}.", file=sys.stderr)
    except (URLError, OSError, ValueError) as error:
        print(f"Could not read the card: {type(error).__name__}.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
