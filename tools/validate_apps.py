#!/usr/bin/env python3
"""Run the server's own manifest validation (`automaton validate`) on catalog app folders.

Usage: validate_apps.py [--changed-since <git-ref>]   (default: every app in catalog-apps.json)

Only the `applicationContract` check is used: the CLI's other checks need a linked app and a login.
"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folders = [a["folder"] for a in json.loads((root / "catalog-apps.json").read_text())["apps"]]
if "--changed-since" in sys.argv:
    ref = sys.argv[sys.argv.index("--changed-since") + 1]
    changed = subprocess.run(["git", "diff", "--name-only", ref, "HEAD"], cwd=root, check=True,
                             capture_output=True, text=True).stdout.split()
    folders = [f for f in folders if any(c.startswith(f + "/") for c in changed)]

failed = False
for folder in folders:
    with tempfile.TemporaryDirectory() as tmp:  # a copy, so a local link to a server does not matter
        shutil.copytree(root / folder, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".automaton", "node_modules"))
        out = subprocess.run(["automaton", "validate", "--json", "--non-interactive"], cwd=tmp,
                             capture_output=True, text=True).stdout
    check = next(c for c in json.loads(out)["checks"] if c["name"] == "applicationContract")
    print(f"{'ok  ' if check['success'] else 'FAIL'} {folder}: {check['error']}")
    failed |= not check["success"]
sys.exit(1 if failed else 0)
