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
        self.runners = runners or {"runners": [{"labels": [{"name": "agent"}]}]}

    def get(self, path):
        if "labels=agent:go" in path:
            repo = path.split("/repos/")[1].split("/issues")[0]
            return [{"number": n} for r, n in self.taken if r == repo]
        if "/actions/runners" in path:
            return self.runners
        return {}

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))

    def graphql(self, query, variables):
        if "updateProjectV2ItemFieldValue" in query:
            self.calls.append(("move", variables["i"], variables["o"]))
            return {}
        return {"repositoryOwner": {"projectV2": {"id": "P", "field": {"id": "F", "options": [{"id": "o-" + n, "name": n} for n in ("Inbox", "Ready for agents", "Running", "Verify")]},
                "items": {"nodes": [{"id": c["item"], "status": {"name": c["status"]}, "content": {
                    "number": c["number"], "title": c["title"], "state": "OPEN", "body": c["body"], "url": c["url"], "repository": {"nameWithOwner": c["repo"]},
                    "labels": {"nodes": [{"name": n} for n in c["labels"]]}, "comments": {"nodes": c["comments"]},
                    "closedByPullRequestsReferences": {"nodes": c["prs"]}, "timelineItems": {"nodes": []}}} for c in self.cards]}}}}


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


if __name__ == "__main__":
    unittest.main()
