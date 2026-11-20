import io
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import main
import overseer

STATUS = """worker:  running
paused:  no
running:
  fix-login-344 (log idle 120s)
pending:
  second-task
  third
finished (last 5):
  report-2026: done
  old-task-12: failed
"""


class FakeExecutor:
    def __init__(self, status=STATUS):
        self.calls, self.status = [], status

    def run(self, command, timeout, stdin=None):
        self.calls.append((command, stdin))
        if command.endswith("agent-queue status"):
            return 0, self.status
        if "tail -n" in command:
            return 0, "opened https://github.com/o/r/pull/9 for https://github.com/o/r/issues/344\n"
        return 0, "ok\n"

    def added(self):
        return [c.split("agent-queue add ")[1] for c, _ in self.calls if "agent-queue add" in c]


class Parse(unittest.TestCase):
    def test_status(self):
        s = overseer.parse_status(STATUS)
        self.assertEqual(s["worker"], "running")
        self.assertFalse(s["paused"])
        self.assertEqual(s["running"], [{"name": "fix-login-344", "idle": 120}])
        self.assertEqual([t["name"] for t in s["pending"]], ["second-task", "third"])
        self.assertEqual(s["finished"][1], {"name": "old-task-12", "state": "failed"})

    def test_links(self):
        got = overseer.links("fix-343", "see https://github.com/o/r/pull/9", "o/r")
        self.assertEqual(got["pulls"], ["https://github.com/o/r/pull/9"])
        self.assertEqual(got["issues"], ["https://github.com/o/r/issues/343"])
        self.assertEqual(overseer.links("fix", "", "o/r")["issues"], [])

    def test_redact(self):
        self.assertEqual(overseer.redact("a secret-token b", ["secret-token"]), "a [hidden] b")


class QueueTests(unittest.TestCase):
    def test_add_checks_name_and_prompt_and_quotes(self):
        ex = FakeExecutor()
        q = overseer.Queue(ex)
        self.assertIsNotNone(q.add("bad name; rm -rf /", "x"))
        self.assertIsNotNone(q.add("ok", "  "))
        self.assertIsNone(q.add("ok-1", "do it"))
        self.assertEqual(ex.calls[-1][1], "do it")
        self.assertIn("agent-queue add ok-1", ex.calls[-1][0])
        self.assertIn("AGENT_QUEUE_RUNNER=claude-task", ex.calls[-1][0])

    def test_log_and_cancel_refuse_bad_names(self):
        q = overseer.Queue(FakeExecutor())
        self.assertIsNone(q.log("../etc/passwd"))
        self.assertIsNotNone(q.cancel("a b"))

    def test_orchestrator_environment(self):
        ex = FakeExecutor()
        overseer.Queue(ex, stall_minutes=90).orchestrate(True)
        self.assertIn("ORCH_REPORT=1 ORCH_STALL_MINUTES=90 orchestrator.sh", ex.calls[-1][0])


class Board(unittest.TestCase):
    def reply(self, nodes):
        body = json.dumps({"data": {"repositoryOwner": {"projectV2": {"items": {"nodes": nodes}}}}}).encode()
        return lambda request, timeout: _Resp(body)

    def test_only_open_issues_in_the_column_in_order(self):
        def node(n, column, state="OPEN"):
            return {"status": {"name": column}, "content": {"number": n, "title": f"t{n}", "url": f"https://github.com/o/r/issues/{n}", "state": state, "repository": {"nameWithOwner": "o/r"}}}
        nodes = [node(5, "Ready for night"), node(6, "Todo"), node(7, "Ready for night", "CLOSED"), {"status": None, "content": None}, node(8, "Ready for night")]
        got = overseer.fetch_column("t", "o/1", "Ready for night", self.reply(nodes))
        self.assertEqual([i["number"] for i in got], [5, 8])

    def test_asks_github_for_the_cards_in_board_order(self):
        sent = []
        def opener(request, timeout):
            sent.append(request.data.decode())
            return _Resp(json.dumps({"data": {"repositoryOwner": {"projectV2": {"items": {"nodes": []}}}}}).encode())
        overseer.fetch_column("t", "o/1", "Ready", opener)
        self.assertIn("orderBy:{field:POSITION,direction:ASC}", sent[0])

    def test_bad_board(self):
        with self.assertRaises(overseer.InvalidConfig):
            overseer.fetch_column("t", "nonsense", "x")


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def make_app(board=None, **env):
    ex = FakeExecutor()
    base = {"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20}
    base.update(env)
    return main.App(base, executor=ex, fetch_board=board), ex


class Jobs(unittest.TestCase):
    def test_night_shift_with_empty_column_queues_nothing(self):
        app, ex = make_app(lambda *a: [], NIGHT_BOARD="o/1", NIGHT_COLUMN="Ready", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("night-shift", "manual")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])
        self.assertIn("nothing", text)

    def test_night_shift_queues_in_order_once(self):
        items = [{"repo": "o/r", "number": n, "title": f"t{n}", "url": f"https://github.com/o/r/issues/{n}"} for n in (5, 8, 9)]
        app, ex = make_app(lambda *a: items, NIGHT_BOARD="o/1", NIGHT_COLUMN="Ready", GITHUB_TOKEN="gh-token-1")
        app.run_job("night-shift", "schedule")
        self.assertEqual(ex.added(), ["night-r-5", "night-r-8", "night-r-9"])
        ok, text = app.run_job("night-shift", "schedule")
        self.assertIn("nothing", text)

    def test_night_shift_skips_tasks_already_in_the_queue(self):
        status = "worker: running\npaused: no\nrunning:\n  night-r-5 (log idle 10s)\npending:\n  night-r-8\n"
        items = [{"repo": "o/r", "number": n, "title": f"t{n}", "url": f"https://github.com/o/r/issues/{n}"} for n in (5, 8, 9)]
        ex = FakeExecutor(status)
        app = main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20, "NIGHT_BOARD": "o/1", "NIGHT_COLUMN": "Ready",
                        "GITHUB_TOKEN": "gh-token-1"}, executor=ex, fetch_board=lambda *a: items)
        ok, _ = app.run_job("night-shift", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["night-r-9"])

    def test_night_shift_off_without_board(self):
        app, ex = make_app()
        ok, text = app.run_job("night-shift", "manual")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])

    def test_lessons_and_unknown_job(self):
        app, ex = make_app()
        self.assertTrue(app.run_job("lessons", "schedule")[0])
        self.assertTrue(ex.added()[0].startswith("lessons-"))
        self.assertEqual(app.jobs.data["jobs"]["lessons"]["trigger"], "schedule")
        self.assertFalse(app.run_job("nope", "manual")[0])

    def test_start_needs_queue_host(self):
        with self.assertRaises(overseer.InvalidConfig):
            main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp()})


class Http(unittest.TestCase):
    def setUp(self):
        self.app, self.ex = make_app(ISSUE_REPO="o/r")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app, b"<html></html>"))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.addCleanup(self.server.shutdown)

    def call(self, method, path, body=None, headers=None):
        h = {"X-Overseer": "1", **(headers or {})}
        request = Request(self.base + path, json.dumps(body).encode() if body is not None else None, h, method=method)
        try:
            with urlopen(request) as r:
                return r.status, json.loads(r.read() or b"{}")
        except HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_standalone_needs_the_token(self):
        self.assertEqual(self.call("GET", "/api/state")[0], 401)
        self.assertEqual(self.call("GET", "/api/state", headers={"Authorization": "Bearer wrong-token-wrong"})[0], 401)
        status, state = self.call("GET", "/api/state", headers={"Authorization": "Bearer " + "a" * 20})
        self.assertEqual(status, 200)
        self.assertEqual(state["queue"]["pending"][0]["name"], "second-task")

    def test_page_and_health_are_public(self):
        self.assertEqual(urlopen(self.base + "/health").status, 200)
        self.assertEqual(urlopen(self.base + "/").status, 200)

    def test_post_needs_the_header_or_token(self):
        auth = {"Authorization": "Bearer " + "a" * 20}
        self.assertEqual(self.call("POST", "/api/tasks", {"name": "x1", "prompt": "p"}, auth)[0], 202)
        self.assertEqual(self.call("POST", "/api/tasks", {"name": "bad name", "prompt": "p"}, auth)[0], 400)
        self.assertEqual(self.call("POST", "/api/queue", {"paused": True}, auth)[1], {"paused": True})
        self.assertEqual(self.call("POST", "/api/queue", {"paused": "yes"}, auth)[0], 400)
        self.assertEqual(self.call("POST", "/api/jobs/lessons", {}, auth)[0], 200)
        self.assertEqual(self.call("POST", "/api/jobs/zzz", {}, auth)[0], 404)

    def test_task_detail_has_links(self):
        status, task = self.call("GET", "/api/tasks/fix-344", headers={"Authorization": "Bearer " + "a" * 20})
        self.assertEqual(task["pulls"], ["https://github.com/o/r/pull/9"])
        self.assertEqual(task["issues"], ["https://github.com/o/r/issues/344"])

    def test_managed_mode_only_administrators(self):
        self.app.managed = True
        self.assertEqual(self.call("GET", "/api/state")[0], 401)
        viewer = {"X-Automaton-Viewer-Role": "user", "X-Automaton-Viewer-Token": "t"}
        self.assertEqual(self.call("GET", "/api/state", headers=viewer)[0], 401)
        admin = {"X-Automaton-Viewer-Role": "Administrator", "X-Automaton-Viewer-Token": "t"}
        self.assertEqual(self.call("GET", "/api/state", headers=admin)[0], 200)
        self.assertEqual(self.call("POST", "/api/jobs/lessons", headers={"X-Overseer": "", **admin})[0], 403)  # no CSRF header


if __name__ == "__main__":
    unittest.main()
