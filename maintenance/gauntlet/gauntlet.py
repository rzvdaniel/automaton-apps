"""Gauntlet's logic: plans, targets, running steps, history, schedules and failure signatures.

Nothing here talks to the network except through an executor object (see main.py), so every rule is testable.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from pathlib import Path

MAX_OUTPUT = 16000          # characters kept per step
DEFAULT_TIMEOUT = 300
MAX_TIMEOUT = 7200
KEEP_DAYS = 90
NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
DOMAIN = re.compile(r"^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$")
HOST = re.compile(r"^([a-z_][a-z0-9_-]*@)?[A-Za-z0-9.-]{1,253}$")  # port 22 only


class InvalidConfig(ValueError):
    pass


def parse_targets(raw: str) -> dict[str, dict]:
    """TARGETS: a JSON list of {name, host, domain, email, install_flags, disposable}. Without 'disposable: true' a target is never wiped."""
    raw = (raw or "").strip()
    if not raw:
        return {}
    try:
        items = json.loads(raw)
    except ValueError as error:
        raise InvalidConfig("TARGETS is not valid JSON") from error
    if not isinstance(items, list):
        raise InvalidConfig("TARGETS must be a JSON list")
    targets: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            raise InvalidConfig("each target must be an object")
        name, host, domain = item.get("name"), item.get("host"), item.get("domain", "")
        if not isinstance(name, str) or not NAME.match(name):
            raise InvalidConfig("a target needs a name of lowercase letters, digits and dashes")
        if not isinstance(host, str) or not HOST.match(host):
            raise InvalidConfig(f"target {name}: host must look like user@address")
        if not isinstance(domain, str) or (domain and not DOMAIN.match(domain)):
            raise InvalidConfig(f"target {name}: domain is not a valid host name")
        if name in targets:
            raise InvalidConfig(f"target {name} is listed twice")
        email, flags = item.get("email") or (f"admin@{domain}" if domain else ""), item.get("install_flags") or ""
        if not isinstance(email, str) or not re.fullmatch(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+", email or "x@y") or not isinstance(flags, str) or not re.fullmatch(r"[A-Za-z0-9 =_./:-]*", flags):
            raise InvalidConfig(f"target {name}: email or install_flags has characters that are not allowed")
        targets[name] = {"name": name, "host": host, "domain": domain, "email": email, "flags": flags, "disposable": item.get("disposable") is True}
    return targets


def validate_plan(raw: object, source: str) -> dict:
    if not isinstance(raw, dict):
        raise InvalidConfig(f"{source}: a plan is a JSON object")
    name = raw.get("name")
    if not isinstance(name, str) or not NAME.match(name):
        raise InvalidConfig(f"{source}: name must be lowercase letters, digits and dashes")
    steps = raw.get("steps")
    if not isinstance(steps, list) or not steps:
        raise InvalidConfig(f"{name}: a plan needs steps")
    clean = []
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict) or not isinstance(step.get("name"), str) or not isinstance(step.get("command", "bash -s" if step.get("script") else None), str):
            raise InvalidConfig(f"{name}: step {index} needs a name and a command or a script")
        timeout = step.get("timeout", DEFAULT_TIMEOUT)
        if not isinstance(timeout, int) or isinstance(timeout, bool) or not 1 <= timeout <= MAX_TIMEOUT:
            raise InvalidConfig(f"{name}: step {step['name']}: timeout is 1 to {MAX_TIMEOUT} seconds")
        expect = step.get("exit", 0)
        if not isinstance(expect, int) or isinstance(expect, bool):
            raise InvalidConfig(f"{name}: step {step['name']}: exit must be a number")
        script = step.get("script")
        if script is not None and (not isinstance(script, str) or not re.fullmatch(r"[a-z0-9-]+\.sh", script)):
            raise InvalidConfig(f"{name}: step {step['name']}: script is a file name in plans/scripts")
        for key in ("contains", "not_contains"):
            if key in step and not isinstance(step[key], str):
                raise InvalidConfig(f"{name}: step {step['name']}: {key} must be text")
        if step.get("as", "root") not in ("root", "automaton"):
            raise InvalidConfig(f"{name}: step {step['name']}: as is root or automaton")
        env = step.get("env", [])
        if not isinstance(env, list) or not all(isinstance(n, str) and re.fullmatch(r"DRILL_[A-Z0-9_]+", n) for n in env):
            raise InvalidConfig(f"{name}: step {step['name']}: env is a list of DRILL_ setting names")
        if env and not step.get("script"):
            raise InvalidConfig(f"{name}: step {step['name']}: env needs a script (values must not be on a command line)")
        if env and raw.get("wipes") is not True:
            raise InvalidConfig(f"{name}: step {step['name']}: env is only for plans that wipe a disposable machine")
        clean.append({"name": step["name"][:120], "env": env, "command": step.get("command", "bash -s"), "timeout": timeout, "exit": expect,
                      "contains": step.get("contains"), "not_contains": step.get("not_contains"),
                      "script": script, "as": step.get("as", "root"), "continue": step.get("continue") is True,
                      "repo": step.get("repo") if isinstance(step.get("repo"), str) else None})
    return {"name": name, "title": str(raw.get("title") or name)[:120], "description": str(raw.get("description") or "")[:600],
            "target": raw.get("target") if isinstance(raw.get("target"), str) else None,
            "wipes": raw.get("wipes") is True, "repo": raw.get("repo") if isinstance(raw.get("repo"), str) else None,
            "steps": clean}


def load_plans(*folders: str | os.PathLike) -> dict[str, dict]:
    """Plans from the app's own folder, then from the data folder: a later file with the same name replaces an earlier one."""
    plans: dict[str, dict] = {}
    for folder in folders:
        path = Path(folder)
        if not path.is_dir():
            continue
        for file in sorted(path.glob("*.json")):
            try:
                plan = validate_plan(json.loads(file.read_text(encoding="utf-8")), file.name)
            except (ValueError, OSError) as error:
                raise InvalidConfig(f"{file.name}: {error}") from error
            plans[plan["name"]] = plan
    return plans


def refusal(plan: dict, target: dict | None) -> str | None:
    """Why this plan must not run on this target, or None. Wiping plans run only on disposable targets."""
    if target is None:
        return f"target '{plan['target']}' is not configured" if plan.get("target") else "the plan names no target"
    if plan["wipes"] and not target["disposable"]:
        return f"'{plan['name']}' wipes the machine and '{target['name']}' is not marked disposable"
    return None


def render(step: dict, target: dict, scripts: str | os.PathLike | None = None, extra: dict | None = None) -> tuple[str, str | None]:
    """The command to run on the target and what to send it on stdin. The target's facts reach the command as environment
    variables (DOMAIN, ADDRESS, EMAIL, INSTALL_FLAGS) that were validated when the targets were read, and {domain} in a
    command is filled the same way. A step that asks for the limited 'automaton' user runs as that user."""
    exports = "export " + " ".join(f"{k}={shell_quote(v)}" for k, v in (
        ("DOMAIN", target["domain"]), ("ADDRESS", target["host"].split("@")[-1]), ("EMAIL", target["email"]), ("INSTALL_FLAGS", target["flags"]))) + "; "
    # Settings and secrets a step names in "env" (DRILL_*) travel on stdin with the script, never on the command line or disk.
    exports += "".join(f"export {n}={shell_quote((extra or {}).get(n, ''))}; " for n in step.get("env", []))
    command, stdin = step["command"].replace("{domain}", target["domain"]), None
    if step.get("script"):
        stdin = exports + Path(scripts or ".", step["script"]).read_text(encoding="utf-8")
    else:
        command = exports + command
    if step["as"] == "automaton":
        command = "runuser -u automaton -- bash -lc " + shell_quote(command)
    return command, stdin


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\\''") + "'"


def redact(text: str, secrets: list[str]) -> str:
    for secret in secrets:
        if len(secret) >= 6:
            text = text.replace(secret, "[hidden]")
    text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)", "[hidden key]", text, flags=re.S)
    text = re.sub(r"AGE-SECRET-KEY-[A-Z0-9]+", "[hidden key]", text)
    text = re.sub(r"\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})", "[hidden]", text)
    text = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{12,}", r"\1[hidden]", text)
    text = re.sub(r"(?i)(token|password|secret|api[_-]?key)(=|:\s*)\S{6,}", r"\1\2[hidden]", text)
    return text


def clip(text: str) -> str:
    if len(text) <= MAX_OUTPUT:
        return text
    half = MAX_OUTPUT // 2
    return text[:half] + "\n[... cut ...]\n" + text[-half:]


def judge(step: dict, code: int | None, output: str) -> str | None:
    """None when the step passed, else one line saying why it did not."""
    if code is None:
        return f"timed out after {step['timeout']} s"
    if code != step["exit"]:
        return f"exit status {code}, expected {step['exit']}"
    if step.get("contains") and step["contains"] not in output:
        return f"output does not contain '{step['contains']}'"
    if step.get("not_contains") and step["not_contains"] in output:
        return f"output contains '{step['not_contains']}'"
    return None


def execute(plan: dict, target: dict | None, executor, secrets: list[str], now=time.time, on_step=None, scripts=None, extra: dict | None = None) -> dict:
    """Runs the plan's steps in order and returns the result. A failed step stops the plan unless it says continue."""
    started = now()
    result = {"plan": plan["name"], "target": plan.get("target"), "started": started, "steps": [], "status": "passed"}
    why = refusal(plan, target)
    if why:
        result.update(status="refused", error=why, finished=now())
        return result
    for step in plan["steps"]:
        began = now()
        command, stdin = render(step, target, scripts, extra)
        code, output = executor.run(target, command, step["timeout"], stdin=stdin)
        problem = judge(step, code, output)
        entry = {"name": step["name"], "status": "failed" if problem else "passed", "problem": problem, "repo": step["repo"],
                 "seconds": round(now() - began, 1), "output": clip(redact(output, secrets))}
        result["steps"].append(entry)
        if on_step:
            on_step(result)
        if problem:
            result["status"] = "failed"
            if not step["continue"]:
                break
    result["finished"] = now()
    return result


def signature(result: dict) -> str | None:
    """Identifies a failure so a repeat is recognised: the plan, the target and the first step that failed."""
    for step in result["steps"]:
        if step["status"] == "failed":
            return hashlib.sha256(f"{result['plan']}|{result['target']}|{step['name']}".encode()).hexdigest()[:16]
    if result["status"] == "refused":
        return hashlib.sha256(f"{result['plan']}|{result['target']}|refused".encode()).hexdigest()[:16]
    return None


class Store:
    """History in the app's own SQLite file."""

    def __init__(self, path: str, now=time.time):
        self.now = now
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.executescript("""
            create table if not exists runs(id integer primary key, plan text, target text, trigger text, started real,
                finished real, status text, error text);
            create table if not exists steps(run integer, idx integer, name text, status text, problem text, seconds real, output text,
                primary key(run, idx));
            create table if not exists issues(signature text primary key, repo text, number integer, url text, plan text, target text,
                passing_noted integer default 0, last_run integer);
            create table if not exists meta(key text primary key, value text);
        """)

    def begin(self, plan: str, target: str | None, trigger: str) -> int:
        cursor = self.db.execute("insert into runs(plan, target, trigger, started, status) values(?,?,?,?, 'running')",
                                 (plan, target, trigger, self.now()))
        return cursor.lastrowid

    def save(self, run_id: int, result: dict) -> None:
        self.db.execute("begin")
        try:
            self.db.execute("update runs set finished=?, status=?, error=? where id=?",
                            (result.get("finished"), result["status"] if result.get("finished") else "running", result.get("error"), run_id))
            for index, step in enumerate(result["steps"]):
                self.db.execute("insert or replace into steps values(?,?,?,?,?,?,?)",
                                (run_id, index, step["name"], step["status"], step["problem"], step["seconds"], step["output"]))
            self.db.execute("commit")
        except Exception:
            self.db.execute("rollback")
            raise

    def runs(self, limit: int = 50, plan: str | None = None) -> list[dict]:
        query = "select id, plan, target, trigger, started, finished, status, error from runs"
        args: list = []
        if plan:
            query, args = query + " where plan=?", [plan]
        rows = self.db.execute(query + " order by id desc limit ?", args + [limit]).fetchall()
        return [dict(zip(("id", "plan", "target", "trigger", "started", "finished", "status", "error"), r)) for r in rows]

    def run(self, run_id: int) -> dict | None:
        runs = self.db.execute("select id, plan, target, trigger, started, finished, status, error from runs where id=?", (run_id,)).fetchone()
        if not runs:
            return None
        result = dict(zip(("id", "plan", "target", "trigger", "started", "finished", "status", "error"), runs))
        rows = self.db.execute("select name, status, problem, seconds, output from steps where run=? order by idx", (run_id,)).fetchall()
        result["steps"] = [dict(zip(("name", "status", "problem", "seconds", "output"), r)) for r in rows]
        return result

    def finish_orphans(self) -> None:
        """A run that was running when the app stopped did not finish: say so instead of showing it as running forever."""
        self.db.execute("update runs set status='failed', error='the app stopped during this run', finished=? where status='running'", (self.now(),))

    def prune(self) -> None:
        cutoff = self.now() - KEEP_DAYS * 86400
        self.db.execute("delete from steps where run in (select id from runs where started<?)", (cutoff,))
        self.db.execute("delete from runs where started<?", (cutoff,))

    # --- failure issues ---------------------------------------------------------------------------------------
    def issue_for(self, sig: str) -> dict | None:
        row = self.db.execute("select signature, repo, number, url, plan, target, passing_noted, last_run from issues where signature=?", (sig,)).fetchone()
        return dict(zip(("signature", "repo", "number", "url", "plan", "target", "passing_noted", "last_run"), row)) if row else None

    def remember_issue(self, sig: str, repo: str, number: int, url: str, plan: str, target: str | None, run_id: int) -> None:
        self.db.execute("insert or replace into issues values(?,?,?,?,?,?,0,?)", (sig, repo, number, url, plan, target, run_id))

    def failed_again(self, sig: str, run_id: int) -> None:
        self.db.execute("update issues set passing_noted=0, last_run=? where signature=?", (run_id, sig))

    def awaiting_pass(self, plan: str, target: str | None) -> list[dict]:
        rows = self.db.execute("select signature, repo, number, url, plan, target, passing_noted, last_run from issues "
                               "where plan=? and target is ? and passing_noted=0", (plan, target)).fetchall()
        return [dict(zip(("signature", "repo", "number", "url", "plan", "target", "passing_noted", "last_run"), r)) for r in rows]

    def passing_noted(self, sig: str) -> None:
        self.db.execute("update issues set passing_noted=1 where signature=?", (sig,))

    def forget_issue(self, sig: str) -> None:
        self.db.execute("delete from issues where signature=?", (sig,))


def summary(result: dict | None, now: float) -> str:
    if not result:
        return "No run yet"
    when = ago(now - (result.get("finished") or result["started"]))
    return {"passed": "passed", "failed": "failed", "refused": "was refused"}.get(result["status"], result["status"]) + " " + when


def ago(seconds: float) -> str:
    if seconds < 3600:
        return f"{max(1, int(seconds // 60))} min ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)} h ago"
    return f"{int(seconds // 86400)} d ago"
