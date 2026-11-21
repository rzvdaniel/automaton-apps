#!/usr/bin/env python3
"""Gauntlet's full-cycle Action: asks the running app to start this plan, and prints the run it started.

The platform runs this on the schedule Gauntlet offers at install (Studio -> Actions: change, pause or run it there).
AUTOMATON_APP_INTERNAL_URL is the app's address on the Runner's private network and ADMIN_TOKEN is the app's secret. The app runs
the plan in the background (one at a time) and keeps the step logs in its Reports, so this returns as soon as the run has started.
A refused start (another run in progress, a machine that is not disposable) exits with 1 and says why, so Studio shows it as failed.
The four plan folders hold the same file; only PLAN differs (test_plan_actions.py keeps them in step).
"""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PLAN = "full-cycle"


def start_plan(base: str, token: str, plan: str = PLAN, opener=urlopen, timeout: float = 30) -> dict:
    if not base.startswith(("http://", "https://")):
        raise ValueError("AUTOMATON_APP_INTERNAL_URL is not an address")
    if len(token) < 16:
        raise ValueError("the ADMIN_TOKEN secret is not set (at least 16 characters)")
    request = Request(base.rstrip("/") + "/api/runs", json.dumps({"plan": plan, "trigger": "action"}).encode(),
                      {"Authorization": "Bearer " + token, "Content-Type": "application/json", "X-Gauntlet": "1",
                       "User-Agent": "Automaton-Gauntlet-Action/1.0"}, method="POST")
    try:
        with opener(request, timeout=timeout) as response:
            return {"plan": plan, "run": json.loads(response.read(4096))["id"]}
    except HTTPError as error:
        try:
            detail = json.loads(error.read(4096)).get("error")
        except (ValueError, AttributeError):
            detail = None
        raise RuntimeError(f"Gauntlet answered {error.code}" + (f": {detail}" if detail else ""))
    except (URLError, OSError) as error:
        raise RuntimeError("could not reach Gauntlet: " + type(error).__name__)


def main() -> int:
    try:
        print(json.dumps(start_plan(os.environ.get("AUTOMATON_APP_INTERNAL_URL", ""), os.environ.get("ADMIN_TOKEN", "").strip()), separators=(",", ":")))
        return 0
    except (ValueError, RuntimeError, KeyError) as error:
        print(str(error) or "Gauntlet gave an unexpected answer", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
