import unittest
import main

PR = {"number": 5, "head": {"sha": "a" * 40}, "base": {"ref": "main"}, "user": {"login": "o"},
      "merged_at": "x", "merge_commit_sha": "b" * 40}


class Fake:
    def __init__(self, routes):
        self.routes, self.posts = routes, []

    def get(self, path):
        return self.routes.get(path)

    def post(self, path, body, method="POST"):
        self.posts.append((method, path, body))


class FlowTests(unittest.TestCase):
    def test_review_must_cover_final_commit(self):
        gh = Fake({"/repos/r/pulls/5/reviews?per_page=100": [{"state": "COMMENTED", "commit_id": "c" * 40, "user": {"login": "x"}}]})
        self.assertEqual(main.check_review(gh, "r", PR)["status"], "fail")
        gh.routes["/repos/r/pulls/5/reviews?per_page=100"][0]["commit_id"] = "a" * 40
        self.assertEqual(main.check_review(gh, "r", PR)["status"], "pass")

    def test_no_review_fails(self):
        self.assertEqual(main.check_review(Fake({}), "r", PR)["status"], "fail")

    def test_tests_in_diff(self):
        path = "/repos/r/pulls/5/files?per_page=100"
        self.assertEqual(main.check_tests(Fake({path: [{"filename": "src/a.cs"}]}), "r", PR)["status"], "fail")
        self.assertEqual(main.check_tests(Fake({path: [{"filename": "src/UnitTests/FooTests.cs"}]}), "r", PR)["status"], "pass")

    def test_ci(self):
        path = "/repos/r/commits/" + "b" * 40 + "/check-runs?per_page=100"
        ok = Fake({path: {"check_runs": [{"name": "x", "conclusion": "success"}]}})
        bad = Fake({path: {"check_runs": [{"name": "x", "conclusion": "failure"}]}})
        self.assertEqual(main.check_ci(ok, "r", PR)["status"], "pass")
        self.assertEqual(main.check_ci(bad, "r", PR)["status"], "fail")
        self.assertEqual(main.check_ci(Fake({}), "r", PR)["status"], "fail")

    def test_proof_levels(self):
        def proof(body):
            return main.check_proof(Fake({"/repos/r/issues/1/artifacts": [{"name": "proof", "body": body}]}), "r", 1, "t")["status"]
        self.assertEqual(proof("<p>Release 0.2.20, verified end to end on the test server</p>"), "pass")
        self.assertEqual(proof("<p>0.2.20 unit tests only</p>"), "warn")
        self.assertEqual(proof("<p>no version</p>"), "fail")
        self.assertEqual(main.check_proof(Fake({"/repos/r/issues/1/artifacts": []}), "r", 1, "t")["status"], "fail")
        self.assertEqual(main.check_proof(Fake({}), "r", 1, "")["status"], "unknown")

    def test_production(self):
        gh = Fake({"/repos/r/git/ref/tags/server-v1.0.0": {"ref": "x"}, "/repos/r/compare/" + "b" * 40 + "...server-v1.0.0": {"status": "ahead"}})
        self.assertEqual(main.check_production(gh, "r", PR, "1.0.0")["status"], "pass")
        self.assertEqual(main.check_production(gh, "r", PR, None)["status"], "fail")
        gh.routes["/repos/r/compare/" + "b" * 40 + "...server-v1.0.0"] = {"status": "behind"}
        self.assertEqual(main.check_production(gh, "r", PR, "1.0.0")["status"], "fail")

    def test_read_only_without_token_posts_nothing(self):
        gh = Fake({"/repos/r/issues/1": {"state": "closed", "title": "t", "labels": []}})
        out = main.run(1, {"REPO": "r"}, gh, "1.0.0")
        self.assertEqual(out["mode"], "read-only")
        self.assertEqual(gh.posts, [])

    def test_report_comments_and_labels_once(self):
        gh = Fake({})
        o = {"issue": 1, "gaps": ["ci"], "labels": [], "checks": [{"check": "ci", "status": "fail", "detail": "d"}]}
        self.assertEqual(main.report(gh, "r", o), "commented")
        self.assertEqual([p[1] for p in gh.posts], ["/repos/r/issues/1/comments", "/repos/r/issues/1/labels"])


if __name__ == "__main__":
    unittest.main()
