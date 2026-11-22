"""Overseer's logic: wraps the agent-queue and orchestrator.sh scripts on the machine where the agents run.

Nothing here reimplements the queue. Every action is one of those two scripts run over SSH (see main.py's executor) with
a task name that matched NAME_RE and the prompt on standard input.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import threading
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
MAX_PROMPT = 8000
JOBS = {
    "stall-check": "Stall check: requeues a task that stopped writing output, stops one that stalled twice",
    "report": "Morning report: starts a task that writes the report of merged PRs, blocked tasks and the latest release",
    "lessons": "Lessons: queues the task that works through the lessons inbox",
    "setup-machine": "Set up machine: installs or updates the agent-machine scripts, the worker service and the cron entries on the queue machine, and checks that claude, gh and git are signed in",
    "pick-up": "Pick-up: queues the issues in the Ready for agents column of each board in AGENT_BOARDS, in order, moving back (with one comment) the cards whose issue has needs-shape or no Done when; nothing outside its hours or when AGENT_BOARDS is empty",
}
COLUMN = "Ready for agents"
RELEASE_STALE = 25 * 60
VERSION_RE = re.compile(r"^\d{1,4}\.\d{1,4}\.\d{1,4}$")
DEFAULT_LESSONS = "Follow .agents/skills/automaton-lessons-learned/SKILL.md end to end on the lessons inbox (the open issue labelled lessons). Reply on the inbox."


MACHINE_FILES = ("agent-queue", "claude-task", "orchestrator.sh", "agent-cleanup", "agent-queue-worker.service", "install.sh")
MACHINE_HASHED = MACHINE_FILES[:5]  # what install.sh hashes into .agent-machine-version, in this order


def machine_version(folder: str) -> str:
    """The version of the app's copy of the agent-machine scripts; install.sh writes the same value on the machine."""
    digest = hashlib.sha256()
    for name in MACHINE_HASHED:
        with open(os.path.join(folder, name), "rb") as handle:
            digest.update(handle.read())
    return digest.hexdigest()[:16]


class InvalidConfig(Exception):
    pass


def redact(text: str, secrets: list[str]) -> str:
    for secret in secrets:
        if secret and len(secret) >= 4:
            text = text.replace(secret, "[hidden]")
    return text


def parse_status(text: str) -> dict:
    """The output of `agent-queue status` as data."""
    out: dict = {"worker": "unknown", "paused": False, "running": [], "pending": [], "finished": []}
    section = None
    for line in text.splitlines():
        if line.startswith("worker:"):
            out["worker"] = "running" if line.split(":", 1)[1].strip() == "running" else "stopped"
        elif line.startswith("paused:"):
            out["paused"] = line.split(":", 1)[1].strip() == "yes"
        elif line.rstrip().endswith(":") and not line.startswith(" "):
            section = line.strip().split(" ")[0].rstrip(":")
        elif line.startswith("  ") and section:
            item = line.strip()
            if section == "running":
                m = re.match(r"(\S+) \(log idle (\d+)s\)$", item)
                if m:
                    out["running"].append({"name": m.group(1), "idle": int(m.group(2))})
            elif section == "pending":
                out["pending"].append({"name": item})
            elif section == "finished":
                name, _, state = item.rpartition(": ")
                if name:
                    out["finished"].append({"name": name, "state": state})
    return out


def links(name: str, log: str, repo: str) -> dict:
    """Issue and pull request addresses a task mentions: from its log, else from a number at the end of its name."""
    pulls = list(dict.fromkeys(re.findall(r"https://github\.com/[\w.-]+/[\w.-]+/pull/\d+", log)))
    issues = list(dict.fromkeys(re.findall(r"https://github\.com/[\w.-]+/[\w.-]+/issues/\d+", log)))
    number = re.search(r"(\d+)$", name)
    if not issues and number and repo:
        issues = [f"https://github.com/{repo}/issues/{number.group(1)}"]
    return {"issues": issues[:3], "pulls": pulls[:5]}


class Queue:
    """The agent-queue on one machine, reached through `executor.run(command, timeout, stdin) -> (status, output)`."""

    def __init__(self, executor, bin_dir: str = "", queue_home: str = "", runner: str = "claude-task",
                 stall_minutes: int = 120):
        self.executor = executor
        bin_dir = shlex.quote(bin_dir) if bin_dir else '"$HOME/bin"'
        self.env = f'export PATH={bin_dir}:"$HOME/.local/bin":"$PATH" AGENT_QUEUE_RUNNER={shlex.quote(runner)}'
        if queue_home:
            self.env += f" AGENT_QUEUE_HOME={shlex.quote(queue_home)}"
        self.stall_minutes = stall_minutes
        self.bin = bin_dir
        self.home = '"${AGENT_QUEUE_HOME:-$HOME/agent-queue}"'

    def run(self, command: str, timeout: int = 60, stdin: str | None = None) -> tuple[int | None, str]:
        return self.executor.run(f"{self.env}; {command}", timeout, stdin)

    def status(self) -> dict:
        code, out = self.run("agent-queue status")
        if code != 0:
            raise RuntimeError("could not read the queue: " + (out.strip().splitlines() or ["no answer"])[-1][:200])
        return parse_status(out)

    def has(self, name: str) -> bool:
        """Whether a task of this name is waiting or running, from the queue listing."""
        status = self.status()
        return any(t["name"] == name for t in status["pending"] + status["running"])

    def add(self, name: str, prompt: str) -> str | None:
        """None on success, else why not."""
        if not NAME_RE.match(name):
            return "the name may use letters, digits, dots, dashes and underscores (80 at most)"
        if not prompt.strip() or len(prompt) > MAX_PROMPT:
            return f"write a prompt of up to {MAX_PROMPT} characters"
        code, out = self.run(f"agent-queue add {shlex.quote(name)}", stdin=prompt)
        return None if code == 0 else (out.strip().splitlines() or ["could not queue it"])[-1][:200]

    def cancel(self, name: str) -> str | None:
        if not NAME_RE.match(name):
            return "bad task name"
        code, out = self.run(f"agent-queue cancel {shlex.quote(name)}")
        return None if code == 0 else (out.strip().splitlines() or ["could not cancel it"])[-1][:200]

    def pause(self, paused: bool) -> str | None:
        code, out = self.run("agent-queue " + ("pause" if paused else "resume"))
        return None if code == 0 else (out.strip().splitlines() or ["could not change the queue"])[-1][:200]

    def log(self, name: str, lines: int = 300) -> str | None:
        if not NAME_RE.match(name):
            return None
        code, out = self.run(f'tail -n {int(lines)} {self.home}/logs/{shlex.quote(name)}.log')
        return out if code == 0 else ""

    def report(self) -> str:
        code, out = self.run(f'cat {self.home}/orchestrator/morning-report.md')
        return out if code == 0 else ""

    def machine_current(self, version: str) -> bool:
        """Whether the scripts on the machine are this version and no worker restart is waiting."""
        code, out = self.run(f'cat {self.bin}/.agent-machine-version 2>/dev/null; test -e {self.home}/RESTART_WORKER && echo restart')
        return code == 0 and out.split() == [version]

    def setup(self, folder: str) -> tuple[bool, str]:
        """Uploads the agent-machine files and runs install.sh --systemd there. It never signs in to anything."""
        staging = '"$HOME/.cache/overseer-agent-machine"'
        for name in MACHINE_FILES:
            with open(os.path.join(folder, name), encoding="utf-8") as handle:
                text = handle.read()
            code, out = self.run(f"mkdir -p {staging} && cat > {staging}/{name}.new && mv -f {staging}/{name}.new {staging}/{name}", stdin=text)
            if code != 0:
                return False, "could not copy " + name + ": " + (out.strip().splitlines() or ["no answer"])[-1][:150]
        code, out = self.run(f"bash {staging}/install.sh {self.bin} --systemd", 120)
        last = (out.strip().splitlines() or ["no answer"])[-1][:300]
        if code != 0:
            return False, "setup failed: " + last
        problems = [w for w in ("missing", "not logged in") if w in last]
        return not problems, last + ("" if not problems else " (log in or install what is missing on the machine; Overseer never logs in for you)")

    def orchestrate(self, report: bool) -> tuple[bool, str]:
        extra = "ORCH_REPORT=1 " if report else ""
        code, out = self.run(f"{extra}ORCH_STALL_MINUTES={self.stall_minutes} orchestrator.sh", 120)
        return code == 0, (out.strip().splitlines() or ["done"])[-1][:200]


def parse_boards(text: str) -> list[tuple[str, str]]:
    """AGENT_BOARDS: comma-separated "owner/number: Column", in run order."""
    boards = []
    for part in [p.strip() for p in text.split(",") if p.strip()]:
        board, _, column = part.partition(":")
        board, column = board.strip(), column.strip()
        owner, _, number = board.partition("/")
        if not owner or not number.isdigit() or not column:
            raise InvalidConfig(f'AGENT_BOARDS entries are "owner/number: Column", for example "rzvdaniel/17: {COLUMN}" (got "{part[:60]}")')
        boards.append((board, column))
    return boards


def in_pause(spec: str, now: float) -> bool:
    """PAUSE_BETWEEN "HH:MM-HH:MM" (UTC; may span midnight): true when now falls inside it. Empty: never."""
    spec = spec.strip()
    if not spec:
        return False
    match = re.fullmatch(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", spec)
    if not match or int(match[1]) > 23 or int(match[3]) > 23 or int(match[2]) > 59 or int(match[4]) > 59:
        raise InvalidConfig("PAUSE_BETWEEN is HH:MM-HH:MM in UTC, for example 08:00-18:00")
    start, end = int(match[1]) * 60 + int(match[2]), int(match[3]) * 60 + int(match[4])
    moment = time.gmtime(now)
    minute = moment.tm_hour * 60 + moment.tm_min
    if start == end:
        return False
    return start <= minute < end if start < end else minute >= start or minute < end


MAX_PAGES = 100  # 100 cards each


def fetch_column(token: str, board: str, column: str, opener=urlopen) -> dict:
    """One Status column of a GitHub project, cards top to bottom, read page by page until the board has no more. board is "owner/number".
    Returns {"items": [...], "problem": text or None}; items carry their labels and the last comment's first line."""
    owner, _, number = board.partition("/")
    query = ("query($o:String!,$n:Int!,$after:String){repositoryOwner(login:$o){... on ProjectV2Owner{projectV2(number:$n){"
             "id field(name:\"Status\"){... on ProjectV2SingleSelectField{id options{id name}}}"
             "items(first:100,after:$after,orderBy:{field:POSITION,direction:ASC}){pageInfo{hasNextPage endCursor}nodes{"
             "id status:fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name}}"
             "content{... on Issue{number title url state body repository{nameWithOwner} labels(first:30){nodes{name}} comments(last:1){nodes{body}}"
             "timelineItems(last:10,itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{... on ProjectV2ItemStatusChangedEvent{previousStatus status}}}}}}}}}}}")
    found, cursor = [], None
    for _ in range(MAX_PAGES):
        body = json.dumps({"query": query, "variables": {"o": owner, "n": int(number), "after": cursor}}).encode()
        request = Request("https://api.github.com/graphql", body, {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                                                  "User-Agent": "Automaton-Overseer/1.0"})
        try:
            with opener(request, timeout=20) as response:
                data = json.loads(response.read())
        except (HTTPError, URLError, ValueError, OSError) as error:
            return {"items": [], "problem": f"Board {board}: could not read it ({type(error).__name__})"}
        if data.get("errors"):
            first = data["errors"][0]
            message = first.get("message") if isinstance(first, dict) else first
            return {"items": [], "problem": f"Board {board}: GitHub rejected the query: {message}"}
        project = (((data.get("data") or {}).get("repositoryOwner") or {}).get("projectV2") or {})
        if not project:
            return {"items": [], "problem": f"Board {board}: not found or the token cannot read it"}
        field = project.get("field") or {}
        options = [o.get("name") for o in (field.get("options") or [])]
        board_info = {"id": project.get("id"), "field": field.get("id"), "options": {o.get("name"): o.get("id") for o in (field.get("options") or [])}}
        if column not in options:
            return {"items": [], "problem": f"Board {board} has no column '{column}'"}
        page = project["items"]
        for node in page["nodes"]:
            content = node.get("content") or {}
            if (node.get("status") or {}).get("name") == column and content.get("url") and content.get("state") == "OPEN":
                comments = (content.get("comments") or {}).get("nodes") or []
                reason = next((l.strip() for l in (comments[-1].get("body") or "").splitlines() if l.strip()), "") if comments else ""
                events = [e for e in ((content.get("timelineItems") or {}).get("nodes") or []) if e.get("status") == column and e.get("previousStatus")]
                found.append({"item": node.get("id"), "body": content.get("body") or "", "previous": events[-1]["previousStatus"] if events else "",
                              "repo": content["repository"]["nameWithOwner"], "number": content["number"], "title": content["title"], "url": content["url"],
                              "labels": [l["name"] for l in (content.get("labels") or {}).get("nodes") or []], "reason": reason[:160]})
        info = page.get("pageInfo") or {}
        cursor = info.get("endCursor")
        if not info.get("hasNextPage") or not cursor:
            return {"items": found, "problem": None, "board": board_info}
    return {"items": [], "problem": f"Board {board}: more than {MAX_PAGES * 100} cards, not read"}


DONE_WHEN_RE = re.compile(r"(^|\n)\W*Done when", re.I)  # the same check as agent-queue add
FALLBACK_COLUMN = "Backlog"


def shape_problem(item: dict) -> str:
    """Why an issue is not ready for an agent, or "" when it is: the needs-shape label, or no Done when section."""
    if "needs-shape" in item["labels"]:
        return "it has the needs-shape label"
    if not DONE_WHEN_RE.search(item.get("body") or ""):
        return "it has no Done when section"
    return ""


def shape_fingerprint(item: dict) -> str:
    return hashlib.sha256(json.dumps([sorted(item["labels"]), item.get("body") or ""]).encode()).hexdigest()[:16]


def shape_comment(problem: str) -> str:
    return f"Not queued: {problem}. Fix that (add a **Done when** section; the issue check removes `needs-shape` once it passes), then move the card back to Ready for agents."


def graphql(token: str, query: str, variables: dict, opener=urlopen) -> dict:
    request = Request("https://api.github.com/graphql", json.dumps({"query": query, "variables": variables}).encode(),
                      {"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Automaton-Overseer/1.0"})
    with opener(request, timeout=20) as response:
        data = json.loads(response.read())
    if data.get("errors"):
        raise RuntimeError("GitHub refused: " + str(data["errors"][0].get("message", ""))[:120])
    return data


def set_card(token: str, board: dict, item: dict, column: str, opener=urlopen) -> str | None:
    """Sets the card's Status to the column of that name. None on success, else why not."""
    options = board.get("options") or {}
    if column not in options or not board.get("id") or not board.get("field") or not item.get("item"):
        return f"no column '{column}' to move it to"
    try:
        graphql(token, "mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,"
                       "value:{singleSelectOptionId:$o}}){projectV2Item{id}}}",
                {"p": board["id"], "i": item["item"], "f": board["field"], "o": options[column]}, opener)
    except (HTTPError, URLError, ValueError, OSError, RuntimeError) as error:
        return f"could not move it ({type(error).__name__}; the token needs the project scope)"
    return None


def move_card(token: str, board: dict, item: dict, column: str, opener=urlopen) -> str | None:
    """Moves the card out of column: to the column it came from, else Backlog, else the first other one. None on success, else why not."""
    options = board.get("options") or {}
    target = next((c for c in (item.get("previous"), FALLBACK_COLUMN) if c in options and c != column), None) \
        or next((c for c in options if c != column), None)
    if not target:
        return "no column to move it to"
    return set_card(token, board, item, target, opener)


def merged_pull(token: str, item: dict, since: float, opener=urlopen) -> tuple[str, str | None]:
    """The address of a pull request that names the issue and was merged after `since` (epoch seconds), else "". Second value: what went wrong."""
    owner, _, name = item["repo"].partition("/")
    query = ("query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){timelineItems(last:50,itemTypes:[CROSS_REFERENCED_EVENT]){"
             "nodes{... on CrossReferencedEvent{source{... on PullRequest{url merged mergedAt}}}}}}}}")
    try:
        data = graphql(token, query, {"o": owner, "r": name, "n": item["number"]}, opener)
    except (HTTPError, URLError, ValueError, OSError, RuntimeError) as error:
        return "", f"{item['repo']}#{item['number']}: could not read its pull requests ({type(error).__name__})"
    nodes = ((((data.get("data") or {}).get("repository") or {}).get("issue") or {}).get("timelineItems") or {}).get("nodes") or []
    for node in nodes:
        source = (node or {}).get("source") or {}
        if source.get("merged") and source.get("url") and iso_time(source.get("mergedAt")) >= since:
            return source["url"], None
    return "", None


def iso_time(text: str | None) -> float:
    try:
        return datetime.fromisoformat((text or "").replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


FAILED_PREFIX = "Pick-up task `"


def failed_comment(name: str, column: str, log: str) -> str:
    lines = [l.rstrip() for l in log.splitlines() if l.strip()][-8:]
    tail = "\n".join(lines)[-1500:] or "(no log)"
    return f"{FAILED_PREFIX}{name}` ended without a merged pull request, so the card went back to {column}. Pick-up will not queue it again until the issue has a newer comment (say what was fixed). Last log lines:\n\n```\n{tail}\n```"


def comment_issue(token: str, item: dict, text: str, opener=urlopen) -> str | None:
    request = Request(f"https://api.github.com/repos/{item['repo']}/issues/{item['number']}/comments", json.dumps({"body": text}).encode(),
                      {"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Automaton-Overseer/1.0"})
    try:
        with opener(request, timeout=20):
            return None
    except (HTTPError, URLError, OSError) as error:
        return f"could not comment ({type(error).__name__}; the token needs repo access)"


def pick_name(item: dict) -> str:
    return "pick-" + item["repo"].split("/")[-1].replace(".", "-") + "-" + str(item["number"])


def pick_prompt(item: dict) -> str:
    return (f"Implement {item['url']} ({item['title']}). Follow the repository's AGENTS.md. Stop at the merged pull request: "
            "do not release, upgrade or deploy. Write the handoff on the issue.")


def release_prompt(version: str, repo: str) -> str:
    return (f"Run the release check for server-v{version} of {repo}. The test server was just upgraded to it. Follow "
            ".agents/skills/automaton-verify-release/SKILL.md: list the pull requests merged since the previous release, then check each "
            "one's \"Check after release\" list as real users, one pass per pull request. Do each pass in a subagent on Haiku at low effort, "
            "with no docs walk. Label each issue verified or verification-failed and attach the proof as the skill says. Then post one table "
            f"(pull request, issue, result, what was not checked) on the release: gh release edit server-v{version} -R {repo} appending it "
            "under a heading \"Release check\" to the notes. Never release, deploy or touch production.")


class Jobs:
    """What each scheduled job did last, and which issues Pick-up already queued, and what it skipped or could not read. Kept in one JSON file."""

    def __init__(self, path: str, now=time.time):
        self.path, self.now, self.lock = path, now, threading.Lock()
        try:
            with open(path) as handle:
                self.data = json.load(handle)
        except (OSError, ValueError):
            self.data = {}
        self.data.setdefault("jobs", {})
        self.data.setdefault("queued", [])
        self.data.setdefault("releases", {})
        self.data.setdefault("pickup", {"skipped": [], "problems": []})
        self.data.setdefault("notified", {})
        self.data.setdefault("picks", {})

    def save(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w") as handle:
            json.dump(self.data, handle)
        os.replace(tmp, self.path)

    def record(self, job: str, ok: bool, text: str, trigger: str) -> None:
        with self.lock:
            self.data["jobs"][job] = {"at": self.now(), "ok": ok, "text": text, "trigger": trigger}
            self.save()

    def claim_release(self, version: str) -> bool:
        """True once per version: a second call, even while the first runs, gets False. A failed one may be tried again."""
        with self.lock:
            old = self.data["releases"].get(version, {})
            stale = old.get("state") == "running" and self.now() - old.get("at", 0) > RELEASE_STALE  # the app stopped during the upgrade
            if old.get("state", "failed") != "failed" and not stale:
                return False
            self.data["releases"][version] = {"state": "running", "at": self.now()}
            self.data["releases"] = dict(list(self.data["releases"].items())[-50:])
            self.save()
            return True

    def finish_release(self, version: str, ok: bool, text: str) -> None:
        with self.lock:
            self.data["releases"][version] = {"state": "queued" if ok else "failed", "at": self.now(), "text": text}
            self.save()

    def mark_queued(self, url: str) -> None:
        with self.lock:
            self.data["queued"] = (self.data["queued"] + [url])[-500:]
            self.save()

    def add_pick(self, name: str, pick: dict) -> None:
        """A task Pick-up queued and moved its card for: kept until the task ends and the card has moved on."""
        with self.lock:
            self.data["picks"][name] = pick
            self.data["picks"] = dict(list(self.data["picks"].items())[-100:])
            self.save()

    def drop_pick(self, name: str) -> None:
        with self.lock:
            self.data["picks"].pop(name, None)
            self.save()

    def unmark_queued(self, url: str) -> None:
        with self.lock:
            self.data["queued"] = [u for u in self.data["queued"] if u != url]
            self.save()

    def add_problems(self, problems: list[str]) -> None:
        with self.lock:
            self.data["pickup"]["problems"] = self.data["pickup"].get("problems", []) + problems
            self.save()

    def was_queued(self, url: str) -> bool:
        return url in self.data["queued"]

    def was_notified(self, url: str, fingerprint: str) -> bool:
        """Whether the issue was already commented on in this state (labels and text unchanged since)."""
        return self.data["notified"].get(url) == fingerprint

    def mark_notified(self, url: str, fingerprint: str) -> None:
        with self.lock:
            self.data["notified"][url] = fingerprint
            self.data["notified"] = dict(list(self.data["notified"].items())[-500:])
            self.save()

    def set_pickup(self, skipped: list[dict], problems: list[str]) -> None:
        with self.lock:
            self.data["pickup"] = {"skipped": skipped, "problems": problems, "at": self.now()}
            self.save()
