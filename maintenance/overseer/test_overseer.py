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


class Usage(unittest.TestCase):
    LINES = (json.dumps({"task": "impl-1", "runner": "r1", "finished": "2026-11-21T10:00:00Z", "model": ["m"], "cost_usd": 1.5,
                         "input_tokens": 10, "cache_read_tokens": 380, "cache_write_tokens": 10, "output_tokens": 22}) + "\n"
             + json.dumps({"task": "impl-2", "runner": "r1", "finished": "2026-11-21T12:00:00Z", "cost_usd": 0.5, "output_tokens": 8}) + "\n"
             + json.dumps({"task": "old", "runner": "r2", "finished": "2026-11-20T01:00:00Z", "cost_usd": 2}) + "\nnot json\njq: error\n[1]\n")

    def test_summary_per_task_and_per_day_and_runner(self):
        s = overseer.usage_summary(overseer.parse_usage(self.LINES))
        self.assertEqual(s["tasks"]["impl-1"]["input"], 400)
        self.assertEqual(s["tasks"]["impl-1"]["cached"], 380)
        self.assertEqual(s["days"][0], {"day": "2026-11-21", "runner": "r1", "tasks": 2, "input": 400, "cached": 380, "output": 30, "cost": 2.0})
        self.assertEqual([(d["day"], d["runner"]) for d in s["days"]], [("2026-11-21", "r1"), ("2026-11-20", "r2")])

    def test_queue_reads_usage_files_and_survives_no_files(self):
        class Ex(FakeExecutor):
            def run(self, command, timeout, stdin=None):
                return (0, UsageText) if "/usage" in command else super().run(command, timeout, stdin)
        UsageText = self.LINES
        self.assertEqual(len(overseer.Queue(Ex()).usage()["tasks"]), 3)
        self.assertEqual(overseer.Queue(FakeExecutor()).usage(), {"tasks": {}, "days": []})

    def test_state_marks_jobs_that_start_claude(self):
        app, _ = make_app()
        jobs = {j["name"]: j["claude"] for j in app.state()["jobs"]}
        self.assertEqual(jobs, {"stall-check": False, "report": True, "lessons": True, "pick-up": True})
        self.assertIn("usage", app.state())


class Board(unittest.TestCase):
    def reply(self, nodes, options=("Todo", "Ready for agents")):
        body = json.dumps({"data": {"repositoryOwner": {"projectV2": {"field": {"options": [{"name": o} for o in options]}, "items": {"nodes": nodes}}}}}).encode()
        return lambda request, timeout: _Resp(body)

    def test_only_open_issues_in_the_column_in_order_with_labels(self):
        def node(n, column, state="OPEN", labels=(), comment=None):
            return {"status": {"name": column}, "content": {"number": n, "title": f"t{n}", "url": f"https://github.com/o/r/issues/{n}", "state": state,
                    "repository": {"nameWithOwner": "o/r"}, "labels": {"nodes": [{"name": l} for l in labels]},
                    "comments": {"nodes": [{"body": comment}] if comment else []}}}
        nodes = [node(5, "Ready for agents"), node(6, "Todo"), node(7, "Ready for agents", "CLOSED"), {"status": None, "content": None},
                 node(8, "Ready for agents", labels=["needs-shape"], comment="\nmissing Done when\nmore")]
        got = overseer.fetch_column("t", "o/1", "Ready for agents", self.reply(nodes))
        self.assertIsNone(got["problem"])
        self.assertEqual([i["number"] for i in got["items"]], [5, 8])
        self.assertEqual(got["items"][1]["labels"], ["needs-shape"])
        self.assertEqual(got["items"][1]["reason"], "missing Done when")

    def test_asks_github_for_the_cards_in_board_order(self):
        sent = []
        def opener(request, timeout):
            sent.append(request.data.decode())
            return self.reply([])(request, timeout)
        overseer.fetch_column("t", "o/1", "Ready for agents", opener)
        self.assertIn("orderBy:{field:POSITION,direction:ASC}", sent[0])

    def test_missing_column_and_board_are_reported(self):
        got = overseer.fetch_column("t", "o/2", "Ready for agents", self.reply([], options=("Todo",)))
        self.assertEqual(got["problem"], "Board o/2 has no column 'Ready for agents'")
        empty = lambda request, timeout: _Resp(json.dumps({"data": {"repositoryOwner": None}}).encode())
        self.assertIn("not found", overseer.fetch_column("t", "o/3", "x", empty)["problem"])

    def test_parse_boards(self):
        self.assertEqual(overseer.parse_boards("a/17: Ready for agents, b/2: Ready for agents"), [("a/17", "Ready for agents"), ("b/2", "Ready for agents")])
        self.assertEqual(overseer.parse_boards(""), [])
        for bad in ("nonsense", "a/x: C", "a/1"):
            with self.assertRaises(overseer.InvalidConfig):
                overseer.parse_boards(bad)

    def test_pause_window(self):
        at = lambda h, m: 1_700_000_000 - 1_700_000_000 % 86400 + h * 3600 + m * 60
        self.assertTrue(overseer.in_pause("08:00-18:00", at(8, 0)))
        self.assertFalse(overseer.in_pause("08:00-18:00", at(18, 0)))
        self.assertTrue(overseer.in_pause("22:00-06:00", at(23, 30)))
        self.assertTrue(overseer.in_pause("22:00-06:00", at(5, 59)))
        self.assertFalse(overseer.in_pause("22:00-06:00", at(12, 0)))
        self.assertFalse(overseer.in_pause("", at(12, 0)))
        with self.assertRaises(overseer.InvalidConfig):
            overseer.in_pause("8-18", 0)


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
    def item(self, n, repo="o/r", labels=()):
        return {"repo": repo, "number": n, "title": f"t{n}", "url": f"https://github.com/{repo}/issues/{n}", "labels": list(labels), "reason": "missing Done when"}

    def boards(self, mapping):
        return lambda token, board, column: mapping[board]

    def test_pick_up_empty_boards_queues_nothing(self):
        app, ex = make_app(self.boards({}), GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "manual")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])
        self.assertIn("AGENT_BOARDS is empty", text)

    def test_pick_up_two_boards_in_board_then_card_order_once(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(8)], "problem": None}, "o/2": {"items": [self.item(3, "o/apps")], "problem": None}}
        app, ex = make_app(self.boards(mapping), AGENT_BOARDS="o/1: Ready for agents, o/2: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.run_job("pick-up", "schedule")
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-8", "pick-apps-3"])
        ok, text = app.run_job("pick-up", "schedule")
        self.assertIn("nothing", text)
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-8", "pick-apps-3"])

    def test_pick_up_skips_needs_shape_and_reports_it(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(6, labels=["needs-shape"]), self.item(7)], "problem": None}}
        app, ex = make_app(self.boards(mapping), AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-7"])
        self.assertIn("skipped #6", text)
        self.assertIn("Skipped: o/r#6 needs shape: missing Done when", app.state()["report"])

    def test_pick_up_wrong_column_shows_in_state_and_report(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None}, "o/2": {"items": [], "problem": "Board o/2 has no column 'Ready for agents'"}}
        app, ex = make_app(self.boards(mapping), AGENT_BOARDS="o/1: Ready for agents, o/2: Ready for agents", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertEqual(ex.added(), ["pick-r-5"])
        state = app.state()
        self.assertEqual(state["pickup"]["problems"], ["Board o/2 has no column 'Ready for agents'"])
        self.assertIn("Board o/2 has no column", state["report"])

    def test_pick_up_pause_window_queues_nothing(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None}}
        app, ex = make_app(self.boards(mapping), AGENT_BOARDS="o/1: Ready for agents", PAUSE_BETWEEN="00:00-23:59", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])
        self.assertIn("paused", text)

    def test_pick_up_skips_tasks_already_in_the_queue(self):
        status = "worker: running\npaused: no\nrunning:\n  pick-r-5 (log idle 10s)\npending:\n  pick-r-8\n"
        mapping = {"o/1": {"items": [self.item(n) for n in (5, 8, 9)], "problem": None}}
        ex = FakeExecutor(status)
        app = main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20, "AGENT_BOARDS": "o/1: Ready for agents",
                        "GITHUB_TOKEN": "gh-token-1"}, executor=ex, fetch_board=self.boards(mapping))
        ok, _ = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-9"])

    def test_lessons_and_unknown_job(self):
        app, ex = make_app()
        self.assertTrue(app.run_job("lessons", "schedule")[0])
        self.assertTrue(ex.added()[0].startswith("lessons-"))
        self.assertEqual(app.jobs.data["jobs"]["lessons"]["trigger"], "schedule")
        self.assertFalse(app.run_job("nope", "manual")[0])

    def test_start_needs_queue_host(self):
        with self.assertRaises(overseer.InvalidConfig):
            main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp()})


class ReleaseCheck(unittest.TestCase):
    ENV = dict(CLI_SERVER="https://test.example", CLI_API_KEY="cli-key-secret-1", RELEASE_REPO="o/r")

    def now(self, app, version="0.2.176"):
        return app.start_release_check(version, spawn=lambda f: f())

    def test_upgrades_then_queues_once_and_a_repeat_does_nothing(self):
        app, ex = make_app(**self.ENV)
        code, _ = self.now(app)
        self.assertEqual(code, 202)
        update = [c for c in ex.calls if "server update" in c[0]]
        self.assertEqual(len(update), 1)
        self.assertIn("--version server-v0.2.176 --wait", update[0][0])
        self.assertNotIn("cli-key-secret-1", update[0][0])  # the key goes on standard input
        self.assertEqual(update[0][1], "cli-key-secret-1\n")
        self.assertEqual(ex.added()[0].split()[0], "release-check-0-2-176")
        prompt = [c for c in ex.calls if "agent-queue add" in c[0]][0][1]
        self.assertIn("Haiku", prompt)
        self.assertIn("server-v0.2.176", prompt)
        self.assertEqual(self.now(app)[0], 200)
        self.assertEqual(self.now(app, "server-v0.2.176")[0], 200)
        self.assertEqual(len([c for c in ex.calls if "server update" in c[0]]), 1)
        self.assertEqual(len(ex.added()), 1)

    def test_failed_upgrade_queues_nothing_posts_on_the_release_and_may_be_retried(self):
        app, ex = make_app(**self.ENV)
        run = ex.run

        def failing(command, timeout, stdin=None):
            if "server update" in command:
                ex.calls.append((command, stdin))
                return 1, "boom cli-key-secret-1\n"
            return run(command, timeout, stdin)
        ex.run = failing
        self.assertEqual(self.now(app)[0], 202)
        self.assertEqual(ex.added(), [])
        posted = [c for c in ex.calls if "gh release edit" in c[0]]
        self.assertEqual(len(posted), 1)
        self.assertIn("upgrade to 0.2.176 failed", posted[0][1])
        self.assertNotIn("boom", posted[0][1])
        self.assertNotIn("cli-key-secret-1", posted[0][1])
        self.assertEqual(app.jobs.data["releases"]["0.2.176"]["state"], "failed")
        ex.run = run
        self.assertEqual(self.now(app)[0], 202)

    def test_a_release_left_running_by_a_stopped_app_may_be_tried_again(self):
        clock = [1000.0]
        app, ex = make_app(**self.ENV)
        app.jobs.now = lambda: clock[0]
        self.assertTrue(app.jobs.claim_release("0.2.176"))
        clock[0] += 60
        self.assertFalse(app.jobs.claim_release("0.2.176"))
        clock[0] += 30 * 60
        self.assertTrue(app.jobs.claim_release("0.2.176"))

    def test_bad_version_and_missing_setup(self):
        app, ex = make_app(**self.ENV)
        for bad in ("", "latest", "0.2", "0.2.1; rm -rf /"):
            self.assertEqual(self.now(app, bad)[0], 400)
        bare, _ = make_app()
        self.assertEqual(self.now(bare)[0], 409)
        self.assertEqual(ex.calls, [])

    def test_endpoint_needs_the_token(self):
        app, ex = make_app(**self.ENV)
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app, b""))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        url = f"http://127.0.0.1:{server.server_port}/api/release-check"
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(url, b'{"version":"0.2.176"}', {"X-Overseer": "1"}, method="POST"))
        self.assertEqual(caught.exception.code, 401)
        self.assertEqual(ex.calls, [])


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
