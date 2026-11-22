"""Shared by Overseer's job Actions (pick-up, stall-check, report, lessons): asks the running app to run one job.

Each Action folder holds an identical copy of this file, because the platform packages every Action folder on its own
(test_jobs.py fails when a copy differs). AUTOMATON_APP_INTERNAL_URL is the app's address on the Runner's private network and
ADMIN_TOKEN is the app's secret; the app does the work, so nothing here reaches the queue machine.
A failed job exits with 1 and says why, so the run shows as failed in Studio.
"""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def run_job(base: str, token: str, job: str, opener=urlopen, timeout: float = 150) -> dict:
    if not base.startswith(("http://", "https://")):
        raise ValueError("AUTOMATON_APP_INTERNAL_URL is not an address")
    if len(token) < 16:
        raise ValueError("the ADMIN_TOKEN secret is not set (at least 16 characters)")
    request = Request(f"{base.rstrip('/')}/api/jobs/{job}", b"{}", {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                                                   "User-Agent": "Automaton-Overseer-Action/1.0"}, method="POST")
    try:
        with opener(request, timeout=timeout) as response:
            return json.loads(response.read())
    except HTTPError as error:
        try:
            answer = json.loads(error.read())
            detail = answer.get("text") or answer.get("error")
        except (ValueError, AttributeError):
            detail = None
        raise RuntimeError(f"Overseer answered {error.code}" + (f": {detail}" if detail else ""))
    except (URLError, OSError) as error:
        raise RuntimeError("could not reach Overseer: " + type(error).__name__)


def main(job: str) -> int:
    try:
        result = run_job(os.environ.get("AUTOMATON_APP_INTERNAL_URL", ""), os.environ.get("ADMIN_TOKEN", "").strip(), job)
        if isinstance(result, dict) and result.get("text"):
            print(f"{job}: {result['text']}", file=sys.stderr)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
