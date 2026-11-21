"""Overseer's logic: wraps the agent-queue and orchestrator.sh scripts on the machine where the agents run.

Nothing here reimplements the queue. Every action is one of those two scripts run over SSH (see main.py's executor) with
a task name that matched NAME_RE and the prompt on standard input.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
MAX_PROMPT = 8000
JOBS = {
    "stall-check": "Stall check: requeues a task that stopped writing output, stops one that stalled twice",
    "report": "Morning report: starts a task that writes the report of merged PRs, blocked tasks and the latest release",
    "lessons": "Lessons: queues the task that works through the lessons inbox",
    "pick-up": "Pick-up: queues the issues in the Ready for agents column of each board in AGENT_BOARDS, in order, skipping needs-shape; nothing outside its hours or when AGENT_BOARDS is empty",
}
CLAUDE_JOBS = {"report", "lessons", "pick-up"}  # the schedules that queue Claude tasks (stall-check only runs a script)
USAGE_FIELDS = "task,runner,finished,model,cost_usd,duration_ms,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens"
COLUMN = "Ready for agents"
RELEASE_STALE = 25 * 60
VERSION_RE = re.compile(r"^\d{1,4}\.\d{1,4}\.\d{1,4}$")
DEFAULT_LESSONS = "Follow .agents/skills/automaton-lessons-learned/SKILL.md end to end on the lessons inbox (the open issue labelled lessons). Reply on the inbox."


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


def parse_usage(text: str) -> list[dict]:
    """The usage files claude-task writes (one JSON object per line); lines that are not usage records are ignored."""
    out = []
    for line in text.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict) and isinstance(item.get("task"), str):
            out.append(item)
    return out


def usage_summary(records: list[dict]) -> dict:
    """Per task, and per day and runner: tokens (input = fresh + cache read + cache write) and cost."""
    def number(item, key):
        value = item.get(key)
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0

    def add(into, item):
        into["tasks"] = into.get("tasks", 0) + 1
        into["input"] = into.get("input", 0) + number(item, "input_tokens") + number(item, "cache_read_tokens") + number(item, "cache_write_tokens")
        into["cached"] = into.get("cached", 0) + number(item, "cache_read_tokens")
        into["output"] = into.get("output", 0) + number(item, "output_tokens")
        into["cost"] = round(into.get("cost", 0) + number(item, "cost_usd"), 4)

    tasks, days = {}, {}
    for item in records:
        entry: dict = {"finished": str(item.get("finished", ""))}
        add(entry, item)
        entry["model"] = [str(m) for m in item.get("model", [])][:5] if isinstance(item.get("model"), list) else []
        tasks[item["task"]] = entry
        key = (entry["finished"][:10], str(item.get("runner", ""))[:60])
        add(days.setdefault(key, {"day": key[0], "runner": key[1]}), item)
    return {"tasks": tasks, "days": sorted(days.values(), key=lambda d: (d["day"], d["runner"]), reverse=True)[:14]}


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

    def usage(self) -> dict:
        """Tokens and cost of finished tasks, from the files claude-task writes; empty when there are none or jq is missing."""
        code, out = self.run(f'cd {self.home}/usage 2>/dev/null && ls -t -- *.json 2>/dev/null | head -n 1000 | xargs -r jq -c \'{{{USAGE_FIELDS}}}\'', timeout=30)
        return usage_summary(parse_usage(out if code == 0 else ""))

    def report(self) -> str:
        code, out = self.run(f'cat {self.home}/orchestrator/morning-report.md')
        return out if code == 0 else ""

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


def fetch_column(token: str, board: str, column: str, opener=urlopen) -> dict:
    """One Status column of a GitHub project, cards top to bottom. board is "owner/number".
    Returns {"items": [...], "problem": text or None}; items carry their labels and the last comment's first line."""
    owner, _, number = board.partition("/")
    query = ("query($o:String!,$n:Int!){repositoryOwner(login:$o){... on ProjectV2Owner{projectV2(number:$n){"
             "field(name:\"Status\"){... on ProjectV2SingleSelectField{options{name}}}"
             "items(first:100,orderBy:{field:POSITION,direction:ASC}){nodes{"
             "status:fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name}}"
             "content{... on Issue{number title url state repository{nameWithOwner} labels(first:30){nodes{name}} comments(last:1){nodes{body}}}}}}}}}}")
    body = json.dumps({"query": query, "variables": {"o": owner, "n": int(number)}}).encode()
    request = Request("https://api.github.com/graphql", body, {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                                              "User-Agent": "Automaton-Overseer/1.0"})
    try:
        with opener(request, timeout=20) as response:
            data = json.loads(response.read())
    except (HTTPError, URLError, ValueError, OSError) as error:
        return {"items": [], "problem": f"Board {board}: could not read it ({type(error).__name__})"}
    project = (((data.get("data") or {}).get("repositoryOwner") or {}).get("projectV2") or {})
    if not project:
        return {"items": [], "problem": f"Board {board}: not found or the token cannot read it"}
    options = [o.get("name") for o in ((project.get("field") or {}).get("options") or [])]
    if column not in options:
        return {"items": [], "problem": f"Board {board} has no column '{column}'"}
    found = []
    for node in project["items"]["nodes"]:
        content = node.get("content") or {}
        if (node.get("status") or {}).get("name") == column and content.get("url") and content.get("state") == "OPEN":
            comments = (content.get("comments") or {}).get("nodes") or []
            reason = next((l.strip() for l in (comments[-1].get("body") or "").splitlines() if l.strip()), "") if comments else ""
            found.append({"repo": content["repository"]["nameWithOwner"], "number": content["number"], "title": content["title"], "url": content["url"],
                          "labels": [l["name"] for l in (content.get("labels") or {}).get("nodes") or []], "reason": reason[:160]})
    return {"items": found, "problem": None}


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

    def was_queued(self, url: str) -> bool:
        return url in self.data["queued"]

    def set_pickup(self, skipped: list[dict], problems: list[str]) -> None:
        with self.lock:
            self.data["pickup"] = {"skipped": skipped, "problems": problems, "at": self.now()}
            self.save()
