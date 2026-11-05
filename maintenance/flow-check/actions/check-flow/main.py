#!/usr/bin/env python3
"""Check that GitHub issues went through the delivery flow. Plain Python, standard library only."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = "https://api.github.com"
MARKER = "<!-- flow-check -->"
LABEL = "flow-gap"
TEST_PATH = re.compile(r"(^|/)(tests?|__tests__|UnitTests)/|[._-]tests?\.|Tests?\.cs$|test_[^/]*\.py$|\.spec\.[jt]s$", re.I)
UNIT_ONLY = re.compile(r"unit tests? only|not checked|no end-to-end|unit-test", re.I)
E2E = re.compile(r"end[- ]to[- ]end|test server|e2e", re.I)


class Github:
    """Minimal GitHub client; `token` empty means public, read-only."""

    def __init__(self, token: str = "", opener=urlopen):
        self.token, self.opener = token, opener

    def get(self, path: str):
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "automaton-flow-check"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            with self.opener(Request(API + path, headers=headers), timeout=30) as response:
                return json.loads(response.read())
        except HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (401, 403):
                raise RuntimeError(f"GitHub refused the request ({error.code}): rate limit or missing token permission")
            raise

    def post(self, path: str, body: dict, method: str = "POST"):
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "automaton-flow-check",
                   "Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        with self.opener(Request(API + path, json.dumps(body).encode(), headers, method=method), timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None


def result(name: str, status: str, detail: str) -> dict:
    return {"check": name, "status": status, "detail": detail}


def find_pr(gh: Github, repo: str, issue: int):
    """The merged (else latest) PR that references the issue, from the issue timeline."""
    events = gh.get(f"/repos/{repo}/issues/{issue}/timeline?per_page=100") or []
    numbers = [e["source"]["issue"]["number"] for e in events
               if e.get("event") == "cross-referenced" and "pull_request" in e.get("source", {}).get("issue", {})
               and e["source"]["issue"].get("repository", {}).get("full_name") == repo]
    prs = [p for p in (gh.get(f"/repos/{repo}/pulls/{n}") for n in dict.fromkeys(numbers)) if p]
    ref = re.compile(rf"#{issue}\b")
    prs = [p for p in prs if p["base"]["ref"] == "main" and ref.search((p.get("title") or "") + " " + (p.get("body") or ""))]
    merged = [p for p in prs if p.get("merged_at")]
    return (merged or prs or [None])[-1]


def check_review(gh, repo, pr) -> dict:
    reviews = [r for r in gh.get(f"/repos/{repo}/pulls/{pr['number']}/reviews?per_page=100") or []
               if r.get("state") in ("APPROVED", "COMMENTED", "CHANGES_REQUESTED")]
    if not reviews:
        return result("review", "fail", "no formal review on the PR")
    head = pr["head"]["sha"]
    last = reviews[-1]
    if last["commit_id"] != head:
        return result("review", "fail", f"last review is on {last['commit_id'][:7]}, final commit is {head[:7]}")
    same = last["user"]["login"] == pr["user"]["login"]
    if same:
        return result("review", "warn", f"review on final commit is by the PR author's login ({last['user']['login']}); agents share it, so independence cannot be checked")
    return result("review", "pass", f"review on final commit by {last['user']['login']}")


def check_tests(gh, repo, pr) -> dict:
    files = gh.get(f"/repos/{repo}/pulls/{pr['number']}/files?per_page=100") or []
    tests = [f["filename"] for f in files if TEST_PATH.search(f["filename"])]
    return result("tests", "pass", f"{len(tests)} test file(s): {tests[0]}") if tests else \
        result("tests", "fail", "the PR diff contains no test files")


def check_ci(gh, repo, pr) -> dict:
    sha = pr.get("merge_commit_sha") or pr["head"]["sha"]
    runs = (gh.get(f"/repos/{repo}/commits/{sha}/check-runs?per_page=100") or {}).get("check_runs", [])
    if not runs:
        return result("ci", "fail", f"no checks on {sha[:7]}")
    bad = [r["name"] for r in runs if r["conclusion"] not in ("success", "skipped", "neutral")]
    return result("ci", "fail", f"not passing on {sha[:7]}: {', '.join(bad)}") if bad else \
        result("ci", "pass", f"{len(runs)} check(s) passed on {sha[:7]}")


def check_proof(gh, repo, issue, token) -> dict:
    if not token:
        return result("proof", "unknown", "reading issue artifacts needs GITHUB_TOKEN")
    arts = gh.get(f"/repos/{repo}/issues/{issue}/artifacts")
    proof = next((a for a in arts or [] if a.get("name") == "proof"), None)
    if not proof:
        return result("proof", "fail", "no `proof` artifact on the issue")
    text = re.sub(r"<[^>]+>", " ", proof.get("body", ""))
    release = re.search(r"\b\d+\.\d+\.\d+\b", text)
    if not release:
        return result("proof", "fail", "proof does not name a release")
    if UNIT_ONLY.search(text) and not E2E.search(text):
        return result("proof", "warn", f"release {release[0]}, unit tests only")
    return result("proof", "pass", f"release {release[0]}" + ("" if E2E.search(text) else ", level not stated"))


def production_version(api_url: str, opener=urlopen) -> str | None:
    try:
        with opener(Request(api_url.rstrip("/") + "/health", headers={"User-Agent": "automaton-flow-check"}), timeout=15) as r:
            return json.loads(r.read()).get("version")
    except (URLError, ValueError, AttributeError, HTTPError, OSError):
        return None


def check_production(gh, repo, pr, version) -> dict:
    if not pr.get("merge_commit_sha"):
        return result("production", "fail", "the PR is not merged")
    if not version:
        return result("production", "fail", "production does not report its version, so the merge commit cannot be confirmed")
    tag = gh.get(f"/repos/{repo}/git/ref/tags/server-v{version}")
    if not tag:
        return result("production", "fail", f"no release tag server-v{version}")
    sha = pr["merge_commit_sha"]
    cmp = gh.get(f"/repos/{repo}/compare/{sha}...server-v{version}")
    if cmp and cmp.get("status") in ("ahead", "identical"):
        return result("production", "pass", f"production {version} contains {sha[:7]}")
    return result("production", "fail", f"production {version} does not contain {sha[:7]}")


def check_issue(gh, repo, issue, token, version) -> dict:
    info = gh.get(f"/repos/{repo}/issues/{issue}")
    if not info:
        return {"issue": issue, "error": "issue not found or not readable"}
    labels = [l["name"] for l in info["labels"]]
    pr = find_pr(gh, repo, issue)
    if not pr:
        checks = [result("pr", "fail", "no pull request references the issue")]
    else:
        checks = [check_review(gh, repo, pr), check_tests(gh, repo, pr), check_ci(gh, repo, pr),
                  check_proof(gh, repo, issue, token), check_production(gh, repo, pr, version)]
        if info["state"] == "open" and checks[-1]["status"] == "fail":
            checks[-1] = result("production", "warn", checks[-1]["detail"] + " (issue is still open)")
        if info["state"] == "closed" and not ({"verified", "live"} & set(labels)):
            checks.append(result("label", "fail", "closed without the verified or live label"))
    return {"issue": issue, "title": info["title"], "state": info["state"], "labels": labels, "pr": pr and pr["number"],
            "checks": checks, "gaps": [c["check"] for c in checks if c["status"] == "fail"]}


def recent_issues(gh, repo) -> list[int]:
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 7 * 86400))
    closed = gh.get(f"/repos/{repo}/issues?state=closed&since={since}&per_page=50") or []
    verified = gh.get(f"/repos/{repo}/issues?state=open&labels=verified&per_page=50") or []
    closed = [i for i in closed if i.get("state_reason") != "not_planned" and (i.get("closed_at") or "") >= since]
    return sorted({i["number"] for i in closed + verified if "pull_request" not in i})


def report(gh, repo, outcome) -> str:
    """Token mode only: sync the flow-gap label and one comment with the gaps."""
    n, gaps, labels = outcome["issue"], outcome["gaps"], outcome["labels"]
    if gaps:
        lines = [f"- {c['check']}: {c['status']}, {c['detail']}" for c in outcome["checks"] if c["status"] != "pass"]
        body = f"{MARKER}\nFlow check found gaps:\n" + "\n".join(lines)
        comments = gh.get(f"/repos/{repo}/issues/{n}/comments?per_page=100") or []
        mine = next((c for c in comments if c["body"].startswith(MARKER)), None)
        if mine and mine["body"] == body:
            return "unchanged"
        if mine:
            gh.post(f"/repos/{repo}/issues/comments/{mine['id']}", {"body": body}, "PATCH")
        else:
            gh.post(f"/repos/{repo}/issues/{n}/comments", {"body": body})
        if LABEL not in labels:
            gh.post(f"/repos/{repo}/issues/{n}/labels", {"labels": [LABEL]})
        return "commented"
    if LABEL in labels:
        try:
            gh.post(f"/repos/{repo}/issues/{n}/labels/{LABEL}", {}, "DELETE")
        except HTTPError:
            pass
        return "label removed"
    return "ok"


def run(issue: int | None, env=os.environ, gh: Github | None = None, version=None) -> dict:
    repo = env.get("REPO", "").strip() or "rzvdaniel/automaton"
    token = env.get("GITHUB_TOKEN", "").strip()
    gh = gh or Github(token)
    version = version or production_version(env.get("PRODUCTION_API_URL", "").strip() or "https://api.automaton.monster")
    numbers = [issue] if issue else recent_issues(gh, repo)
    outcomes = [check_issue(gh, repo, n, token, version) for n in numbers]
    if token and not issue:
        for o in outcomes:
            if "checks" in o:
                o["report"] = report(gh, repo, o)
    return {"mode": "read-write" if token else "read-only", "issues": outcomes}


def main(argv: list[str]) -> int:
    issue = int(argv[argv.index("--issue") + 1]) if "--issue" in argv else None
    scheduled = False
    if issue is None and not sys.stdin.isatty():
        try:  # Action input arrives as one JSON value on stdin
            data = json.loads(sys.stdin.read() or "null")
            issue = int(data["issue"]) if isinstance(data, dict) and data.get("issue") else None
        except (ValueError, TypeError):
            print("Input must be JSON like {\"issue\": 680}.", file=sys.stderr)
            return 2
        scheduled = issue is None
    try:
        outcome = run(issue)
    except Exception as error:  # report, never a traceback with request details
        print(f"Flow check failed ({type(error).__name__}).", file=sys.stderr)
        return 1
    print(json.dumps(outcome, indent=2))
    return 1 if issue and any(o.get("gaps") for o in outcome["issues"]) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
