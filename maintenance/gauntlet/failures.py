"""What happens when a run fails: an email, a diagnosis by Claude Code, and one GitHub issue per failure.

A repeat failure comments on the open issue; a later pass comments "passing again" and never closes it.
"""

from __future__ import annotations

import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import gauntlet

USER_AGENT = "automaton-gauntlet"
MAX_BODY = 60000
LABEL = "gauntlet"


def log(text: str) -> None:
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), text, flush=True)


def send_email(api_url: str, api_key: str, recipients: list[str], subject: str, text: str, timeout: float = 15) -> bool | None:
    """Emails through the server with the notify:email permission. None: email is not available; False: try again later."""
    if not api_url or not api_key:
        return None
    request = Request(api_url.rstrip("/") + "/api/notify/email", method="POST",
                      data=json.dumps({"to": recipients, "subject": subject, "text": text}).encode(),
                      headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout):
            return True
    except HTTPError as error:
        log(f"email not sent: HTTP {error.code}")
        return None if error.code in (400, 403, 404, 409, 429) else False
    except (URLError, OSError, ValueError) as error:
        log(f"email failed: {type(getattr(error, 'reason', error)).__name__}")
        return False


class GitHub:
    """The few GitHub calls Gauntlet needs. The token is only ever sent to api.github.com and never logged."""

    def __init__(self, token: str, opener=urlopen):
        self.token, self.opener, self.labelled = token, opener, set()

    def call(self, method: str, path: str, body: dict | None = None):
        request = Request("https://api.github.com" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                          headers={"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json",
                                   "User-Agent": USER_AGENT, "Content-Type": "application/json"})
        with self.opener(request, timeout=20) as response:
            raw = response.read(1 << 20)
        return json.loads(raw) if raw else None

    def ensure_label(self, repo: str, name: str = LABEL) -> None:
        """Creates the label once per repository; GitHub only creates one on issue create for users with push. 422: it exists."""
        if repo in self.labelled:
            return
        try:
            self.call("POST", f"/repos/{repo}/labels", {"name": name, "color": "5319e7", "description": "Opened by Gauntlet"})
        except HTTPError as error:
            if error.code != 422:
                log(f"label {name} was not created in {repo}: HTTP {error.code}")
        except (URLError, OSError, ValueError) as error:
            log(f"label {name} was not created in {repo}: {type(error).__name__}")
        self.labelled.add(repo)

    def create_issue(self, repo: str, title: str, body: str) -> dict:
        self.ensure_label(repo)
        return self.call("POST", f"/repos/{repo}/issues", {"title": title[:200], "body": body[:MAX_BODY], "labels": [LABEL]})

    def comment(self, repo: str, number: int, body: str) -> None:
        self.call("POST", f"/repos/{repo}/issues/{number}/comments", {"body": body[:MAX_BODY]})

    def is_open(self, repo: str, number: int) -> bool | None:
        try:
            return self.call("GET", f"/repos/{repo}/issues/{number}")["state"] == "open"
        except HTTPError as error:
            return False if error.code in (404, 410) else None

    def add_to_board(self, owner: str, number: int, issue_node: str) -> None:
        """Puts the issue on the user's or organisation's project board (best effort)."""
        for kind in ("user", "organization"):
            found = self.call("POST", "/graphql", {"query": f'query($o:String!,$n:Int!){{{kind}(login:$o){{projectV2(number:$n){{id}}}}}}',
                                                    "variables": {"o": owner, "n": number}})
            project = ((found or {}).get("data") or {}).get(kind) or {}
            if (project.get("projectV2") or {}).get("id"):
                self.call("POST", "/graphql", {"query": "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}",
                                                "variables": {"p": project["projectV2"]["id"], "c": issue_node}})
                return


def parse_repos(raw: str) -> list[str]:
    repos = [r for r in re.split(r"[,\s]+", raw or "") if r]
    for repo in repos:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            raise gauntlet.InvalidConfig(f"'{repo}' is not owner/repo")
    return repos


def parse_boards(raw: str) -> dict[str, dict]:
    """BOARDS: JSON {"owner/repo": {"owner": "...", "number": 1}}."""
    if not (raw or "").strip():
        return {}
    try:
        boards = json.loads(raw)
        if not isinstance(boards, dict) or not all(isinstance(v, dict) and isinstance(v.get("owner"), str) and isinstance(v.get("number"), int) for v in boards.values()):
            raise ValueError
    except ValueError as error:
        raise gauntlet.InvalidConfig('BOARDS must look like {"owner/repo": {"owner": "name", "number": 1}}') from error
    return boards


def failure_text(result: dict, run_id: int) -> str:
    lines = [f"Run #{run_id} of plan `{result['plan']}` on `{result['target']}` {result['status']}."]
    if result.get("error"):
        lines.append(result["error"])
    for step in result["steps"]:
        mark = "FAILED" if step["status"] == "failed" else "passed"
        lines.append(f"- {step['name']}: {mark} in {step['seconds']} s" + (f" ({step['problem']})" if step["problem"] else ""))
    return "\n".join(lines)


def logs_text(result: dict) -> str:
    parts = []
    for step in result["steps"]:
        if step["status"] == "failed":
            parts.append(f"### {step['name']}\n{step['problem']}\n```\n{step['output']}\n```")
    return "\n\n".join(parts)


def diagnose_prompt(result: dict, run_id: int, repos: list[str], default_repo: str) -> str:
    return (
        "You diagnose a failed Automaton install test (Gauntlet). Read-only: never change code, merge or touch production.\n"
        f"Allowed repositories: {', '.join(repos)}. Pick the one where the bug is (server, installer, CLI, docs: automaton; "
        "catalog apps: automaton-apps; the website and showcase apps: automaton-monster). Unsure: " + default_repo + ".\n"
        'Answer with one JSON object only: {"repo": "owner/name", "title": "what is broken, in one line", '
        '"body": "markdown following the automaton-write-issue skill: Problem, Suggestion, Done when, with the evidence"}.\n\n'
        + failure_text(result, run_id) + "\n\n" + logs_text(result))


def parse_diagnosis(text: str, repos: list[str]) -> dict | None:
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("title"), str) or not isinstance(data.get("body"), str):
        return None
    repo = data.get("repo") if data.get("repo") in repos else None
    return {"repo": repo, "title": data["title"].strip()[:200], "body": data["body"]}


def choose_repo(plan: dict, result: dict, repos: list[str], suggested: str | None) -> str | None:
    """The repository for the issue: Claude's pick if allowed, else the failing step's, else the plan's, else the first one."""
    for candidate in (suggested, next((s["repo"] for s in result["steps"] if s["status"] == "failed" and s.get("repo")), None), plan.get("repo")):
        # a plan may say just "automaton"; that matches the one allowed repository of that name
        match = next((r for r in repos if candidate and (r == candidate or r.split("/")[1] == candidate)), None)
        if match:
            return match
    return repos[0] if repos else None


class Reporter:
    def __init__(self, store, github: GitHub | None, repos: list[str], boards: dict, diagnose, email, base_url: str = ""):
        self.store, self.github, self.repos, self.boards = store, github, repos, boards
        self.diagnose, self.email, self.base_url = diagnose, email, base_url

    def failed(self, plan: dict, result: dict, run_id: int) -> None:
        sig = gauntlet.signature(result)
        if sig is None:
            return
        link = self.handle_issue(plan, result, run_id, sig)
        text = failure_text(result, run_id) + (f"\n\nIssue: {link}" if link else "")
        self.email(f"Gauntlet: {plan['name']} failed on {result['target']}", text)

    def handle_issue(self, plan: dict, result: dict, run_id: int, sig: str) -> str | None:
        if not self.github or not self.repos:
            return None
        try:
            known = self.store.issue_for(sig)
            if known and self.github.is_open(known["repo"], known["number"]) is not False:
                self.github.comment(known["repo"], known["number"], "Failed again.\n\n" + failure_text(result, run_id) + "\n\n" + logs_text(result))
                self.store.failed_again(sig, run_id)
                return known["url"]
            if known:
                self.store.forget_issue(sig)  # closed or deleted by a person: a new failure is a new issue
            diagnosis = self.diagnose(gauntlet_prompt(result, run_id, self.repos)) if self.diagnose else None
            repo = choose_repo(plan, result, self.repos, (diagnosis or {}).get("repo"))
            title = (diagnosis or {}).get("title") or f"Gauntlet: {plan['name']} fails on {result['target']} at '{next((s['name'] for s in result['steps'] if s['status'] == 'failed'), 'start')}'"
            body = (diagnosis or {}).get("body") or ("Found by Gauntlet.\n\n" + failure_text(result, run_id) + "\n\n" + logs_text(result))
            body += f"\n\n---\nGauntlet run #{run_id}, signature `{sig}`." + ("" if diagnosis else " No diagnosis: Claude Code was not available.")
            created = self.github.create_issue(repo, title, body)
            self.store.remember_issue(sig, repo, created["number"], created["html_url"], plan["name"], result["target"], run_id)
            board = self.boards.get(repo)
            if board and created.get("node_id"):
                try:
                    self.github.add_to_board(board["owner"], board["number"], created["node_id"])
                except (HTTPError, URLError, OSError, ValueError, KeyError) as error:
                    log(f"issue {created['html_url']} was not put on the board: {type(error).__name__}")
            return created["html_url"]
        except (HTTPError, URLError, OSError, ValueError, KeyError) as error:
            log(f"GitHub issue handling failed: {type(error).__name__}")
            return None

    def passed(self, plan: dict, result: dict, run_id: int) -> None:
        for known in self.store.awaiting_pass(plan["name"], result["target"]):
            try:
                if self.github:
                    self.github.comment(known["repo"], known["number"], f"Passing again (Gauntlet run #{run_id}). This issue stays open for a person to close.")
                self.store.passing_noted(known["signature"])
            except (HTTPError, URLError, OSError, ValueError) as error:
                log(f"passing-again comment failed: {type(error).__name__}")


def gauntlet_prompt(result: dict, run_id: int, repos: list[str]) -> str:
    return diagnose_prompt(result, run_id, repos, repos[0])
