"""GitHub and server health sync for Release Keeper."""

import json
import os
import re
import urllib.error
import urllib.request
from store import Store, utc_now_iso


def _http_get_json(url: str, headers: dict | None = None, timeout: int = 15):
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_post_json(url: str, body: dict, headers: dict | None = None, timeout: int = 15):
    data = json.dumps(body).encode("utf-8")
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_server_version(api_url: str, getter=_http_get_json) -> str:
    if not api_url:
        return ""
    base = api_url.rstrip("/")
    for path in ("/health", "/api/health"):
        try:
            data = getter(f"{base}{path}", timeout=8)
            if isinstance(data, dict):
                ver = data.get("version") or data.get("serverVersion") or ""
                if ver:
                    return str(ver).lstrip("v")
        except Exception:
            continue
    return ""


def _gh_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "release-keeper/1.0",
    }


def fetch_board_pipeline(owner: str, board_number: int, token: str, poster=_http_post_json) -> tuple[dict, list]:
    query = """
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              content {
                ... on Issue {
                  number
                  title
                  url
                  state
                  repository { nameWithOwner }
                }
              }
            }
          }
        }
      }
    }
    """
    resp = poster(
        "https://api.github.com/graphql",
        {"query": query, "variables": {"login": owner, "number": board_number}},
        headers=_gh_headers(token),
        timeout=20,
    )
    nodes = (
        resp.get("data", {})
        .get("user", {})
        .get("projectV2", {})
        .get("items", {})
        .get("nodes", [])
    )
    counts = {"Inbox": 0, "Ready": 0, "In progress": 0, "Verify": 0, "Done": 0}
    verify_items = []
    for node in nodes:
        status = (node.get("fieldValueByName") or {}).get("name") or ""
        content = node.get("content") or {}
        if status in counts:
            counts[status] += 1
        if status == "Verify" and content.get("number"):
            verify_items.append(
                {
                    "number": content["number"],
                    "title": content.get("title", ""),
                    "url": content.get("url", ""),
                    "repo": (content.get("repository") or {}).get("nameWithOwner", ""),
                }
            )
    return counts, verify_items


def _extract_area(labels: list[dict]) -> str:
    for lbl in labels:
        name = lbl.get("name", "")
        if name.startswith("area:"):
            return name.split(":", 1)[1].strip().capitalize()
    return "General"


def _parse_lesson_body(body: str) -> tuple[str, str, int]:
    change_text = ""
    rec_text = ""
    times = 1
    if body:
        m_times = re.search(r"(?:times|occurrences|count)\s*[:=]\s*(\d+)", body, re.I)
        if m_times:
            times = max(1, int(m_times.group(1)))
        parts = re.split(r"###?\s*Recommendation\s*", body, flags=re.I)
        change_text = parts[0].strip()[:800]
        if len(parts) > 1:
            rec_text = parts[1].strip()[:600]
    return change_text, rec_text, times


def run_sync(store: Store, getter=_http_get_json, poster=_http_post_json) -> dict:
    repos_raw = os.environ.get("RK_REPOS", "rzvdaniel/automaton,rzvdaniel/automaton-apps")
    repos = [r.strip() for r in repos_raw.split(",") if r.strip()]
    board_number = int(os.environ.get("RK_BOARD_NUMBER", "17") or "17")
    board_owner = os.environ.get("RK_BOARD_OWNER", "rzvdaniel")
    prod_url = os.environ.get("RK_PROD_API_URL", "https://api.automaton.monster")
    test_url = os.environ.get("RK_TEST_API_URL", "https://api.runner-01.automaton.monster")
    token = os.environ.get("RK_GH_TOKEN", "").strip()

    prod_ver = fetch_server_version(prod_url, getter=getter)
    test_ver = fetch_server_version(test_url, getter=getter)
    if prod_ver:
        store.set_meta("prod_version", prod_ver)
    if test_ver:
        store.set_meta("test_version", test_ver)

    if not token:
        err = "RK_GH_TOKEN is not set; skipped GitHub sync"
        store.set_meta("last_sync_at", utc_now_iso())
        store.set_meta("last_sync_error", err)
        return {"ok": False, "error": err, "prod_version": prod_ver, "test_version": test_ver}

    headers = _gh_headers(token)
    synced_releases = 0
    synced_lessons = 0
    errors = []

    if repos:
        primary_repo = repos[0]
        try:
            releases = getter(f"https://api.github.com/repos/{primary_repo}/releases?per_page=30", headers=headers)
            for rel in releases:
                tag = str(rel.get("tag_name") or "").lstrip("v")
                if not tag:
                    continue
                is_prod = bool(prod_ver and tag == prod_ver)
                is_test = bool(test_ver and tag == test_ver)
                state = "deployed" if is_prod else "ready"
                store.upsert_release(
                    {
                        "version": tag,
                        "released_at": rel.get("published_at") or rel.get("created_at") or utc_now_iso(),
                        "prod_at": utc_now_iso() if is_prod else "",
                        "test_at": utc_now_iso() if is_test else "",
                        "verified": "passed" if is_prod else "pending",
                        "state": state,
                        "notes": rel.get("body") or "",
                        "url": rel.get("html_url") or "",
                    }
                )
                synced_releases += 1
        except Exception as exc:
            errors.append(f"releases ({primary_repo}): {exc}")

    for repo in repos:
        try:
            issues = getter(
                f"https://api.github.com/repos/{repo}/issues?labels=lesson&state=all&per_page=50",
                headers=headers,
            )
            for iss in issues:
                if "pull_request" in iss:
                    continue
                num = iss.get("number", 0)
                short_repo = repo.split("/")[-1]
                lid = f"{short_repo}#{num}"
                is_closed = iss.get("state") == "closed"
                change_text, rec_text, times = _parse_lesson_body(iss.get("body") or "")
                store.upsert_lesson(
                    {
                        "id": lid,
                        "repo": repo,
                        "number": num,
                        "title": iss.get("title") or f"Lesson #{num}",
                        "area": _extract_area(iss.get("labels", [])),
                        "filed_at": iss.get("created_at") or utc_now_iso(),
                        "times": times,
                        "state": "fixed" if is_closed else "open",
                        "fix": "Fixed" if is_closed else "Needs triage",
                        "change_text": change_text,
                        "rec_text": rec_text,
                        "happened": [[(iss.get("created_at") or "")[:10], iss.get("title") or ""]],
                        "url": iss.get("html_url") or "",
                    }
                )
                synced_lessons += 1
        except Exception as exc:
            errors.append(f"lessons ({repo}): {exc}")

    pipeline = {"Inbox": 0, "Ready": 0, "In progress": 0, "Verify": 0, "Done": 0}
    verify_items = []
    try:
        pipeline, verify_items = fetch_board_pipeline(board_owner, board_number, token, poster=poster)
        store.set_meta_json("pipeline", pipeline)
        store.set_meta_json("verify_items", verify_items)
    except Exception as exc:
        errors.append(f"board {board_number}: {exc}")

    needs_you = []
    for item in verify_items[:5]:
        needs_you.append(
            {
                "kind": "verify",
                "title": f"Verify #{item['number']}: {item['title']}",
                "action": "Open",
                "href": item["url"],
            }
        )
    store.set_meta_json("needs_you", needs_you)

    now = utc_now_iso()
    store.set_meta("last_sync_at", now)
    store.set_meta("last_sync_error", "; ".join(errors))
    return {
        "ok": len(errors) == 0,
        "synced_releases": synced_releases,
        "synced_lessons": synced_lessons,
        "prod_version": prod_ver,
        "test_version": test_ver,
        "pipeline": pipeline,
        "errors": errors,
        "synced_at": now,
    }
