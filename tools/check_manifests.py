#!/usr/bin/env python3
"""Every app folder has a valid automaton.json with declared permissions and a test command.

Usage: check_manifests.py     (checks every folder in catalog-apps.json, and fails on an app folder that is not listed)

Checked: automaton.json parses; `name` and `summary` are set; `application.permissions` is a list (empty is fine:
the app asks for nothing); the app has a test.sh. The server's own contract check is tools/validate_apps.py.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATEGORY_DIRS = ("maintenance", "publishing")


def problems(folder: Path) -> list[str]:
    path = folder / "automaton.json"
    if not path.is_file():
        return ["no automaton.json"]
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as error:
        return [f"automaton.json is not valid JSON: {error}"]
    found = []
    for key in ("name", "summary"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            found.append(f"no {key}")
    permissions = (manifest.get("application") or {}).get("permissions")
    if not isinstance(permissions, list) or not all(isinstance(p, str) for p in permissions):
        found.append("application.permissions is not declared (use [] when the app needs none)")
    if not (folder / "test.sh").is_file():
        found.append("no test.sh (how the app tests itself)")
    return found


def main() -> int:
    listed = {a["folder"] for a in json.loads((ROOT / "catalog-apps.json").read_text())["apps"]}
    on_disk = {f"{cat}/{d.name}" for cat in CATEGORY_DIRS if (ROOT / cat).is_dir() for d in (ROOT / cat).iterdir() if (d / "automaton.json").is_file()}
    failed = False
    for folder in sorted(listed | on_disk):
        found = [] if folder in listed else ["app folder is not in catalog-apps.json"]
        found += problems(ROOT / folder)
        print(("FAIL " if found else "ok   ") + folder + "".join(f"\n       {line}" for line in found))
        failed |= bool(found)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
