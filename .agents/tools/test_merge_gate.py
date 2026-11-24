import importlib.util, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("gate", Path(__file__).with_name("merge-gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

OWNERS = (Path(__file__).resolve().parents[2] / ".github/CODEOWNERS").read_text()
HIGH, SEC = gate.owner_patterns(OWNERS), gate.security_patterns(OWNERS)
BODY = "How verified: x\nRisk: low\nHow to revert: revert\nDocs: none"
HEAD = "abc"


def review(login, body, commit=HEAD, state="COMMENTED"):
    return {"author": {"login": login}, "authorAssociation": "OWNER", "state": state, "body": body,
            "submittedAt": "2026-01-01T00:00:0%dZ" % len(login), "commit": {"oid": commit}}


def pr(paths, reviews=(), body=BODY, files=None):
    return {"headRefOid": HEAD, "paths": paths, "reviews": list(reviews), "body": body, "statusCheckRollup": [],
            "files": files if files is not None else [{"path": p, "status": "modified", "deletions": 0} for p in paths]}


def rows(result):
    return {name: res for res, name, _ in result[1]}


class Tiers(unittest.TestCase):
    def test_docs_only_is_low(self):
        self.assertEqual(gate.path_tier(["README.md"], HIGH), "low" if gate.is_low("README.md") else "medium")

    def test_workflows_and_tools_are_high(self):
        for path in (".github/workflows/x.yml", "tools/generate_catalog.py", ".github/CODEOWNERS"):
            self.assertEqual(gate.path_tier([path], HIGH), "high", path)

    def test_app_code_is_medium(self):
        self.assertEqual(gate.path_tier(["maintenance/heartbeat/main.py"], HIGH), "medium")

    def test_credential_apps_need_security_pass(self):
        self.assertTrue(any(gate.matches("maintenance/offsite-backup/a.py", p) for p in SEC))


class Gate(unittest.TestCase):
    def test_no_review_fails(self):
        self.assertEqual(rows(gate.check(pr(["maintenance/heartbeat/main.py"]), HIGH, SEC, True))["review"], "FAIL")

    def test_main_review_passes_medium(self):
        r = review("a", "Tier: medium - app code")
        out = rows(gate.check(pr(["maintenance/heartbeat/main.py"], [r]), HIGH, SEC, True))
        self.assertEqual(out["review"], "PASS")
        self.assertNotIn("security", out)

    def test_workflow_needs_second_login(self):
        paths = [".github/workflows/x.yml"]
        main = review("alice", "Tier: high - workflow")
        same = review("alice", "Security: ok")
        other = review("bob", "Security: ok")
        self.assertEqual(rows(gate.check(pr(paths, [main]), HIGH, SEC, True))["security"], "FAIL")
        self.assertEqual(rows(gate.check(pr(paths, [main, same]), HIGH, SEC, True))["security"], "FAIL")
        self.assertEqual(rows(gate.check(pr(paths, [main, other]), HIGH, SEC, True))["security"], "PASS")

    def test_stale_review_fails(self):
        r = review("a", "Tier: medium - x", commit="old")
        self.assertEqual(rows(gate.check(pr(["maintenance/heartbeat/main.py"], [r]), HIGH, SEC, True))["review"], "FAIL")

    def test_closes_fails(self):
        self.assertEqual(rows(gate.check(pr(["README.md"], body=BODY + "\nCloses #4"), HIGH, SEC, True))["description"], "FAIL")

    def test_removing_an_app_is_high(self):
        files = [{"path": "maintenance/x/automaton.json", "status": "removed", "deletions": 5}]
        self.assertEqual(gate.check(pr(["maintenance/x/automaton.json"], files=files), HIGH, SEC, True)[0], "high")


if __name__ == "__main__":
    unittest.main()
