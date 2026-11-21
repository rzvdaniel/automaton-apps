#!/usr/bin/env python3
"""Overseer's release-check Action: tells the running app a new server release exists ({"version": "0.2.176"}).

The app answers at once (the upgrade and the check go on in the app), so a repeated call for the same version returns
"already started" and does nothing. AUTOMATON_APP_INTERNAL_URL and ADMIN_TOKEN are set by the platform and the app's secrets.
"""

import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

VERSION = re.compile(r"^(server-v|v)?\d{1,4}\.\d{1,4}\.\d{1,4}$")


def release_check(base: str, token: str, version: str, opener=urlopen, timeout: float = 30) -> dict:
    if not base.startswith(("http://", "https://")):
        raise ValueError("AUTOMATON_APP_INTERNAL_URL is not an address")
    if not VERSION.match(version):
        raise ValueError('the input must be {"version": "0.2.176"}')
    if len(token) < 16:
        raise ValueError("the ADMIN_TOKEN secret is not set (at least 16 characters)")
    request = Request(f"{base.rstrip('/')}/api/release-check", json.dumps({"version": version}).encode(),
                      {"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Automaton-Overseer-Action/1.0"}, method="POST")
    try:
        with opener(request, timeout=timeout) as response:
            return json.loads(response.read())
    except HTTPError as error:
        try:
            detail = json.loads(error.read()).get("text")
        except (ValueError, AttributeError):
            detail = None
        raise RuntimeError(f"Overseer answered {error.code}" + (f": {detail}" if detail else ""))
    except (URLError, OSError) as error:
        raise RuntimeError("could not reach Overseer: " + type(error).__name__)


def main() -> int:
    try:
        data = json.load(sys.stdin)
        result = release_check(os.environ.get("AUTOMATON_APP_INTERNAL_URL", ""), os.environ.get("ADMIN_TOKEN", "").strip(),
                               str(data.get("version", "")) if isinstance(data, dict) else "")
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
