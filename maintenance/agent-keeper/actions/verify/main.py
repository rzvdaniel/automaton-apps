#!/usr/bin/env python3
"""The Verify Action: one pass of board.verify with the app's settings and the AGENT_GH_TOKEN secret."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pick"))
import board  # noqa: E402


def main() -> int:
    try:
        config = board.Config.from_env(os.environ)
        result = board.verify(board.GitHub(config.token), config)
    except board.BoardError as error:
        print(json.dumps({"started": False, "version": "", "message": str(error)}))
        print(f"Verify failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
