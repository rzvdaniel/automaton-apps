import unittest

import board
from board import Config, BoardError

BODY = "Goal\n\n**Done when**\nit works"


def card(number, status="Ready for agents", repo="rzvdaniel/automaton", labels=(), body=BODY, prs=(), comments=()):
    return {"item": f"I{number}", "repo": repo, "short": repo.split("/")[-1], "number": number, "title": f"t{number}", "url": f"u{number}",
            "status": status, "open": True, "body": body, "labels": list(labels), "comments": list(comments), "prs": list(prs)}


class Fake:
    def __init__(self, cards, taken=(), runners=None):
        self.cards, self.taken, self.calls = cards, list(taken), []
        self.blockers = {}
        self.runners = runners or {"runners": [{"labels": [{"name": "agent"}]}]}

    def get(self, path):
        if "labels=agent:go" in path:
            repo = path.split("/repos/")[1].split("/issues")[0]
            return [{"number": n} for r, n in self.taken if r == repo]
        if "/actions/runners" in path:
            return self.runners
        if "/dependencies/blocked_by" in path:
            return self.blockers.get(path.split("/issues/")[1].split("/")[0], [])
        return {}

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))

    def graphql(self, query, variables):
        if "updateProjectV2ItemPosition" in query:
            self.calls.append(("after", variables["i"], variables["a"]))
            return {}
        if "updateProjectV2ItemFieldValue" in query:
            self.calls.append(("move", variables["i"], variables["o"]))
            return {}
        return {"repositoryOwner": {"projectV2": {"id": "P", "field": {"id": "F", "options": [{"id": "o-" + n, "name": n} for n in ("Inbox", "Ready for agents", "Running", "Verify")]},
                "items": {"nodes": [{"id": c["item"], "status": {"name": c["status"]}, "content": {
                    "number": c["number"], "title": c["title"], "state": "OPEN", "body": c["body"], "url": c["url"], "repository": {"nameWithOwner": c["repo"]},
                    "labels": {"nodes": [{"name": n} for n in c["labels"]]}, "comments": {"nodes": c["comments"]},
                    "closedByPullRequestsReferences": {"nodes": c["prs"]}, "timelineItems": {"nodes": []},
                    "labelEvents": {"nodes": c.get("events", [])}}} for c in self.cards]}}}}


def cfg(**kw):
    return Config("tok", parallel=kw.pop("parallel", 1), **kw)


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        c = Config.from_env({"AGENT_GH_TOKEN": "x"})
        self.assertEqual((c.owner, c.number, c.repos, c.parallel), ("rzvdaniel", 17, board.DEFAULT_REPOS.split(), 1))

    def test_rejects_bad_values(self):
        for env in ({}, {"AGENT_GH_TOKEN": "x", "AGENT_BOARD": "nope"}, {"AGENT_GH_TOKEN": "x", "AGENT_PARALLEL": "3"}, {"AGENT_GH_TOKEN": "x", "AGENT_REPOS": "a/b"}):
            with self.assertRaises(BoardError):
                Config.from_env(env)


def blocker(n, reason="completed", state="closed"):
    return {"number": n, "state": state, "state_reason": reason if state == "closed" else None, "repository": {"full_name": "rzvdaniel/automaton"}}


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.cards = [card(7, "Inbox", labels=["queue-when-unblocked"]), card(8)]

    def run_pick(self, blockers):
        gh = Fake(self.cards, runners={"runners": []})
        gh.blockers = {"7": blockers}
        board.pick_up(gh, cfg())
        return gh

    def test_all_blockers_completed_queues_at_bottom(self):
        gh = self.run_pick([blocker(5), blocker(6)])
        self.assertIn(("move", "I7", "o-Ready for agents"), gh.calls)
        self.assertIn(("after", "I7", "I8"), gh.calls)
        self.assertIn(("POST", "/repos/rzvdaniel/automaton/issues/7/comments", {"body": "Unblocked by #5, #6; queued."}), gh.calls)
        self.assertIn(("DELETE", "/repos/rzvdaniel/automaton/issues/7/labels/queue-when-unblocked", None), gh.calls)

    def test_queued_card_does_not_jump_the_ready_queue(self):
        gh = Fake(self.cards)
        gh.blockers = {"7": [blocker(5)]}
        self.assertEqual(board.pick_up(gh, cfg())["picked"], "rzvdaniel/automaton#8")

    def test_open_blocker_or_none_stays(self):
        for blockers in ([blocker(5), blocker(6, state="open")], []):
            gh = self.run_pick(blockers)
            self.assertFalse([c for c in gh.calls if c[0] == "move"])

    def test_open_blocker_with_merged_pr_on_board_queues_with_pr_named(self):
        self.cards.append(card(5, "Running", prs=[{"number": 1804, "state": "MERGED"}]))
        gh = self.run_pick([blocker(5, state="open")])
        self.assertIn(("move", "I7", "o-Ready for agents"), gh.calls)
        self.assertIn(("POST", "/repos/rzvdaniel/automaton/issues/7/comments", {"body": "Unblocked by #5 (merged in PR #1804); queued."}), gh.calls)

    def test_open_blocker_in_verify_queues_and_open_pr_does_not(self):
        self.cards.append(card(5, "Verify"))
        self.assertIn(("move", "I7", "o-Ready for agents"), self.run_pick([blocker(5, state="open")]).calls)
        self.cards[-1].update(status="Inbox", prs=[{"number": 9, "state": "CLOSED"}])
        self.assertFalse([c for c in self.run_pick([blocker(5, state="open")]).calls if c[0] == "move"])

    def test_not_planned_comments_once_and_stays(self):
        gh = self.run_pick([blocker(5, "not_planned")])
        self.assertFalse([c for c in gh.calls if c[0] == "move"])
        posts = [c for c in gh.calls if c[0] == "POST" and c[1].endswith("/issues/7/comments")]
        self.assertEqual(len(posts), 1)
        self.cards[0]["comments"] = [{"body": posts[0][2]["body"]}]
        gh = self.run_pick([blocker(5, "not_planned")])
        self.assertFalse([c for c in gh.calls if c[0] == "POST"])

    def test_unlabelled_or_other_column_ignored(self):
        self.cards = [card(7, "Inbox"), card(9, "Verify", labels=["queue-when-unblocked"])]
        gh = Fake(self.cards, runners={"runners": []})
        gh.blockers = {"7": [blocker(5)], "9": [blocker(5)]}
        board.pick_up(gh, cfg())
        self.assertFalse([c for c in gh.calls if c[0] == "move"])


class PickTests(unittest.TestCase):
    def test_picks_top_ready_card_in_automaton(self):
        gh = Fake([card(1), card(2)])
        out = board.pick_up(gh, cfg())
        self.assertEqual(out["picked"], "rzvdaniel/automaton#1")
        self.assertIn(("POST", "/repos/rzvdaniel/automaton/issues/1/labels", {"labels": ["agent:go"]}), gh.calls)
        self.assertIn(("move", "I1", "o-Running"), gh.calls)
        self.assertFalse([c for c in gh.calls if "dispatches" in c[1]])

    def test_other_repo_is_dispatched_before_it_is_labelled(self):
        gh = Fake([card(5, repo="rzvdaniel/automaton-apps")])
        board.pick_up(gh, cfg())
        self.assertIn("dispatches", gh.calls[0][1])
        self.assertEqual(gh.calls[0][2]["inputs"], {"repo": "rzvdaniel/automaton-apps", "number": "5"})
        self.assertIn("labels", gh.calls[1][1])

    def test_agent_choice_goes_as_dispatch_inputs(self):
        gh = Fake([card(5, repo="rzvdaniel/automaton-apps")])
        board.pick_up(gh, cfg(agent_cli="agy", agent_model="m-1", review_cli="claude"))
        self.assertEqual(gh.calls[0][2]["inputs"], {"repo": "rzvdaniel/automaton-apps", "number": "5",
                                                    "agent_cli": "agy", "agent_model": "m-1", "review_cli": "claude"})

    def test_choice_inputs_the_workflow_does_not_know_fall_back(self):
        class Refuses(Fake):
            def request(self, method, path, body=None):
                super().request(method, path, body)
                if "dispatches" in path and len(body["inputs"]) > 2:
                    raise board.BoardError("GitHub answered HTTP 422 for POST x.")
        gh = Refuses([card(5, repo="rzvdaniel/automaton-apps")])
        board.pick_up(gh, cfg(agent_cli="agy"))
        self.assertEqual(gh.calls[1][2]["inputs"], {"repo": "rzvdaniel/automaton-apps", "number": "5"})

    def test_agent_choice_is_validated(self):
        env = {"AGENT_GH_TOKEN": "t"}
        with self.assertRaises(board.BoardError):
            Config.from_env({**env, "AGENT_CLI": "bash"})
        with self.assertRaises(board.BoardError):
            Config.from_env({**env, "AGENT_MODEL": "a b;rm"})
        self.assertEqual(Config.from_env({**env, "AGENT_CLI": "AGY"}).agent_cli, "agy")

    def test_nothing_while_an_agent_go_issue_is_open(self):
        gh = Fake([card(1)], taken=[("rzvdaniel/automaton", 9)])
        self.assertEqual(board.pick_up(gh, cfg())["picked"], "")
        self.assertEqual(gh.calls, [])

    def test_skips_failed_and_sends_unshaped_to_inbox(self):
        gh = Fake([card(1, labels=["agent:failed"]), card(2, labels=["needs-shape"]), card(3, body="no section"), card(4)])
        self.assertEqual(board.pick_up(gh, cfg())["picked"], "rzvdaniel/automaton#4")
        self.assertIn(("move", "I2", "o-Inbox"), gh.calls)
        self.assertIn(("move", "I3", "o-Inbox"), gh.calls)
        self.assertNotIn(("move", "I1", "o-Running"), gh.calls)

    def test_unshaped_card_that_cannot_move_is_not_commented(self):
        class Stuck(Fake):
            def graphql(self, query, variables):
                if "updateProjectV2ItemFieldValue" in query and variables["i"] == "I2":
                    raise BoardError("move refused")
                return super().graphql(query, variables)
        gh = Stuck([card(2, labels=["needs-shape"]), card(4)])
        self.assertEqual(board.pick_up(gh, cfg())["picked"], "rzvdaniel/automaton#4")
        self.assertFalse([c for c in gh.calls if c[0] == "POST" and "/issues/2/comments" in c[1]])

    def test_unshaped_card_already_told_is_moved_without_a_new_comment(self):
        told = {"author": {"login": "bot"}, "body": board.NOT_SHAPED_COMMENT, "createdAt": "2026-11-26T10:00:00Z", "url": "u"}
        gh = Fake([card(2, labels=["needs-shape"], comments=[told])])
        board.pick_up(gh, cfg())
        self.assertIn(("move", "I2", "o-Inbox"), gh.calls)
        self.assertFalse([c for c in gh.calls if c[0] == "POST" and "/issues/2/comments" in c[1]])

    def test_skips_while_the_runner_is_not_set_up(self):
        gh = Fake([card(1)], runners={"runners": []})
        out = board.pick_up(gh, cfg(runner_repo="rzvdaniel/automaton"))
        self.assertEqual(out["picked"], "")
        self.assertEqual([c for c in gh.calls if c[0] != "move"], [])

    def test_unreadable_runner_list_does_not_block(self):
        gh = Fake([card(1)])
        gh.runners = {"runners": [{"labels": [{"name": "agent"}]}]}
        self.assertEqual(board.pick_up(gh, cfg(runner_repo="rzvdaniel/automaton"))["picked"], "rzvdaniel/automaton#1")

    def test_running_card_with_a_pull_request_moves_to_in_review_in_any_repo(self):
        pr = {"number": 469, "url": "p", "state": "OPEN"}
        gh = Fake([card(467, status="Running", repo="rzvdaniel/automaton-apps", prs=[pr]), card(7, status="Running", repo="rzvdaniel/automaton-monster")])
        out = board.pick_up(gh, cfg())
        self.assertIn(("move", "I467", "o-Verify"), gh.calls)
        self.assertNotIn(("move", "I7", "o-Verify"), gh.calls)
        self.assertEqual(out["moved"], ["rzvdaniel/automaton-apps#467 to Verify"])

    def test_running_card_ignores_a_pull_request_older_than_its_run(self):
        go = [{"createdAt": "2026-11-27T20:43:00Z", "label": {"name": "agent:go"}}]
        old = {"number": 1830, "state": "MERGED", "createdAt": "2026-11-20T10:00:00Z"}
        gh = Fake([dict(card(1829, status="Running", prs=[old]), events=go)])
        board.pick_up(gh, cfg())
        self.assertFalse([c for c in gh.calls if c[0] == "move"])

    def test_running_card_moves_for_a_pull_request_opened_after_its_start(self):
        go = [{"createdAt": "2026-11-27T20:43:00Z", "label": {"name": "agent:go"}}]
        old = {"number": 1830, "state": "MERGED", "createdAt": "2026-11-20T10:00:00Z"}
        new = {"number": 1900, "state": "OPEN", "createdAt": "2026-11-27T21:10:00Z"}
        gh = Fake([dict(card(1829, status="Running", prs=[old, new]), events=go)])
        board.pick_up(gh, cfg())
        self.assertIn(("move", "I1829", "o-Verify"), gh.calls)

    def test_second_run_only_in_another_area(self):
        running = card(9, status="Running", labels=["area:studio"])
        gh = Fake([running, card(1, labels=["area:studio"]), card(2, labels=["area:runner"])], taken=[("rzvdaniel/automaton", 9)])
        self.assertEqual(board.pick_up(gh, cfg(parallel=2))["picked"], "rzvdaniel/automaton#2")
        gh = Fake([running, card(1)], taken=[("rzvdaniel/automaton", 9)])
        self.assertEqual(board.pick_up(gh, cfg(parallel=2))["picked"], "")  # unknown area never runs beside another


class RetryTests(unittest.TestCase):
    def test_run_again_removes_the_label_and_starts(self):
        gh = Fake([card(1, labels=["agent:failed"])])
        self.assertEqual(board.retry(gh, cfg(), "rzvdaniel/automaton", 1), "Started.")
        self.assertEqual(gh.calls[0][:2], ("DELETE", "/repos/rzvdaniel/automaton/issues/1/labels/agent:failed"))
        self.assertIn(("move", "I1", "o-Running"), gh.calls)

    def test_run_again_waits_when_a_run_is_going(self):
        gh = Fake([card(1, labels=["agent:failed"], status="Running")], taken=[("rzvdaniel/automaton", 9)])
        self.assertIn("Another run", board.retry(gh, cfg(), "rzvdaniel/automaton", 1))
        self.assertIn(("move", "I1", "o-Ready for agents"), gh.calls)

    def test_run_again_refuses_a_card_that_did_not_fail(self):
        with self.assertRaises(BoardError):
            board.retry(Fake([card(1)]), cfg(), "rzvdaniel/automaton", 1)


class SnapshotTests(unittest.TestCase):
    def test_lists_running_failed_and_next_up(self):
        failure = {"author": {"login": "bot"}, "body": "Agent run ended without a pull request", "createdAt": "2026-11-26T13:44:00Z", "url": "c"}
        gh = Fake([card(1, status="Running"), card(2, labels=["agent:failed"], comments=[failure]), card(3), card(4)], taken=[("rzvdaniel/automaton", 1)])
        snap = board.snapshot(gh, cfg())
        self.assertEqual([c["number"] for c in snap["running"]], [1])
        self.assertEqual([c["number"] for c in snap["failed"]], [2])
        self.assertEqual(snap["failed"][0]["readUrl"], "c")
        self.assertEqual([c["number"] for c in snap["ready"]], [3, 4])


class AgentRunTests(unittest.TestCase):
    def test_parses_the_record_line(self):
        run = board.parse_agent_run("Agent run: tool agy, model gemini-4-hydrogen-high, 19 min, fallback: no, exit 0.")
        self.assertEqual(run, {"tool": "agy", "model": "gemini-4-hydrogen-high", "minutes": 19.0, "fallback": False, "exit": 0})
        run = board.parse_agent_run("text before\nAgent run: tool claude, model sonnet, 41.5 min, fallback: yes, exit 1.\n")
        self.assertEqual((run["tool"], run["fallback"], run["exit"], run["minutes"]), ("claude", True, 1, 41.5))

    def test_ignores_other_comments(self):
        for text in ("Agent run ended without a pull request", "Agent run: it went well", "", None, "Agent run: tool claude, 3 min, fallback: maybe, exit 0."):
            self.assertIsNone(board.parse_agent_run(text))
        self.assertEqual(board.parse_agent_run("Agent run: tool claude, 3 min, fallback: no, exit 0.")["model"], "")

    def records(self):
        def comment(text, at):
            return {"author": {"login": "bot"}, "body": text, "createdAt": at, "url": "c"}
        pr = {"number": 7, "url": "https://github.com/o/r/pull/7", "state": "MERGED", "createdAt": "2026-11-28T10:30:00Z"}
        return [
            card(1, comments=[comment("Agent run: tool agy, model m, 20 min, fallback: no, exit 0.", "2026-11-28T11:00:00Z")], prs=[pr]),
            card(2, comments=[comment("Agent run: tool claude, model sonnet, 40 min, fallback: yes, exit 0.", "2026-11-28T09:00:00Z")], prs=[pr]),
            card(3, comments=[comment("Agent run: tool claude, model sonnet, 10 min, fallback: no, exit 1.", "2026-11-26T09:00:00Z")]),
        ]

    def test_records_summary_and_usage(self):
        records = board.agent_records(self.records())
        self.assertEqual([r["number"] for r in records], [1, 2, 3])
        self.assertEqual([r["result"] for r in records], ["success", "success", "failed"])
        summary = board.tool_summary(records)
        self.assertEqual(summary["claude"], {"runs": 2, "median": 25.0, "prs": 1, "fallbacks": 1})
        self.assertEqual(summary["agy"]["prs"], 1)
        now = board._ts("2026-11-28T12:00:00Z")  # a Saturday
        usage = board.tool_usage(records, now)
        self.assertEqual(usage["agy"]["today"], {"runs": 1, "busyMinutes": 20.0, "prs": 1})
        self.assertEqual(usage["agy"]["hours5"]["runs"], 1)
        self.assertEqual(usage["claude"]["today"]["runs"], 1)
        self.assertEqual(usage["claude"]["hours5"]["busyMinutes"], 40.0)
        self.assertEqual(usage["claude"]["week"]["runs"], 2)  # the 26th is after Monday the 23rd
        self.assertEqual(usage["claude"]["week"]["busyMinutes"], 50.0)

    def test_snapshot_carries_the_records(self):
        snap = board.snapshot(Fake(self.records()), cfg(), board._ts("2026-11-28T12:00:00Z"))
        self.assertEqual(len(snap["records"]), 3)
        self.assertEqual(snap["tools"]["agy"]["runs"], 1)
        self.assertEqual(snap["agent"]["tool"], "claude")


class ScopeTests(unittest.TestCase):
    def gh(self, header):
        class G(board.GitHub):
            def get(self, path):
                self.last_headers = {} if header is None else {"X-OAuth-Scopes": header}
                return {}
        return G("t")

    def test_missing_project(self):
        problem = board.scope_problem(board.token_scopes(self.gh("repo, workflow")))
        self.assertIn("no project scope", problem)

    def test_complete_and_unknown(self):
        self.assertIsNone(board.scope_problem(board.token_scopes(self.gh("project, repo, workflow"))))
        self.assertIsNone(board.scope_problem(board.token_scopes(self.gh(None))))  # fine-grained token: no header


class VerifyTests(unittest.TestCase):
    def _gh(self, cards=None, running=None, v_runs=None):
        cards = cards or []
        running = running or []
        v_runs = v_runs or []
        calls = []

        class Fake:
            def graphql(self, q, v):
                return {"repositoryOwner": {"projectV2": {
                    "id": "P", "field": {"id": "F", "options": [{"id": "O1", "name": "Verify"}]},
                    "items": {"nodes": cards},
                }}}

            def get(self, path):
                if "labels=agent:go" in path:
                    return running if "rzvdaniel/automaton/" in path else []
                if "verify-release.yml/runs" in path:
                    return {"workflow_runs": v_runs}
                if "agent-issue.yml/runs" in path:
                    return {"workflow_runs": []}
                return []

            def request(self, method, path, body=None):
                calls.append((method, path, body))
                return {}

        return Fake(), calls

    def test_verify_enabled_setting(self):
        c = board.Config.from_env({"AGENT_GH_TOKEN": "t", "VERIFY_ENABLED": "false"})
        self.assertFalse(c.verify_enabled)
        with self.assertRaises(board.BoardError):
            board.Config.from_env({"AGENT_GH_TOKEN": "t", "VERIFY_ENABLED": "maybe"})

    def test_verify_off_starts_nothing(self):
        gh, calls = self._gh()
        c = board.Config.from_env({"AGENT_GH_TOKEN": "t", "VERIFY_ENABLED": "off"})
        res = board.verify(gh, c, get_version=lambda: "1.2.3")
        self.assertFalse(res["started"])
        self.assertIn("off", res["message"].lower())
        self.assertEqual(calls, [])

    def test_verify_waits_for_running_issue(self):
        gh, calls = self._gh(running=[{"number": 10}])
        res = board.verify(gh, cfg(), get_version=lambda: "1.2.3")
        self.assertFalse(res["started"])
        self.assertIn("waiting", res["message"].lower())
        self.assertEqual(calls, [])

    def test_verify_dispatches_for_new_version_with_review_tool_and_model(self):
        card = {"id": "I1", "status": {"name": "Verify"}, "content": {
            "number": 5, "title": "T", "state": "OPEN", "body": "Done when ok", "url": "u",
            "repository": {"nameWithOwner": "rzvdaniel/automaton"},
            "labels": {"nodes": []}, "comments": {"nodes": []},
            "closedByPullRequestsReferences": {"nodes": []}, "timelineItems": {"nodes": []}, "labelEvents": {"nodes": []},
        }}
        gh, calls = self._gh(cards=[card], v_runs=[{"status": "completed", "conclusion": "success", "display_title": "1.2.2"}])
        c = board.Config.from_env({"AGENT_GH_TOKEN": "t", "AGENT_REVIEW_CLI": "agy", "AGENT_REVIEW_MODEL": "sonnet"})
        res = board.verify(gh, c, get_version=lambda: "1.2.3")
        self.assertTrue(res["started"])
        self.assertEqual(res["version"], "1.2.3")
        self.assertEqual(calls[0][1], "/repos/rzvdaniel/automaton/actions/workflows/verify-release.yml/dispatches")
        self.assertEqual(calls[0][2]["inputs"], {"version": "1.2.3", "agent_cli": "agy", "agent_model": "sonnet"})

    def test_verify_skips_already_verified_unless_forced(self):
        card = {"id": "I1", "status": {"name": "Verify"}, "content": {
            "number": 5, "title": "T", "state": "OPEN", "body": "Done when ok", "url": "u",
            "repository": {"nameWithOwner": "rzvdaniel/automaton"},
            "labels": {"nodes": []}, "comments": {"nodes": []},
            "closedByPullRequestsReferences": {"nodes": []}, "timelineItems": {"nodes": []}, "labelEvents": {"nodes": []},
        }}
        gh, calls = self._gh(cards=[card], v_runs=[{"status": "completed", "conclusion": "success", "display_title": "1.2.3"}])
        res = board.verify(gh, cfg(), get_version=lambda: "1.2.3")
        self.assertFalse(res["started"])
        self.assertEqual(calls, [])
        res_forced = board.verify(gh, cfg(), force=True, get_version=lambda: "1.2.3")
        self.assertTrue(res_forced["started"])
        self.assertEqual(len(calls), 1)

    def test_pickup_waits_while_verify_runs(self):
        gh, calls = self._gh(v_runs=[{"status": "in_progress", "display_title": "1.2.3"}])
        res = board.pick_up(gh, cfg(), runner_ok=lambda g, c: True)
        self.assertEqual(res["picked"], "")
        self.assertIn("waiting", res["message"].lower())
        self.assertEqual(calls, [])

    def test_snapshot_includes_verify_state(self):
        gh, _ = self._gh(v_runs=[{"status": "completed", "conclusion": "success", "display_title": "1.2.3",
                                   "html_url": "https://gh/run/1", "run_started_at": "2026-11-28T10:00:00Z", "updated_at": "2026-11-28T10:05:00Z"}])
        snap = board.snapshot(gh, cfg(), board._ts("2026-11-28T12:00:00Z"))
        self.assertTrue(snap["verify"]["enabled"])
        self.assertEqual(snap["verify"]["run"]["status"], "done")
        self.assertEqual(snap["verify"]["run"]["release"], "1.2.3")


if __name__ == "__main__":
    unittest.main()
