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
                    "status": self.state.get("status"),
                    "config": {"repo": self.settings.repo, "name": self.settings.name, "labels": self.settings.labels, "user": self.settings.user}}

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

    def run(self, action: str, body: dict, token: str | None, viewer: str | None) -> None:
        started = time.time()
        status, data, message = keeper.host_exec(self.settings, body, viewer, keeper.TIMEOUTS[action] + 240)
        result = {"at": started, "endedAt": time.time(), "status": status, "message": message, "exitCode": None, "timedOut": False, "output": ""}
        if status == "ok" and isinstance(data, dict):
            result.update(exitCode=data.get("exitCode"), timedOut=bool(data.get("timedOut")),
                          output=keeper.scrub("\n".join(x for x in (data.get("output"), data.get("error")) if x), token))
        with self.lock:
            self.running = None
            if action == "status":
                self.state["status"] = dict(result, parsed=keeper.parse_status(result["output"]) if result["exitCode"] == 0 else None, output="")
            else:
                self.state.setdefault("last", {})[action] = result
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
            return (self.headers.get("X-Automaton-Viewer-Role") or "").lower() == "administrator"

        def do_POST(self):  # noqa: N802
            path = urlsplit(self.path).path
            if not path.startswith("/api/run/") or self.headers.get("X-Agent-Keeper") != "1":
                return self.json(404, {"error": "Not found"})
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(max(0, min(length, 4000))).decode("utf-8") or "{}")
            except (ValueError, UnicodeDecodeError):
                body = {}
            token = body.get("token") if isinstance(body, dict) and isinstance(body.get("token"), str) else None
            code, payload = app.start(path[len("/api/run/"):], (token or "").strip() or None, self.headers.get("X-Automaton-Viewer-Token"))
            self.json(code, payload)

        def do_GET(self):  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/health":
                return self.send_body(200, b"ok", "text/plain")
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
