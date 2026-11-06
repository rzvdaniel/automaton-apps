#!/usr/bin/env python3
"""Builds catalog.json, the index every Automaton server reads, from catalog-apps.json and each app's automaton.json.

  generate_catalog.py [--out FILE]  write the catalog (default: catalog.json next to the README, which git ignores)
  generate_catalog.py --validate    fail when an entry is invalid (used on pull requests, where pinned commits are not final)
  generate_catalog.py --check FILE  fail when FILE differs from the catalog generated now

Each app is pinned to the last commit that changed its folder, so an install always gets the files that were listed.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = "rzvdaniel/automaton-apps"
SCHEMA_VERSION = 1
ROOT = Path(__file__).resolve().parent.parent
SHA = re.compile(r"^[0-9a-f]{40}$")
VERSION = re.compile(r"^\d+\.\d+\.\d+$")
FOLDER = re.compile(r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")  # the same rule servers apply


def pinned_commit(folder: str) -> str:
    out = subprocess.run(["git", "log", "-1", "--format=%H", "--", folder], cwd=ROOT, capture_output=True, text=True, check=True)
    return out.stdout.strip()


def build() -> dict:
    config = json.loads((ROOT / "catalog-apps.json").read_text(encoding="utf-8"))
    apps = []
    for item in config["apps"]:
        folder = item["folder"]
        manifest = json.loads((ROOT / folder / "automaton.json").read_text(encoding="utf-8"))
        apps.append({
            "id": folder.rsplit("/", 1)[-1],
            "name": manifest["name"],
            "summary": manifest["summary"],
            "category": item["category"],
            "folder": folder,
            "commit": pinned_commit(folder),
            "minServerVersion": item["minServerVersion"],
            "permissions": manifest.get("application", {}).get("permissions", []),
        })
    return {"schemaVersion": SCHEMA_VERSION, "repo": REPO, "apps": apps}


def problems(catalog: dict) -> list:
    found = []
    ids = [app["id"] for app in catalog["apps"]]
    if len(ids) != len(set(ids)):
        found.append("duplicate app id")
    for app in catalog["apps"]:
        if not SHA.match(app["commit"]):
            found.append(f"{app['id']}: no pinned commit (is the folder committed?)")
        if not FOLDER.fullmatch(app["folder"]) or len(app["folder"]) > 300 or {".", ".."} & set(app["folder"].split("/")):
            found.append(f"{app['id']}: folder name is not allowed")
        if not VERSION.match(app["minServerVersion"]):
            found.append(f"{app['id']}: minServerVersion must look like 1.2.3")
        for field in ("name", "summary", "category"):
            if not app[field].strip():
                found.append(f"{app['id']}: {field} is empty")
    return found


def render(catalog: dict) -> str:
    return json.dumps(catalog, indent=2) + "\n"


def main() -> int:
    catalog = build()
    bad = problems(catalog)
    if bad:
        print("\n".join(bad), file=sys.stderr)
        return 1
    if "--validate" in sys.argv:
        return 0
    text = render(catalog)
    if "--check" in sys.argv:
        target = Path(sys.argv[sys.argv.index("--check") + 1])
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            print(f"{target} is not the catalog generated from main.", file=sys.stderr)
            return 1
        return 0
    target = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else ROOT / "catalog.json"
    target.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
