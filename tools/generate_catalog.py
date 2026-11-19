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

OFFICIAL_REPO = "rzvdaniel/automaton-apps"
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
    repo = config.get("repo", OFFICIAL_REPO)
    default_publisher = config.get("publisher")  # who made the apps unless an entry says otherwise
    apps = []
    for item in config["apps"]:
        folder = item["folder"]
        manifest = json.loads((ROOT / folder / "automaton.json").read_text(encoding="utf-8"))
        entry = {
            "id": folder.rsplit("/", 1)[-1],
            "name": manifest["name"],
            "summary": manifest["summary"],
            "category": item["category"],
            "folder": folder,
            "commit": pinned_commit(folder),
            "minServerVersion": item["minServerVersion"],
            "permissions": manifest.get("application", {}).get("permissions", []),
        }
        publisher = item.get("publisher", default_publisher)
        if publisher:  # Studio shows "by <name>" and a small logo; the server alone decides who is verified
            entry["publisher"] = publisher
        if item.get("recommended") is True:  # Studio Home suggests these to administrators until installed
            entry["recommended"] = True
            if isinstance(item.get("recommendedOrder"), int):  # lower comes first; apps without one come last
                entry["recommendedOrder"] = item["recommendedOrder"]
        if item.get("movedFrom"):  # the app used to be in the official catalog: servers that installed it there follow it here
            entry["movedFrom"] = item["movedFrom"]
        apps.append(entry)
    return {"schemaVersion": SCHEMA_VERSION, "repo": repo, "apps": apps}


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
        moved = app.get("movedFrom")
        if moved is not None and (moved.get("repo") != OFFICIAL_REPO or not FOLDER.fullmatch(moved.get("folder", ""))):
            found.append(f"{app['id']}: movedFrom must name a folder of {OFFICIAL_REPO}")
        publisher = app.get("publisher")
        if publisher is not None:
            name, logo = publisher.get("name"), publisher.get("logo")
            if not isinstance(name, str) or not name.strip() or len(name) > 80:
                found.append(f"{app['id']}: publisher needs a name of at most 80 characters")
            if logo is not None and not (isinstance(logo, str) and (logo.startswith("https://") or logo.startswith("/") and not logo.startswith("//"))):
                found.append(f"{app['id']}: publisher logo must be an https:// address or a path")
        for field in ("name", "summary", "category"):
            if not app[field].strip():
                found.append(f"{app['id']}: {field} is empty")
    return found


def missing_descriptions() -> list:
    """Settings and secrets without a description; Studio shows it under the name, so a bare name is a warning."""
    config = json.loads((ROOT / "catalog-apps.json").read_text(encoding="utf-8"))
    found = []
    for item in config["apps"]:
        path = f"{item['folder']}/automaton.json"
        application = json.loads((ROOT / path).read_text(encoding="utf-8")).get("application", {})
        for kind in ("settings", "secrets"):
            for declared in application.get(kind, []):
                if not str(declared.get("description") or "").strip():
                    found.append((path, f"{kind[:-1]} {declared.get('name')} has no description; Studio shows it under the name"))
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
        for path, text in missing_descriptions():
            print(f"::warning file={path}::{text}")  # a warning in the pull request checks, never a failure
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
