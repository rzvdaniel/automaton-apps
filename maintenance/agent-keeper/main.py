"""Agent Keeper: turns a Runner machine into a GitHub Actions agent machine through runner:host-exec, from one page.

An administrator starts each run on the page; the platform checks that person and the approval on every call. The app keeps
no token: a registration or removal token goes to the script once, on standard input.
"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import keeper

try:
    import board
except ImportError:  # from the source folder, before the build copies it
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "actions", "pick"))
    import board

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"), "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/keeper.js": ("keeper.js", "text/javascript; charset=utf-8"), "/keeper.css": ("keeper.css", "text/css; charset=utf-8"),
    "/ui/app.css": ("ui/app.css", "text/css; charset=utf-8"), "/ui/app.js": ("ui/app.js", "text/javascript; charset=utf-8"),
}
CODES = {"ok": 200, "not_approved": 403, "forbidden": 403, "not_found": 404, "conflict": 409, "invalid": 400, "no_key": 403, "not_configured": 404}


def log(text: str) -> None:
    print(text, flush=True)


class Keeper:
    def __init__(self, env=None):
        self.settings = keeper.Settings(env)
        self.path = os.path.join((env or os.environ).get("AUTOMATON_APP_DATA_DIR", "data"), "state.json")
        self.lock = threading.Lock()
        self.running = None  # {"action", "startedAt"} while a script runs
        self.state = self.load()
        self.cache = {}  # name -> (time, value): the queue for 30 seconds, the newest tool versions for an hour
        self.api = None  # replaced in tests

    def load(self) -> dict:
        try:
            with open(self.path, encoding="utf-8") as handle:
                state = json.load(handle)
            return state if isinstance(state, dict) else {}
        except (OSError, ValueError):
            return {}

    def save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path + ".tmp", "w", encoding="utf-8") as handle:
                json.dump(self.state, handle)
            os.replace(self.path + ".tmp", self.path)
        except OSError as error:
            log(f"Could not save the last result: {type(error).__name__}")

    def view(self, admin: bool) -> dict:
        with self.lock:
            last = {k: v for k, v in (self.state.get("last") or {}).items() if k in keeper.ACTIONS}
            return {"admin": admin, "missing": self.settings.missing(), "running": self.running, "last": last,
                    "status": self.state.get("status"), "parallel": int(self.settings.parallel), "board": self.settings.board,
                    "agents": self.settings.agent_choice, "repos": self.settings.repos.replace(",", " ").split(), "hasToken": bool(self.settings.gh_token),
                    "config": {"repo": self.settings.repo, "name": self.settings.name, "labels": self.settings.labels, "user": self.settings.user, "docker": self.settings.docker}}

    def config(self):
        return board.Config.from_env({"AGENT_GH_TOKEN": self.settings.gh_token, "AGENT_BOARD": self.settings.board, "AGENT_REPOS": self.settings.repos,
                                      "AGENT_PARALLEL": self.settings.parallel, "AGENT_REPO": self.settings.repo,
                                      **self.settings.agent_choice})

    def cached(self, name: str, ttl: float, make):
        with self.lock:
            hit = self.cache.get(name)
            if hit and time.time() - hit[0] < ttl:
                return hit[1]
        value = make()
        with self.lock:
            self.cache[name] = (time.time(), value)
        return value

    def queue(self) -> dict:
        """The Queue tab's data from GitHub, kept for 30 seconds. A failure becomes a message, never a stack trace."""
        def make():
            try:
                config = self.config()
                return {"ok": True, "data": board.snapshot(self.api or board.GitHub(config.token), config)}
            except board.BoardError as error:
                return {"ok": False, "message": str(error)}
        return self.cached("queue", 30, make)

    def token_problem(self) -> str | None:
        """Why the saved token cannot pick up (a missing scope), or None. Checked once an hour; an unreachable GitHub says nothing."""
        if not self.settings.gh_token:
            return "No AGENT_GH_TOKEN secret is saved, so Pick up cannot work. Save a token with the project, repo and workflow scopes."
        def make():
            try:
                return board.scope_problem(board.token_scopes(self.api or board.GitHub(self.settings.gh_token)))
            except board.BoardError:
                return None
        return self.cached("scopes", 3600, make)

    def latest(self) -> dict:
        return self.cached("latest", 3600, keeper.latest_versions)

    def run_again(self, repo: str, number) -> tuple[int, dict]:
        if not isinstance(number, int) or not isinstance(repo, str):
            return 400, {"status": "invalid", "message": "Say which card."}
        try:
            config = self.config()
            message = board.retry(self.api or board.GitHub(config.token), config, repo, number)
        except board.BoardError as error:
            return 400, {"status": "invalid", "message": str(error)}
        with self.lock:
            self.cache.pop("queue", None)
        log(f"run again {repo}#{number}")
        return 200, {"status": "ok", "message": message}

    def verify_now(self) -> tuple[int, dict]:
        try:
            config = self.config()
            result = board.verify(self.api or board.GitHub(config.token), config, force=True)
        except board.BoardError as error:
            return 400, {"status": "invalid", "message": str(error)}
        with self.lock:
            self.cache.pop("queue", None)
        log(f"verify now: {result.get('message', '')}")
        return 200, {"status": "ok", "message": result.get("message", "")}

    def start(self, action: str, token: str | None, viewer: str | None) -> tuple[int, dict]:
        """Validates and starts one run. Status runs in the request; the others in a thread (they take minutes)."""
        if action not in keeper.ACTIONS:
            return 404, {"error": "Not found"}
        if self.settings.missing():
            return 400, {"status": "invalid", "message": self.settings.missing()}
        try:
            body = keeper.build_request(self.settings, action, token)
        except ValueError as error:
            return 400, {"status": "invalid", "message": str(error)}
        with self.lock:
            if self.running:
                return 409, {"status": "conflict", "message": f"{self.running['action']} is still running."}
            self.running = {"action": action, "startedAt": time.time()}
        if action == "status":
            self.run(action, body, token, viewer)
            return 200, self.view(True)
        threading.Thread(target=self.run, args=(action, body, token, viewer), daemon=True).start()
        return 202, self.view(True)

    def refresh_status(self, viewer: str | None) -> None:
        """Reads the machine again after a change, so the page never shows the state from before it. A failure leaves no status."""
        try:
            started = time.time()
            status, data, message = keeper.host_exec(self.settings, keeper.build_request(self.settings, "status", None), viewer, keeper.TIMEOUTS["status"] + 240)
            if status == "ok" and isinstance(data, dict) and data.get("exitCode") == 0:
                result = {"at": started, "endedAt": time.time(), "status": "ok", "message": None, "exitCode": 0, "timedOut": False, "output": ""}
                with self.lock:
                    self.state["status"] = dict(result, parsed=keeper.parse_status(data.get("output") or ""))
        except Exception as error:  # the run itself already succeeded
            log(f"status after run failed: {type(error).__name__}")

    def run(self, action: str, body: dict, token: str | None, viewer: str | None) -> None:
        started = time.time()
        try:
            status, data, message = keeper.host_exec(self.settings, body, viewer, keeper.TIMEOUTS[action] + 240)
        except Exception as error:  # a bug must never leave the app stuck on "running"
            status, data, message = "error", None, f"The run failed: {type(error).__name__}."
        result = {"at": started, "endedAt": time.time(), "status": status, "message": message, "exitCode": None, "timedOut": False, "output": ""}
        if status == "ok" and isinstance(data, dict):
            result.update(exitCode=data.get("exitCode"), timedOut=bool(data.get("timedOut")),
                          output=keeper.scrub("\n".join(x for x in (data.get("output"), data.get("error")) if x), token))
        with self.lock:
            if action == "status":
                self.state["status"] = dict(result, parsed=keeper.parse_status(result["output"]) if result["exitCode"] == 0 else None, output="")
            else:
                self.state.setdefault("last", {})[action] = result
                self.state["status"] = None  # what it said before this run is no longer true
        if action != "status" and status == "ok" and result["exitCode"] == 0:
            self.refresh_status(viewer)
        with self.lock:
            self.running = None
        self.save()
        log(f"{action}: {status} exit={result['exitCode']}")  # never the output or the input


def make_handler(app: Keeper):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AgentKeeper"

        def log_message(self, format, *args):
            pass

        def send_body(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def json(self, status: int, payload: dict) -> None:
            self.send_body(status, json.dumps(payload).encode(), "application/json")

        def admin(self) -> bool:  # display only; the server checks the viewer token on every host command
            return app.settings.in_automaton and (self.headers.get("X-Automaton-Viewer-Role") or "").lower() == "administrator"

        def do_POST(self):  # noqa: N802
            path = urlsplit(self.path).path
            if not path.startswith("/api/") or self.headers.get("X-Agent-Keeper") != "1":
                return self.json(404, {"error": "Not found"})
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(max(0, min(length, 4000))).decode("utf-8") or "{}")
            except (ValueError, UnicodeDecodeError):
                body = {}
            if path == "/api/retry":  # the GitHub token acts here, so the platform's administrator role is required
                if not self.admin():
                    return self.json(403, {"status": "forbidden", "message": "Only a system administrator can run a card again."})
                body = body if isinstance(body, dict) else {}
                return self.json(*app.run_again(body.get("repo"), body.get("number")))
            if path == "/api/verify":
                if not self.admin():
                    return self.json(403, {"status": "forbidden", "message": "Only a system administrator can start verification."})
                return self.json(*app.verify_now())
            if not path.startswith("/api/run/"):
                return self.json(404, {"error": "Not found"})
            token = body.get("token") if isinstance(body, dict) and isinstance(body.get("token"), str) else None
            code, payload = app.start(path[len("/api/run/"):], (token or "").strip() or None, self.headers.get("X-Automaton-Viewer-Token"))
            self.json(code, payload)

        def do_GET(self):  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/health":
                return self.send_body(200, b"ok", "text/plain")
            if path == "/api/queue":
                return self.json(200, app.queue())
            if path == "/api/token":
                return self.json(200, {"problem": app.token_problem()})
            if path == "/api/latest":
                return self.json(200, app.latest())
            if path == "/api/state":
                return self.json(200, app.view(self.admin()))
            entry = STATIC.get(path)
            if not entry:
                return self.json(404, {"error": "Not found"})
            try:
                with open(os.path.join(HERE, entry[0]), "rb") as handle:
                    return self.send_body(200, handle.read(), entry[1])
            except OSError:
                return self.json(404, {"error": "Not found"})

    return Handler


def main() -> int:
    try:
        app = Keeper()
    except keeper.ConfigError as error:
        print(f"Invalid setting: {error}", file=sys.stderr)
        return 2
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    log(f"Agent Keeper listening on port {port}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(app)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
