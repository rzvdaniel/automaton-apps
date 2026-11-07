#!/usr/bin/env python3
"""Fails when an app's copy of the UI kit (ui/app.css, ui/app.js) differs from design/automaton-app-ui/.

Apps are installed from their own folder, so each one vendors a copy of the kit. A copy must be byte-identical:
change the kit and copy it again instead of editing a copy.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "design" / "automaton-app-ui"
VENDORED = ("app.css", "app.js")


def check(root: Path = ROOT) -> list[str]:
    kit = root / "design" / "automaton-app-ui"
    problems: list[str] = []
    for name in VENDORED:
        if not (kit / name).is_file():
            problems.append(f"the kit file design/automaton-app-ui/{name} is missing")
    if problems:
        return problems
    for folder in sorted(root.glob("*/*/ui")):
        if not folder.is_dir():
            continue
        for name in VENDORED:
            copy = folder / name
            if copy.is_file() and copy.read_bytes() != (kit / name).read_bytes():
                problems.append(f"{copy.relative_to(root).as_posix()} differs from design/automaton-app-ui/{name}: "
                                "change the kit and copy it again, never edit a vendored copy")
    return problems


if __name__ == "__main__":
    found = check()
    for line in found:
        print(line, file=sys.stderr)
    sys.exit(1 if found else 0)
