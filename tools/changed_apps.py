#!/usr/bin/env python3
"""Print the app folders (from catalog-apps.json) a change touches, as a JSON list for a workflow matrix.

Usage: changed_apps.py [--base <git-ref>]     (without --base: every app)

An app is touched by a change in its own folder. A change in tools/ or in this script's workflow runs every app;
a change in design/automaton-app-ui/ runs the apps that vendor the kit (they have a ui/ folder).
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def app_folders(root=ROOT):
    return [a["folder"] for a in json.loads((root / "catalog-apps.json").read_text())["apps"]]


def select(folders, changed, has_ui=lambda folder: False):
    if any(c.startswith(("tools/", ".github/workflows/app-tests.yml")) for c in changed):
        return list(folders)
    kit = any(c.startswith("design/automaton-app-ui/") for c in changed)
    return [f for f in folders if any(c.startswith(f + "/") for c in changed) or (kit and has_ui(f))]


def main(argv):
    folders = app_folders()
    if "--base" not in argv:
        print(json.dumps(folders))
        return 0
    base = argv[argv.index("--base") + 1]
    out = subprocess.run(["git", "diff", "--name-only", f"{base}...HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    print(json.dumps(select(folders, out.split(), lambda f: (ROOT / f / "ui").is_dir())))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
