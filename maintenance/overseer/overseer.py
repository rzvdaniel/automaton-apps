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
    "stall-check": "Stall check: requeues a task that stopped writing output, stops one that stalled twice, pauses the queue at the day's budget",
    "report": "Morning report: starts a task that writes the report of merged PRs, blocked tasks and the latest release",
    "lessons": "Lessons: queues the task that works through the lessons inbox",
    "night-shift": "Night shift: queues the issues in the board column, in order, and nothing when the column is empty",
}
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
                 stall_minutes: int = 120, task_budget: int = 12):
        self.executor = executor
        bin_dir = shlex.quote(bin_dir) if bin_dir else '"$HOME/bin"'
        self.env = f'export PATH={bin_dir}:"$HOME/.local/bin":"$PATH" AGENT_QUEUE_RUNNER={shlex.quote(runner)}'
        if queue_home:
            self.env += f" AGENT_QUEUE_HOME={shlex.quote(queue_home)}"
        self.stall_minutes, self.task_budget = stall_minutes, task_budget
        self.home = '"${AGENT_QUEUE_HOME:-$HOME/agent-queue}"'

    def run(self, command: str, timeout: int = 60, stdin: str | None = None) -> tuple[int | None, str]:
        return self.executor.run(f"{self.env}; {command}", timeout, stdin)

    def status(self) -> dict:
        code, out = self.run("agent-queue status")
        if code != 0:
            raise RuntimeError("could not read the queue: " + (out.strip().splitlines() or ["no answer"])[-1][:200])
        return parse_status(out)

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

    def orchestrate(self, report: bool) -> tuple[bool, str]:
        extra = "ORCH_REPORT=1 " if report else ""
        code, out = self.run(f"{extra}ORCH_STALL_MINUTES={self.stall_minutes} ORCH_NIGHT_BUDGET={self.task_budget} orchestrator.sh", 120)
        return code == 0, (out.strip().splitlines() or ["done"])[-1][:200]


def fetch_column(token: str, board: str, column: str, opener=urlopen) -> list[dict]:
    """The issues in one Status column of a GitHub project, in the order GitHub lists the items. board is "owner/number"."""
    owner, _, number = board.partition("/")
    if not owner or not number.isdigit():
        raise InvalidConfig("NIGHT_BOARD is owner/number, for example rzvdaniel/1")
    query = ("query($o:String!,$n:Int!){repositoryOwner(login:$o){... on ProjectV2Owner{projectV2(number:$n){items(first:100){nodes{"
             "status:fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name}}"
             "content{... on Issue{number title url state repository{nameWithOwner}}}}}}}}}")
    body = json.dumps({"query": query, "variables": {"o": owner, "n": int(number)}}).encode()
    request = Request("https://api.github.com/graphql", body, {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                                              "User-Agent": "Automaton-Overseer/1.0"})
    try:
        with opener(request, timeout=20) as response:
            data = json.loads(response.read())
    except (HTTPError, URLError, ValueError, OSError) as error:
        raise RuntimeError("could not read the board: " + type(error).__name__)
    project = (((data.get("data") or {}).get("repositoryOwner") or {}).get("projectV2") or {})
    if not project:
        raise RuntimeError("the board was not found or the token cannot read it")
    found = []
    for node in project["items"]["nodes"]:
        content = node.get("content") or {}
        if (node.get("status") or {}).get("name") == column and content.get("url") and content.get("state") == "OPEN":
            found.append({"repo": content["repository"]["nameWithOwner"], "number": content["number"], "title": content["title"], "url": content["url"]})
    return found


def night_name(item: dict) -> str:
    return "night-" + item["repo"].split("/")[-1].replace(".", "-") + "-" + str(item["number"])


def night_prompt(item: dict) -> str:
    return (f"Implement {item['url']} ({item['title']}). Follow the repository's AGENTS.md. Stop at the merged pull request: "
            "do not release, upgrade or deploy. Write the handoff on the issue.")


class Jobs:
    """What each scheduled job did last, and which issues the night shift already queued. Kept in one JSON file."""

    def __init__(self, path: str, now=time.time):
        self.path, self.now, self.lock = path, now, threading.Lock()
        try:
            with open(path) as handle:
                self.data = json.load(handle)
        except (OSError, ValueError):
            self.data = {}
        self.data.setdefault("jobs", {})
        self.data.setdefault("queued", [])

    def save(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w") as handle:
            json.dump(self.data, handle)
        os.replace(tmp, self.path)

    def record(self, job: str, ok: bool, text: str, trigger: str) -> None:
        with self.lock:
            self.data["jobs"][job] = {"at": self.now(), "ok": ok, "text": text, "trigger": trigger}
            self.save()

    def mark_queued(self, url: str) -> None:
        with self.lock:
            self.data["queued"] = (self.data["queued"] + [url])[-500:]
            self.save()

    def was_queued(self, url: str) -> bool:
        return url in self.data["queued"]
