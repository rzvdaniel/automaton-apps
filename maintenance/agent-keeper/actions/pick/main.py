#!/usr/bin/env python3
"""The Pick up Action: one pass of board.pick_up with the app's settings and the AGENT_GH_TOKEN secret."""

from __future__ import annotations

import json
import os
import sys

import board


def main() -> int:
    try:
        config = board.Config.from_env(os.environ)
        result = board.pick_up(board.GitHub(config.token), config)
    except board.BoardError as error:
        print(json.dumps({"picked": "", "message": str(error), "moved": []}))
        print(f"Pick up failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
