import ast
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


IDLE = "worker: running\npaused: no\nrunning:\npending:\n"


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

    def test_reads_every_page_of_the_board(self):
        def node(n):
            return {"status": {"name": "Ready for agents"}, "content": {"number": n, "title": "t", "url": f"https://github.com/o/r/issues/{n}", "state": "OPEN",
                    "repository": {"nameWithOwner": "o/r"}, "labels": {"nodes": []}, "comments": {"nodes": []}}}
        pages = {None: ([node(1), node(2)], "c1"), "c1": ([node(3)], "c2"), "c2": ([node(4)], None)}
        sent = []
        def opener(request, timeout):
            after = json.loads(request.data)["variables"]["after"]
            sent.append(after)
            nodes, nxt = pages[after]
            body = {"data": {"repositoryOwner": {"projectV2": {"field": {"options": [{"name": "Ready for agents"}]},
                    "items": {"pageInfo": {"hasNextPage": nxt is not None, "endCursor": nxt}, "nodes": nodes}}}}}
            return _Resp(json.dumps(body).encode())
        got = overseer.fetch_column("t", "o/1", "Ready for agents", opener)
        self.assertEqual([i["number"] for i in got["items"]], [1, 2, 3, 4])
        self.assertEqual(sent, [None, "c1", "c2"])
        self.assertIsNone(got["problem"])

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


class CardMoves(unittest.TestCase):
    def reply(self, body):
        return lambda request, timeout: _Resp(json.dumps(body).encode())

    def test_merged_pull_needs_a_merge_after_the_task_was_queued(self):
        node = lambda url, merged, at: {"source": {"url": url, "merged": merged, "mergedAt": at}}
        nodes = [node("https://x/pull/1", True, "2026-01-01T00:00:00Z"), node("https://x/pull/2", False, None), {"source": {}}, node("https://x/pull/3", True, "2026-11-22T10:00:00Z")]
        body = {"data": {"repository": {"issue": {"timelineItems": {"nodes": nodes}}}}}
        item = {"repo": "o/r", "number": 5}
        since = overseer.iso_time("2026-11-22T09:00:00Z")
        self.assertEqual(overseer.merged_pull("t", item, since, self.reply(body)), ("https://x/pull/3", None))
        self.assertEqual(overseer.merged_pull("t", item, overseer.iso_time("2026-11-23T00:00:00Z"), self.reply(body)), ("", None))
        self.assertIn("could not read", overseer.merged_pull("t", item, 0, self.reply({"errors": [{"message": "x"}]}))[1])

    def test_set_card_picks_the_named_column(self):
        sent = []
        def opener(request, timeout):
            sent.append(json.loads(request.data)["variables"])
            return _Resp(b'{"data": {}}')
        board = {"id": "P", "field": "F", "options": {"Running": "o1", "Ready": "o2"}}
        self.assertIsNone(overseer.set_card("t", board, {"item": "I"}, "Running", opener))
        self.assertEqual(sent[0]["o"], "o1")
        self.assertIn("no column 'Gone'", overseer.set_card("t", board, {"item": "I"}, "Gone", opener))


class GraphQL(unittest.TestCase):
    def test_every_query_string_has_balanced_braces(self):
        tree = ast.parse(open(overseer.__file__, encoding="utf-8").read())
        queries = [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)
                   and n.value.lstrip().startswith(("query", "mutation"))]
        self.assertGreaterEqual(len(queries), 2)
        for q in queries:
            self.assertEqual(q.count("{"), q.count("}"), q[:60])
            self.assertEqual(q.count("("), q.count(")"), q[:60])

    def test_errors_response_reports_the_rejected_query(self):
        body = json.dumps({"errors": [{"message": "Parse error on EOF"}], "data": None}).encode()
        got = overseer.fetch_column("t", "o/1", "Ready for agents", lambda request, timeout: _Resp(body))
        self.assertEqual(got["problem"], "Board o/1: GitHub rejected the query: Parse error on EOF")


def make_app(board=None, status=STATUS, **env):
    ex = FakeExecutor(status)
    base = {"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20}
    base.update(env)
    app = main.App(base, executor=ex, fetch_board=board, move_card=lambda t, b, i, c: app.moved.append((i["number"], c)) or app.move_error,
                   comment=lambda t, i, text: app.commented.append((i["number"], text)) or None,
                   set_card=lambda t, b, i, c: app.set_to.append((i["number"], c)) or app.set_error,
                   find_pull=lambda t, i, since: (app.pulls.get(i["number"], ""), None))
    app.moved, app.commented, app.move_error, app.set_to, app.set_error, app.pulls = [], [], None, [], None, {}
    return app, ex


class Jobs(unittest.TestCase):
    def item(self, n, repo="o/r", labels=(), body="**Goal**\nx\n\n**Done when**\nit works"):
        return {"repo": repo, "number": n, "title": f"t{n}", "url": f"https://github.com/{repo}/issues/{n}", "labels": list(labels), "reason": "missing Done when",
                "body": body, "item": f"PVTI_{n}", "previous": "Inbox"}

    def boards(self, mapping):
        return lambda token, board, column: mapping[board]

    def make(self, mapping, **env):
        return make_app(self.boards(mapping), IDLE, **env)

    def test_pick_up_empty_boards_queues_nothing(self):
        app, ex = self.make({}, GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "manual")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])
        self.assertIn("AGENT_BOARDS is empty", text)

    def test_pick_up_without_a_token_fails_and_says_why(self):
        app, ex = self.make({}, AGENT_BOARDS="o/1: Ready for agents")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertIn("GITHUB_TOKEN is not set", text)
        self.assertFalse(app.jobs.data["jobs"]["pick-up"]["ok"])
        state = app.state()
        self.assertIn("read:project", state["pickup"]["warning"])

    def test_no_warning_with_token_or_without_boards(self):
        self.assertEqual(self.make({}, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")[0].state()["pickup"]["warning"], "")
        self.assertEqual(make_app(self.boards({}))[0].state()["pickup"]["warning"], "")

    def test_pick_up_two_boards_in_board_then_card_order_once(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(8)], "problem": None}, "o/2": {"items": [self.item(3, "o/apps")], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents, o/2: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="all")
        app.run_job("pick-up", "schedule")
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-8", "pick-apps-3"])
        ok, text = app.run_job("pick-up", "schedule")
        self.assertIn("nothing", text)
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-8", "pick-apps-3"])

    def test_pick_up_skips_needs_shape_and_reports_it(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(6, labels=["needs-shape"]), self.item(7)], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="all")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-7"])
        self.assertIn("skipped #6", text)
        self.assertIn("Skipped: o/r#6 not ready: it has the needs-shape label", app.state()["report"])

    def test_pick_up_moves_back_unshaped_cards_with_one_comment_each_and_no_repeat(self):
        mapping = {"o/1": {"items": [self.item(5, labels=["needs-shape"]), self.item(6, body="**Goal**\nno section"), self.item(7), self.item(8, body="Done when: x")],
                           "problem": None, "board": {}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="all")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-7", "pick-r-8"])
        app.pulls.update({7: "u", 8: "u"})  # the two queued tasks end with merged pull requests
        self.assertEqual(app.moved, [(5, "Ready for agents"), (6, "Ready for agents")])
        self.assertEqual([n for n, _ in app.commented], [5, 6])
        self.assertIn("needs-shape", app.commented[0][1])
        self.assertIn("no Done when", app.commented[1][1])
        app.run_job("pick-up", "schedule")  # the owner moved them back unchanged
        self.assertEqual(len(app.moved), 4)
        self.assertEqual(len(app.commented), 2)
        mapping["o/1"]["items"][1] = self.item(6, body="**Goal**\nstill nothing, edited")  # the issue changed and is still wrong
        app.run_job("pick-up", "schedule")
        self.assertEqual([n for n, _ in app.commented], [5, 6, 6])

    def test_pick_up_leaves_a_card_it_cannot_move_and_does_not_comment(self):
        mapping = {"o/1": {"items": [self.item(5, labels=["needs-shape"])], "problem": None, "board": {}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.move_error = "could not move it"
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertEqual(app.commented, [])
        self.assertEqual(ex.added(), [])

    def test_a_failed_comment_is_tried_again_on_the_next_run(self):
        mapping = {"o/1": {"items": [self.item(5, labels=["needs-shape"])], "problem": None, "board": {}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.comment = lambda t, i, text: "could not comment"
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        app.comment = lambda t, i, text: app.commented.append((i["number"], text)) or None
        app.run_job("pick-up", "schedule")
        app.run_job("pick-up", "schedule")
        self.assertEqual([n for n, _ in app.commented], [5])

    def test_shape_check_and_move_target(self):
        self.assertEqual(overseer.shape_problem(self.item(1)), "")
        self.assertEqual(overseer.shape_problem(self.item(1, body="  **Done when**\nx")), "")
        self.assertIn("no Done when", overseer.shape_problem(self.item(1, body="We are done when it works")))
        calls = []
        def opener(request, timeout=0):
            calls.append(json.loads(request.data)["variables"])
            return _Resp(b'{"data":{}}')
        board = {"id": "P", "field": "F", "options": {"Inbox": "o1", "Backlog": "o2", "Ready for agents": "o3"}}
        self.assertIsNone(overseer.move_card("t", board, {"item": "I", "previous": "Inbox"}, "Ready for agents", opener))
        self.assertIsNone(overseer.move_card("t", board, {"item": "I", "previous": ""}, "Ready for agents", opener))
        self.assertEqual([c["o"] for c in calls], ["o1", "o2"])

    def test_pick_up_wrong_column_shows_in_state_and_report(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None}, "o/2": {"items": [], "problem": "Board o/2 has no column 'Ready for agents'"}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents, o/2: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="all")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertEqual(ex.added(), ["pick-r-5"])
        state = app.state()
        self.assertEqual(state["pickup"]["problems"], ["Board o/2 has no column 'Ready for agents'"])
        self.assertIn("Board o/2 has no column", state["report"])

    def test_pick_up_pause_window_queues_nothing(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", PAUSE_BETWEEN="00:00-23:59", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), [])
        self.assertIn("paused", text)

    def test_pick_up_skips_tasks_already_in_the_queue(self):
        status = "worker: running\npaused: no\nrunning:\n  pick-r-5 (log idle 10s)\npending:\n  pick-r-8\n"
        mapping = {"o/1": {"items": [self.item(n) for n in (5, 8, 9)], "problem": None}}
        ex = FakeExecutor(status)
        app = main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20, "AGENT_BOARDS": "o/1: Ready for agents",
                        "GITHUB_TOKEN": "gh-token-1", "PICKUP_MODE": "all"}, executor=ex, fetch_board=self.boards(mapping),
                        set_card=lambda t, b, i, c: None)
        ok, _ = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-9"])

    def test_pick_up_one_queues_only_the_top_card(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(8)], "problem": None}, "o/2": {"items": [self.item(3, "o/apps")], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents, o/2: Ready for agents", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(ex.added(), ["pick-r-5"])
        self.assertIn("queued #5", text)

    def test_pick_up_one_waits_while_the_queue_is_busy(self):
        for status in ("worker: running\npaused: no\nrunning:\n  manual-1 (log idle 10s)\npending:\n",
                       "worker: running\npaused: no\nrunning:\npending:\n  manual-2\n"):
            mapping = {"o/1": {"items": [self.item(5)], "problem": None}}
            ex = FakeExecutor(status)
            app = main.App({"AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp(), "ADMIN_TOKEN": "a" * 20, "AGENT_BOARDS": "o/1: Ready for agents",
                            "GITHUB_TOKEN": "gh-token-1"}, executor=ex, fetch_board=self.boards(mapping))
            ok, text = app.run_job("pick-up", "schedule")
            self.assertTrue(ok)
            self.assertEqual(ex.added(), [])
            self.assertIn("queue is not free", text)

    def test_pick_up_one_next_run_takes_the_card_now_on_top(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(8)], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.run_job("pick-up", "schedule")
        mapping["o/1"] = {"items": [self.item(30), self.item(8)], "problem": None}  # #5 left the column, #30 was dragged to the top
        app.run_job("pick-up", "schedule")
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-30"])

    def test_pick_up_all_queues_every_card_and_bad_mode_fails(self):
        mapping = {"o/1": {"items": [self.item(5), self.item(8)], "problem": None}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="all")
        app.run_job("pick-up", "schedule")
        self.assertEqual(ex.added(), ["pick-r-5", "pick-r-8"])
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1", PICKUP_MODE="some")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertIn("PICKUP_MODE", text)

    def test_card_goes_to_running_then_review_after_a_merged_pr(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None, "board": {"options": {"Ready for agents": "a", "Running": "b", "In review": "c"}}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.run_job("pick-up", "schedule")
        self.assertEqual(app.set_to, [(5, "Running")])
        ex.status = "worker: running\npaused: no\nrunning:\n  pick-r-5 (log idle 1s)\npending:\n"
        app.run_job("pick-up", "schedule")
        self.assertEqual(app.set_to, [(5, "Running")])  # still running: nothing moves
        ex.status = IDLE
        app.pulls[5] = "https://github.com/o/r/pull/9"
        ok, _ = app.run_job("pick-up", "schedule")
        self.assertEqual(app.set_to[-1], (5, "In review"))
        self.assertEqual(app.commented, [])
        n = len(app.set_to)
        app.run_job("pick-up", "schedule")
        self.assertEqual(len(app.set_to), n)  # settled once

    def test_card_goes_back_with_one_comment_when_no_pr_merged(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None, "board": {"options": {"Ready for agents": "a", "Running": "b", "In review": "c"}}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.run_job("pick-up", "schedule")
        app.set_error = None
        mapping["o/1"]["items"] = []
        app.run_job("pick-up", "schedule")
        self.assertEqual(app.set_to, [(5, "Running"), (5, "Ready for agents")])
        self.assertEqual(len(app.commented), 1)
        self.assertIn("without a merged pull request", app.commented[0][1])
        self.assertIn("pull/9", app.commented[0][1])
        app.run_job("pick-up", "schedule")
        self.assertEqual(len(app.commented), 1)

    def test_a_failed_move_is_tried_again(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None, "board": {"options": {"Ready for agents": "a", "Running": "b", "In review": "c"}}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        app.run_job("pick-up", "schedule")
        mapping["o/1"]["items"] = []
        app.pulls[5] = "https://github.com/o/r/pull/9"
        app.set_error = "could not move it"
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertIn("o/r#5: could not move it", text)
        app.set_error = None
        ok, _ = app.run_job("pick-up", "schedule")
        self.assertTrue(ok)
        self.assertEqual(app.set_to[-1], (5, "In review"))

    def test_missing_running_or_review_column_fails_the_run_and_queues_nothing(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None, "board": {"options": {"Ready for agents": "a", "Running": "b"}}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1")
        ok, text = app.run_job("pick-up", "schedule")
        self.assertFalse(ok)
        self.assertIn("Board o/1 has no column 'In review'", text)
        self.assertEqual(ex.added(), [])

    def test_column_names_come_from_settings(self):
        mapping = {"o/1": {"items": [self.item(5)], "problem": None, "board": {"options": {"Ready for agents": "a", "Doing": "b", "Review": "c"}}}}
        app, ex = self.make(mapping, AGENT_BOARDS="o/1: Ready for agents", GITHUB_TOKEN="gh-token-1", RUNNING_COLUMN="Doing", REVIEW_COLUMN="Review")
        app.run_job("pick-up", "schedule")
        self.assertEqual(app.set_to, [(5, "Doing")])

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
