"""Agent board logic shared by the Pick up Action and the Agent Keeper page (the build copies this file next to the app).

Plain functions over a small GitHub client, so the tests can pass a fake. The token is only ever sent to api.github.com in an
Authorization header and is never printed.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

API = "https://api.github.com"
USER_AGENT = "Automaton-Agent-Keeper/1.0"
READY, RUNNING, REVIEW, INBOX = "Ready for agents", "Running", "Verify", "Inbox"
DEFAULT_REPOS = "automaton automaton-apps automaton-monster"
DEFAULT_BOARD = "rzvdaniel/17"
HOME_REPO = "automaton"  # agent-issue.yml and the runner live here; agent:go starts a run only here
DONE_WHEN = re.compile(r"(^|\n)\W*Done when", re.I)
OWNER_NAME = re.compile(r"^[A-Za-z0-9_.\-]+$")
BOARD = re.compile(r"^([A-Za-z0-9_.\-]+)/([0-9]{1,6})$")
NOT_SHAPED_COMMENT = "Moved back to Inbox: the issue has the needs-shape label or no Done when section. Add a Done when, then move the card to Ready for agents."


class BoardError(RuntimeError):
    """A failure that is safe to show: it never contains the token."""


@dataclass
class Config:
    token: str
    owner: str = "rzvdaniel"
    number: int = 17
    repos: list = field(default_factory=lambda: DEFAULT_REPOS.split())
    parallel: int = 1
    runner_repo: str = ""

    @classmethod
    def from_env(cls, env) -> "Config":
        token = (env.get("AGENT_GH_TOKEN") or "").strip()
        if not token:
            raise BoardError("The secret AGENT_GH_TOKEN is not set.")
        match = BOARD.match((env.get("AGENT_BOARD") or "").strip() or DEFAULT_BOARD)
        if not match:
            raise BoardError("AGENT_BOARD must look like owner/number, for example rzvdaniel/17.")
        repos = (env.get("AGENT_REPOS") or "").replace(",", " ").split() or DEFAULT_REPOS.split()
        if not all(OWNER_NAME.match(r) for r in repos):
            raise BoardError("AGENT_REPOS has characters that are not allowed.")
        raw = (env.get("AGENT_PARALLEL") or "1").strip()
        if raw not in ("1", "2"):
            raise BoardError("AGENT_PARALLEL must be 1 or 2.")
        runner_repo = (env.get("AGENT_REPO") or "").strip().removeprefix("https://github.com/").strip("/")
        return cls(token, match.group(1), int(match.group(2)), repos, int(raw), runner_repo)

    def full(self, repo: str) -> str:
        return repo if "/" in repo else f"{self.owner}/{repo}"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class GitHub:
    """api.github.com over urllib: REST and GraphQL."""

    def __init__(self, token: str, timeout: float = 30):
        self.token, self.timeout = token, timeout

    def request(self, method: str, path: str, body=None):
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json", "User-Agent": USER_AGENT,
                   "X-GitHub-Api-Version": "2022-11-28"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        try:
            with build_opener(_NoRedirect()).open(Request(API + path, data=data, method=method, headers=headers), timeout=self.timeout) as response:
                raw = response.read(8_000_000).decode("utf-8")
                return json.loads(raw) if raw else None
        except HTTPError as error:
            raise BoardError(f"GitHub answered HTTP {error.code} for {method} {path.split('?')[0]}.") from None
        except (URLError, OSError, ValueError) as error:
            raise BoardError(f"GitHub could not be reached: {type(error).__name__}.") from None

    def get(self, path):
        return self.request("GET", path)

    def graphql(self, query: str, variables: dict):
        out = self.request("POST", "/graphql", {"query": query, "variables": variables})
        if not isinstance(out, dict) or out.get("errors") or not out.get("data"):
            raise BoardError("GitHub's GraphQL API refused the board query (does the token have the project scope?).")
        return out["data"]


PROJECT_FIELDS = """
id
field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
items(first: 100) { nodes {
  id
  status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
  content { ... on Issue {
    number title state body url repository { nameWithOwner }
    labels(first: 30) { nodes { name } }
    comments(last: 30) { nodes { author { login } body createdAt url } }
    closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes { number url state } }
    timelineItems(last: 20, itemTypes: [CROSS_REFERENCED_EVENT]) { nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number url state } } } } }
  } }
} }
"""
QUERY = "query($login: String!, $number: Int!) { repositoryOwner(login: $login) { ... on User { projectV2(number: $number) { %s } } ... on Organization { projectV2(number: $number) { %s } } } }" % (PROJECT_FIELDS, PROJECT_FIELDS)


def load_board(gh: GitHub, config: Config) -> dict:
    """The board as {"id", "field", "options", "cards"}; cards are issues in board order, with the status, labels and any pull request."""
    owner = (gh.graphql(QUERY, {"login": config.owner, "number": config.number}) or {}).get("repositoryOwner") or {}
    project = owner.get("projectV2")
    if not project:
        raise BoardError(f"Board {config.owner}/{config.number} was not found.")
    cards = []
    for node in (project.get("items") or {}).get("nodes") or []:
        issue = node.get("content") or {}
        if not issue.get("number"):
            continue
        prs = {}
        for pr in (issue.get("closedByPullRequestsReferences") or {}).get("nodes") or []:
            prs[pr["number"]] = pr
        for event in (issue.get("timelineItems") or {}).get("nodes") or []:
            pr = (event or {}).get("source") or {}
            if pr.get("number"):
                prs.setdefault(pr["number"], pr)
        repo = issue["repository"]["nameWithOwner"]
        cards.append({
            "item": node["id"], "repo": repo, "short": repo.split("/")[-1], "number": issue["number"], "title": issue.get("title") or "",
            "url": issue.get("url") or "", "status": (node.get("status") or {}).get("name") or "", "open": issue.get("state") == "OPEN",
            "body": issue.get("body") or "", "labels": [x["name"] for x in (issue.get("labels") or {}).get("nodes") or []],
            "comments": (issue.get("comments") or {}).get("nodes") or [],
            "prs": sorted(prs.values(), key=lambda p: p["number"]),
        })
    status_field = project.get("field") or {}
    return {"id": project["id"], "field": status_field.get("id"), "options": {o["name"]: o["id"] for o in status_field.get("options") or []}, "cards": cards}


def shaped(card: dict) -> bool:
    return "needs-shape" not in card["labels"] and bool(DONE_WHEN.search(card["body"]))


def failure_comment(card: dict) -> dict | None:
    """The last comment the agent workflow posted about a failed run."""
    found = [c for c in card["comments"] if (c.get("body") or "").startswith("Agent run ")]
    return found[-1] if found else None


def area(card: dict) -> str | None:
    """Which part of the product a card touches (a label area:<name>); other repositories are their own area. None when unknown."""
    for label in card["labels"]:
        if label.startswith(("area:", "area/")):
            return label[5:].lower()
    return None if card["short"] == HOME_REPO else card["short"]


def move(gh: GitHub, board: dict, card: dict, status: str) -> None:
    option = board["options"].get(status)
    if not option or not board["field"]:
        raise BoardError(f"The board has no status {status}.")
    mutation = ("mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, "
                "value: {singleSelectOptionId: $o}}) { projectV2Item { id } } }")
    gh.graphql(mutation, {"p": board["id"], "i": card["item"], "f": board["field"], "o": option})
    card["status"] = status


def running_issues(gh: GitHub, config: Config) -> list:
    """Open issues labelled agent:go in the picked repositories."""
    found = []
    for repo in config.repos:
        for issue in gh.get(f"/repos/{config.full(repo)}/issues?labels=agent:go&state=open&per_page=20") or []:
            if "pull_request" not in issue:
                found.append((config.full(repo), issue["number"]))
    return found


def start(gh: GitHub, config: Config, board: dict, card: dict) -> None:
    """Starts a run for a card: dispatch first (outside the home repository), then mark it taken, so a failed dispatch never leaves
    agent:go blocking the queue."""
    if card["short"] != HOME_REPO:
        gh.request("POST", f"/repos/{config.full(HOME_REPO)}/actions/workflows/agent-issue.yml/dispatches",
                   {"ref": "main", "inputs": {"repo": card["repo"], "number": str(card["number"])}})
    gh.request("POST", f"/repos/{card['repo']}/issues/{card['number']}/labels", {"labels": ["agent:go"]})
    try:
        move(gh, board, card, RUNNING)
    except BoardError:
        pass  # the label already started the run; the board is only a view


def retry(gh: GitHub, config: Config, repo: str, number: int) -> str:
    """Run again: removes agent:failed and starts the card when a slot is free; otherwise it waits in Ready for its turn."""
    board = load_board(gh, config)
    card = next((c for c in board["cards"] if c["repo"] == repo and c["number"] == number), None)
    if not card or card["short"] not in config.repos:
        raise BoardError("That card is not on the board.")
    if "agent:failed" not in card["labels"]:
        raise BoardError("That card has not failed.")
    gh.request("DELETE", f"/repos/{repo}/issues/{number}/labels/agent:failed")
    card["labels"].remove("agent:failed")
    if not shaped(card):
        raise BoardError("The card has no Done when, so it cannot start.")
    if len(running_issues(gh, config)) >= config.parallel:
        if card["status"] != READY:
            move(gh, board, card, READY)
        return "Another run is going; the card is back in Ready for agents and starts when it ends."
    start(gh, config, board, card)
    return "Started."


def pick_up(gh: GitHub, config: Config, runner_ok=None) -> dict:
    """One pass: card whose run opened a pull request -> Verify; shape check -> Inbox; then start the top Ready card if a slot is free."""
    result = {"picked": "", "message": "", "moved": []}
    runner_ok = runner_ok or runner_registered
    board = load_board(gh, config)
    for card in board["cards"]:
        if card["status"] == RUNNING and card["short"] in config.repos and card["open"] and card["prs"]:
            try:
                move(gh, board, card, REVIEW)
                result["moved"].append(f"{card['repo']}#{card['number']} to {REVIEW}")
            except BoardError as error:
                result["message"] = str(error)
    if not runner_ok(gh, config):
        result["message"] = "The runner is not set up yet; nothing picked."
        return result
    taken = running_issues(gh, config)
    if len(taken) >= config.parallel:
        result["message"] = "An agent:go issue is open; nothing to pick."
        return result
    running_areas = {a for a in (area(c) for c in board["cards"] if (c["repo"], c["number"]) in taken) if a}
    for card in board["cards"]:
        if card["status"] != READY or card["short"] not in config.repos or not card["open"]:
            continue
        if not shaped(card):
            # Move first and comment only once: a card that cannot be moved is skipped, not commented on every pass.
            try:
                move(gh, board, card, INBOX)
            except BoardError:
                continue
            if not any((c.get("body") or "") == NOT_SHAPED_COMMENT for c in card["comments"][-1:]):
                gh.request("POST", f"/repos/{card['repo']}/issues/{card['number']}/comments", {"body": NOT_SHAPED_COMMENT})
            result["moved"].append(f"{card['repo']}#{card['number']} to {INBOX}")
            continue
        if "agent:failed" in card["labels"]:
            continue
        if taken and (not area(card) or area(card) in running_areas):
            continue  # a second run starts only in another area than the one running
        start(gh, config, board, card)
        result["picked"] = f"{card['repo']}#{card['number']}"
        result["message"] = f"Picked {result['picked']}."
        return result
    result["message"] = result["message"] or "No Ready card."
    return result


def runner_registered(gh: GitHub, config: Config) -> bool:
    """False only when GitHub says the repository has no runner labelled agent. If it cannot tell (the token may not read runners), True."""
    repo = config.runner_repo or config.full(HOME_REPO)
    path = f"/repos/{repo}/actions/runners?per_page=100" if "/" in repo else f"/orgs/{repo}/actions/runners?per_page=100"
    try:
        runners = (gh.get(path) or {}).get("runners") or []
    except BoardError:
        return True
    return any(any(label.get("name") == "agent" for label in r.get("labels") or []) for r in runners)


def snapshot(gh: GitHub, config: Config, now: float | None = None) -> dict:
    """What the Queue tab shows: running, failed, next up and the last runs of agent-issue.yml."""
    import time
    from datetime import datetime, timezone
    now = now or time.time()
    board = load_board(gh, config)
    mine = [c for c in board["cards"] if c["short"] in config.repos and c["open"]]
    taken = set(running_issues(gh, config))

    def brief(card, **extra):
        return dict({"repo": card["repo"], "short": card["short"], "number": card["number"], "title": card["title"], "url": card["url"],
                     "pr": card["prs"][-1] if card["prs"] else None}, **extra)
    runs = []
    try:
        listing = gh.get(f"/repos/{config.full(HOME_REPO)}/actions/workflows/agent-issue.yml/runs?per_page=10") or {}
        for run in listing.get("workflow_runs") or []:
            started = _ts(run.get("run_started_at") or run.get("created_at"))
            ended = _ts(run.get("updated_at"))
            runs.append({"title": run.get("display_title") or run.get("name") or "", "result": run.get("conclusion") or run.get("status") or "",
                         "url": run.get("html_url") or "", "startedAt": started, "endedAt": ended if run.get("status") == "completed" else None})
    except BoardError:
        pass
    midnight = datetime.fromtimestamp(now, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    failed = []
    for card in mine:
        if "agent:failed" in card["labels"] and card["status"] in (READY, RUNNING):
            comment = failure_comment(card) or {}
            failed.append(brief(card, reason=(comment.get("body") or "")[:200], readUrl=comment.get("url") or card["url"],
                                at=_ts(comment.get("createdAt"))))
    return {
        "running": [brief(c, status=c["status"], started=_ts(next((r for r in runs if r["endedAt"] is None), {}).get("startedAt")))
                    for c in mine if (c["repo"], c["number"]) in taken],
        "failed": failed,
        "ready": [brief(c, shaped=shaped(c)) for c in mine if c["status"] == READY and "agent:failed" not in c["labels"]],
        "runs": runs,
        "doneToday": sum(1 for r in runs if r["result"] == "success" and (r["endedAt"] or 0) >= midnight),
        "parallel": config.parallel,
    }


def _ts(value):
    from datetime import datetime
    if isinstance(value, (int, float)):
        return value
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() if value else None
    except (ValueError, AttributeError):
        return None
