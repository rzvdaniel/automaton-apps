"""Agent Keeper logic: build the four host scripts, run one on a machine through runner:host-exec, read the answer.

Plain functions, testable without a server. The app stores no token: a registration or removal token is passed to the script on
standard input once, and is never written to a file, a log or the saved result.
"""

from __future__ import annotations

import json
import os
import re
import shlex
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

HERE = os.path.dirname(os.path.abspath(__file__))
USER_AGENT = "Automaton-Agent-Keeper/1.0"
GUID = re.compile(r"^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")
TOKEN = re.compile(r"^[A-Za-z0-9_\-]{10,200}$")
NAME = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")
LABELS = re.compile(r"^[A-Za-z0-9_.\-]+(,[A-Za-z0-9_.\-]+)*$")
USER = re.compile(r"^[a-z_][a-z0-9_\-]{0,31}$")
REPO = re.compile(r"^[A-Za-z0-9_.\-]+(/[A-Za-z0-9_.\-]+)?$")
ACTIONS = ("setup", "status", "remove", "update-tools")
NEEDS_TOKEN = ("remove",)  # setup needs one only while the machine is not registered; the script says so
TIMEOUTS = {"setup": 1800, "status": 60, "remove": 300, "update-tools": 1200}
OUTPUT_LIMIT = 20000


class ConfigError(ValueError):
    """A setting is invalid; the message says which one."""


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.api_base_url = (env.get("AUTOMATON_API_URL", "").strip() or env.get("API_BASE_URL", "").strip()).rstrip("/")
        self.in_automaton = bool(env.get("AUTOMATON_API_URL", "").strip())  # only then are the viewer headers the platform's
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()
        self.runner_id = env.get("AGENT_MACHINE_ID", "").strip()
        if self.runner_id and not GUID.match(self.runner_id):
            raise ConfigError("AGENT_MACHINE_ID must be the machine's id (a GUID shown in Studio under Runners)")
        repo = env.get("AGENT_REPO", "").strip().removeprefix("https://github.com/").strip("/")
        if repo and not REPO.match(repo):
            raise ConfigError("AGENT_REPO must be owner/repo, or just an organisation name")
        self.repo = repo
        self.name = env.get("AGENT_RUNNER_NAME", "").strip() or "agent-keeper"
        self.labels = env.get("AGENT_RUNNER_LABELS", "").strip().replace(" ", "") or "agent"
        self.docker = env.get("AGENT_DOCKER_ACCESS", "").strip().lower() == "true"
        self.user = env.get("AGENT_RUNNER_USER", "").strip() or "agent"
        self.parallel = (env.get("AGENT_PARALLEL", "").strip() or "1")
        if self.parallel not in ("1", "2"):
            raise ConfigError("AGENT_PARALLEL must be 1 or 2")
        self.gh_token = env.get("AGENT_GH_TOKEN", "").strip()
        self.agent_choice = {k: env.get(k, "").strip() for k in ("AGENT_CLI", "AGENT_MODEL", "AGENT_REVIEW_CLI", "AGENT_REVIEW_MODEL")}
        self.board = (env.get("AGENT_BOARD", "").strip() or "rzvdaniel/17")
        self.repos = (env.get("AGENT_REPOS", "").strip() or "automaton automaton-apps automaton-monster")
        for value, pattern, label in ((self.name, NAME, "AGENT_RUNNER_NAME"), (self.labels, LABELS, "AGENT_RUNNER_LABELS"), (self.user, USER, "AGENT_RUNNER_USER")):
            if not pattern.match(value):
                raise ConfigError(f"{label} has characters that are not allowed")

    @property
    def github_url(self) -> str:
        return "https://github.com/" + self.repo if self.repo else ""

    def missing(self) -> str | None:
        """What must be set before a host script can run, or None."""
        if not self.runner_id:
            return "Set AGENT_MACHINE_ID to the machine this app manages."
        if not self.repo:
            return "Set AGENT_REPO to the repository (owner/repo) or organisation the runner belongs to."
        return None


def read_script(action: str) -> str:
    if action not in ACTIONS:
        raise ValueError("unknown action")
    parts = []
    for name in ("common.sh", action + ".sh"):
        with open(os.path.join(HERE, "scripts", name), encoding="utf-8") as handle:
            parts.append(handle.read())
    return "\n".join(parts)


def build_request(settings: Settings, action: str, token: str | None) -> dict:
    """The host-exec body. The settings are validated and quoted into a header; the token goes only into stdin."""
    if action in NEEDS_TOKEN and not token:
        raise ValueError("Enter a runner removal token.")
    if token and not TOKEN.match(token):
        raise ValueError("That does not look like a runner token (letters, digits, - and _ only).")
    header = "".join(f"{key}={shlex.quote(value)}\n" for key, value in
                     (("AK_USER", settings.user), ("AK_URL", settings.github_url), ("AK_NAME", settings.name), ("AK_LABELS", settings.labels),
                      ("AK_DOCKER", "true" if settings.docker else "false"), ("AK_PARALLEL", settings.parallel)))
    stdin = (token + "\n") if token and action in ("setup", "remove") else None
    return {"script": header + read_script(action), "stdin": stdin, "timeoutSeconds": TIMEOUTS[action]}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


STATUS_CODES = {400: "invalid", 401: "not_approved", 403: "forbidden", 404: "not_found", 409: "conflict"}


def host_exec(settings: Settings, body: dict, viewer_token: str | None, timeout: float, opener=None) -> tuple[str, dict | None, str | None]:
    """POST /api/server/runners/{id}/host-exec. Returns (status, data, message); status is ok, forbidden, not_approved, not_found,
    conflict, invalid, no_key, not_configured or error."""
    if not settings.api_base_url:
        return "not_configured", None, "The server address (AUTOMATON_API_URL) is not set."
    if not settings.api_key:
        return "no_key", None, "The app has no key yet."
    headers = {"Authorization": "Bearer " + settings.api_key, "Accept": "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT}
    if viewer_token:
        headers["X-Automaton-Viewer-Token"] = viewer_token
    request = Request(f"{settings.api_base_url}/api/server/runners/{settings.runner_id}/host-exec", method="POST", headers=headers,
                      data=json.dumps(body).encode("utf-8"))
    try:
        with (opener or build_opener(_NoRedirect())).open(request, timeout=timeout) as response:
            return "ok", json.loads(response.read(4_000_000).decode("utf-8") or "null"), None
    except HTTPError as error:
        message = ""
        try:
            parsed = json.loads(error.read(10_000).decode("utf-8"))
            message = str(parsed.get("error") or parsed.get("message") or "")
        except (ValueError, OSError, AttributeError):
            pass
        if error.code == 403 and not message:
            message = "Only a system administrator can do this, on a machine they approved this app for (host access must be on)."
        return STATUS_CODES.get(error.code, "error"), None, message or f"The server answered HTTP {error.code}."
    except (URLError, OSError, ValueError) as error:
        return "error", None, f"The server could not be reached: {type(error).__name__}."


def scrub(text: str, token: str | None) -> str:
    """The script's output, without the token (the server already masks lines that repeat the input) and cut to a limit."""
    text = text or ""
    if token:
        text = text.replace(token, "***")
    return text[-OUTPUT_LIMIT:]


def parse_status(output: str) -> dict:
    """Turns the status script's name=value lines into the figures the page shows."""
    values = {}
    for line in (output or "").splitlines():
        key, sep, value = line.partition("=")
        if sep and re.match(r"^[a-z_]+$", key):
            values[key] = value.strip()
    registered = values.get("registered") == "yes"
    service = values.get("service", "none")
    if not registered:
        state = "not set up"
    elif service != "active":
        state = "offline"
    elif values.get("busy") == "yes":
        state = "busy"
    elif values.get("listening", "0") not in ("", "0"):
        state = "online, idle"
    else:
        state = "starting"
    def number(key):
        return int(values[key]) if values.get(key, "").isdigit() else None
    return {
        "state": state, "registered": registered, "service": service, "url": values.get("url") or None,
        "runnerName": values.get("runner_name") or None, "job": values.get("job") or None,
        "tools": {key[5:]: values[key] for key in sorted(values) if key.startswith("tool_") and values[key]},
        "diskTotal": number("disk_total"), "diskUsed": number("disk_used"),
        "dockerPath": values.get("docker_path") or None, "dockerTotal": number("docker_total"), "dockerUsed": number("docker_used"),
        "runners": number("runner_count"),
    }


LATEST = {
    "claude": ("https://registry.npmjs.org/@anthropic-ai/claude-code/latest", lambda d: d.get("version")),
    "gh": ("https://api.github.com/repos/cli/cli/releases/latest", lambda d: (d.get("tag_name") or "").lstrip("v")),
    "runner": ("https://api.github.com/repos/actions/runner/releases/latest", lambda d: (d.get("tag_name") or "").lstrip("v")),
}


def latest_versions(opener=None) -> dict:
    """Newest released version of the tools that have a public release feed. A tool that cannot be read is left out."""
    found = {}
    for key, (url, pick) in LATEST.items():
        try:
            request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
            with (opener or build_opener(_NoRedirect())).open(request, timeout=10) as response:
                version = pick(json.loads(response.read(1_000_000).decode("utf-8")))
            if isinstance(version, str) and re.match(r"^[0-9][0-9A-Za-z.\-]{0,30}$", version):
                found[key] = version
        except (URLError, OSError, ValueError, AttributeError):
            continue
    return found


def version_of(text: str) -> str:
    match = re.search(r"[0-9]+(\.[0-9]+)+", text or "")
    return match.group(0) if match else ""
