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

QUEUE_LABEL = "queue-when-unblocked"


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
    agent_cli: str = ""
    agent_model: str = ""
    review_cli: str = ""
    review_model: str = ""

    def dispatch_inputs(self) -> dict:
        """Only the choices that are set; agent-issue.yml falls back to its repo variables for the rest."""
        pairs = {"agent_cli": self.agent_cli, "agent_model": self.agent_model,
                 "review_cli": self.review_cli, "review_model": self.review_model}
        return {k: v for k, v in pairs.items() if v}

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
        choice = {}
        for key in ("AGENT_CLI", "AGENT_REVIEW_CLI"):
            value = (env.get(key) or "").strip().lower()
            if value not in ("", "claude", "agy"):
                raise BoardError(f"{key} must be claude or agy.")
            choice[key] = value
        for key in ("AGENT_MODEL", "AGENT_REVIEW_MODEL"):
            value = (env.get(key) or "").strip()
            if value and not MODEL_NAME.match(value):
                raise BoardError(f"{key} has characters that are not allowed.")
            choice[key] = value
        return cls(token, match.group(1), int(match.group(2)), repos, int(raw), runner_repo,
                   choice["AGENT_CLI"], choice["AGENT_MODEL"], choice["AGENT_REVIEW_CLI"], choice["AGENT_REVIEW_MODEL"])

    def full(self, repo: str) -> str:
        return repo if "/" in repo else f"{self.owner}/{repo}"


MODEL_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class GitHub:
    """api.github.com over urllib: REST and GraphQL."""

    def __init__(self, token: str, timeout: float = 30):
        self.token, self.timeout = token, timeout
        self.last_headers = None

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
                self.last_headers = response.headers
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
    closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes { number url state createdAt } }
    timelineItems(last: 20, itemTypes: [CROSS_REFERENCED_EVENT]) { nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number url state createdAt } } } } }
    labelEvents: timelineItems(last: 50, itemTypes: [LABELED_EVENT]) { nodes { ... on LabeledEvent { createdAt label { name } } } }
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
        started = [e.get("createdAt") for e in (issue.get("labelEvents") or {}).get("nodes") or []
                   if e and (e.get("label") or {}).get("name") == "agent:go" and e.get("createdAt")]
        repo = issue["repository"]["nameWithOwner"]
        cards.append({
            "item": node["id"], "repo": repo, "short": repo.split("/")[-1], "number": issue["number"], "title": issue.get("title") or "",
            "url": issue.get("url") or "", "status": (node.get("status") or {}).get("name") or "", "open": issue.get("state") == "OPEN",
            "body": issue.get("body") or "", "labels": [x["name"] for x in (issue.get("labels") or {}).get("nodes") or []],
            "comments": (issue.get("comments") or {}).get("nodes") or [],
            "prs": sorted(prs.values(), key=lambda p: p["number"]),
            "started": _ts(max(started)) if started else None,  # when agent:go was last put on the issue: the start of the current run
        })
    status_field = project.get("field") or {}
    return {"id": project["id"], "field": status_field.get("id"), "options": {o["name"]: o["id"] for o in status_field.get("options") or []}, "cards": cards}


def run_prs(card: dict) -> list:
    """The pull requests opened by the card's current run: created at or after agent:go was last added. Older ones (earlier runs, other
    work that mentions the issue) are ignored. When the start or a PR's creation time is unknown, the PR counts."""
    started = card.get("started")
    return [p for p in card["prs"] if not started or not _ts(p.get("createdAt")) or _ts(p["createdAt"]) >= started]


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


def move_to_bottom(gh: GitHub, board: dict, card: dict) -> None:
    """Puts a card after the last other card of its column (best effort: the order is never needed for correctness)."""
    last = [c for c in board["cards"] if c["status"] == card["status"] and c is not card]
    if not last:
        return
    mutation = ("mutation($p: ID!, $i: ID!, $a: ID!) { updateProjectV2ItemPosition(input: {projectId: $p, itemId: $i, afterId: $a}) "
                "{ items(first: 1) { totalCount } } }")
    try:
        gh.graphql(mutation, {"p": board["id"], "i": card["item"], "a": last[-1]["item"]})
    except BoardError:
        pass


def _ref(blocker: dict, repo: str) -> str:
    name = (blocker.get("repository") or {}).get("full_name")
    return f"#{blocker['number']}" if not name or name == repo else f"{name}#{blocker['number']}"


MERGED_QUERY = ("query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { issue(number: $n) { "
                "closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { number state } } } } }")


def blocker_done(gh: GitHub, board: dict, blocker: dict, repo: str):
    """None while the blocker is still open work, else the pull request number that merged for it (0 when none is needed): closed as
    completed, a merged pull request closes it, or its card is in Verify or Done."""
    if blocker.get("state") == "closed":
        return None if blocker.get("state_reason") == "not_planned" else 0
    name = (blocker.get("repository") or {}).get("full_name") or repo
    on_board = next((c for c in board["cards"] if c["repo"] == name and c["number"] == blocker["number"]), None)
    prs = list(on_board["prs"]) if on_board else []
    if on_board and on_board["status"] in (REVIEW, "Done"):
        return max((p["number"] for p in prs if p.get("state") == "MERGED"), default=0)
    if not on_board:
        try:
            owner, _, short = name.partition("/")
            data = gh.graphql(MERGED_QUERY, {"o": owner, "r": short, "n": blocker["number"]})
            prs = (((data.get("repository") or {}).get("issue") or {}).get("closedByPullRequestsReferences") or {}).get("nodes") or []
        except (BoardError, AttributeError):
            prs = []
    merged = [p["number"] for p in prs if p.get("state") == "MERGED"]
    return max(merged) if merged else None


def queue_unblocked(gh: GitHub, board: dict, config: Config) -> list:
    """Inbox cards labelled queue-when-unblocked move to Ready for agents (bottom) once every blocker (GitHub issue dependency) is
    closed as completed, or done another way (a merged pull request closes it, or its card is in Verify or Done). A blocker closed as not planned gets one comment and the card stays in Inbox. Returns what moved."""
    moved = []
    for card in list(board["cards"]):
        if card["status"] != INBOX or QUEUE_LABEL not in card["labels"] or card["short"] not in config.repos or not card["open"]:
            continue
        base = f"/repos/{card['repo']}/issues/{card['number']}"
        try:
            blockers = gh.get(base + "/dependencies/blocked_by?per_page=100") or []
        except BoardError:
            continue
        if not blockers:
            continue
        refs = lambda items: ", ".join(_ref(b, card["repo"]) for b in items)
        dropped = [b for b in blockers if b.get("state") == "closed" and b.get("state_reason") == "not_planned"]
        merged = {}
        if not dropped:
            for b in blockers:
                merged[b["number"]] = blocker_done(gh, board, b, card["repo"])
            if any(v is None for v in merged.values()):
                continue
        if dropped:
            text = f"Not queued: {refs(dropped)} was closed as not planned. Remove the blocker or move the card yourself."
            if not any((c.get("body") or "") == text for c in card["comments"][-1:]):
                try:
                    gh.request("POST", base + "/comments", {"body": text})
                except BoardError:
                    pass
            continue
        describe = lambda items, m: ", ".join(
            _ref(b, card["repo"]) + (f" (merged in PR #{m[b['number']]})" if m.get(b["number"]) and b.get("state") != "closed" else "") for b in items)
        try:
            move(gh, board, card, READY)
        except BoardError:
            continue
        move_to_bottom(gh, board, card)
        board["cards"].remove(card)
        board["cards"].append(card)  # the pass picks in board order, so a queued card waits behind the ones already Ready
        try:
            gh.request("POST", base + "/comments", {"body": f"Unblocked by {describe(blockers, merged)}; queued."})
        except BoardError:
            pass
        try:
            gh.request("DELETE", base + f"/labels/{QUEUE_LABEL}")
        except BoardError:
            pass
        card["labels"].remove(QUEUE_LABEL)
        moved.append(f"{card['repo']}#{card['number']} to {READY}")
    return moved


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
        path = f"/repos/{config.full(HOME_REPO)}/actions/workflows/agent-issue.yml/dispatches"
        base = {"repo": card["repo"], "number": str(card["number"])}
        extra = config.dispatch_inputs()
        try:
            gh.request("POST", path, {"ref": "main", "inputs": {**base, **extra}})
        except BoardError as error:
            # GitHub answers 422 for inputs the workflow does not declare yet: start the run on the repository variables instead.
            if not extra or "HTTP 422" not in str(error):
                raise
            gh.request("POST", path, {"ref": "main", "inputs": base})
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
        if card["status"] == RUNNING and card["short"] in config.repos and card["open"] and run_prs(card):
            try:
                move(gh, board, card, REVIEW)
                result["moved"].append(f"{card['repo']}#{card['number']} to {REVIEW}")
            except BoardError as error:
                result["message"] = str(error)
    result["moved"] += queue_unblocked(gh, board, config)
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


def token_scopes(gh: GitHub):
    """The scopes of a classic token (X-OAuth-Scopes of GET /user) as a list, or None when GitHub does not say (a fine-grained token)."""
    gh.last_headers = None
    gh.get("/user")
    value = gh.last_headers.get("X-OAuth-Scopes") if gh.last_headers is not None else None
    return None if value is None else [x.strip() for x in value.split(",") if x.strip()]


def scope_problem(scopes) -> str | None:
    if scopes is None:
        return None
    missing = [s for s in ("project", "repo", "workflow") if s not in scopes]
    if not missing:
        return None
    return "The AGENT_GH_TOKEN has no " + ", ".join(missing) + " scope, so Pick up cannot work. Create a token with the project, repo and workflow scopes and save it as the AGENT_GH_TOKEN secret."


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
