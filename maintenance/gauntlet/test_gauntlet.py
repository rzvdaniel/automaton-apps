import json
import os
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import failures
import gauntlet
import main

HERE = Path(__file__).parent
TARGETS = json.dumps([{"name": "box", "host": "root@203.0.113.7", "domain": "box.example.com", "disposable": True},
                      {"name": "runner-02", "host": "root@203.0.113.9", "domain": "r2.example.com", "disposable": True},
                      {"name": "prod", "host": "root@203.0.113.8", "domain": "prod.example.com"}])
BROKEN = {"name": "broken", "target": "box", "schedule": "manual", "repo": "automaton",
          "steps": [{"name": "status is 200", "command": "curl x", "exit": 0, "contains": "HTTP 200"}]}


class FakeExecutor:
    def __init__(self, code=0, output="ok"):
        self.code, self.output, self.calls = code, output, []

    def run(self, target, command, timeout, stdin=None):
        self.calls.append((target["name"], command, stdin))
        return self.code, self.output


class FakeGitHub:
    def __init__(self, is_open=True):
        self.issues, self.comments, self.open, self.boarded = [], [], is_open, []

    def create_issue(self, repo, title, body):
        self.issues.append((repo, title, body))
        n = len(self.issues)
        return {"number": n, "html_url": f"https://github.com/{repo}/issues/{n}", "node_id": "N" + str(n)}

    def comment(self, repo, number, body):
        self.comments.append((repo, number, body))

    def record_docs_walk(self, version, result, note=""):
        self.walks = getattr(self, "walks", []) + [(version, result, note)]

    def is_open(self, repo, number):
        return self.open

    def add_to_board(self, owner, number, node):
        self.boarded.append((owner, number, node))


def step(name="s", **extra):
    return {"name": name, "command": "true", "timeout": 5, "exit": 0, "contains": None, "not_contains": None,
            "as": "root", "continue": False, "script": None, "repo": None, **extra}


def plan(**extra):
    return {"name": "p", "title": "P", "target": "box", "schedule": None, "wipes": False, "repo": None, "steps": [step()], **extra}


class ConfigTests(unittest.TestCase):
    def test_targets_are_read_and_disposable_is_opt_in(self):
        targets = gauntlet.parse_targets(TARGETS)
        self.assertTrue(targets["box"]["disposable"])
        self.assertFalse(targets["prod"]["disposable"])
        self.assertEqual(targets["box"]["email"], "admin@box.example.com")

    def test_bad_targets_are_refused(self):
        for raw in ("nope", "{}", '[{"name":"A b","host":"root@h"}]', '[{"name":"a","host":"x y"}]', '[{"name":"a","host":"h:2222"}]',
                    '[{"name":"a","host":"h","domain":"a b"}]', '[{"name":"a","host":"h"},{"name":"a","host":"h"}]',
                    '[{"name":"a","host":"h","install_flags":"; rm -rf /"}]'):
            with self.assertRaises(gauntlet.InvalidConfig, msg=raw):
                gauntlet.parse_targets(raw)

    def test_plan_validation(self):
        for bad in ({}, {"name": "x"}, {"name": "x", "steps": [{"name": "a"}]},
                    {"name": "x", "steps": [{"name": "a", "command": "b", "timeout": 0}]},
                    {"name": "x", "steps": [{"name": "a", "command": "b", "as": "bob"}]},
                    {"name": "x", "steps": [{"name": "a", "script": "../x.sh"}]}):
            with self.assertRaises(gauntlet.InvalidConfig):
                gauntlet.validate_plan(bad, "t")

    def test_shipped_plans_load_and_their_scripts_exist(self):
        plans = gauntlet.load_plans(HERE / "plans")
        self.assertEqual(set(plans), {"smoke", "full-cycle", "upgrade", "docs-walk", "restore-drill"})
        for one in plans.values():
            for s in one["steps"]:
                if s["script"]:
                    self.assertTrue((HERE / "plans" / "scripts" / s["script"]).is_file(), s["script"])
        self.assertEqual(plans["smoke"]["target"], "runner-02")
        self.assertTrue(plans["full-cycle"]["wipes"] and plans["full-cycle"]["target"] == "nu8")
        self.assertTrue(any(s["as"] == "automaton" for s in plans["full-cycle"]["steps"]))

    def test_the_data_folder_can_replace_a_plan(self):
        with tempfile.TemporaryDirectory() as data:
            (Path(data) / "smoke.json").write_text(json.dumps({**BROKEN, "name": "smoke"}))
            self.assertEqual(len(gauntlet.load_plans(HERE / "plans", data)["smoke"]["steps"]), 1)


class RunTests(unittest.TestCase):
    def run_plan(self, p, executor, target=None, secrets=()):
        return gauntlet.execute(p, target or gauntlet.parse_targets(TARGETS)["box"], executor, list(secrets), scripts=HERE / "plans" / "scripts")

    def test_a_wiping_plan_never_runs_on_a_machine_that_is_not_disposable(self):
        executor = FakeExecutor()
        result = self.run_plan(plan(wipes=True, target="prod"), executor, gauntlet.parse_targets(TARGETS)["prod"])
        self.assertEqual(result["status"], "refused")
        self.assertEqual(executor.calls, [], "nothing may reach the machine")
        self.assertEqual(self.run_plan(plan(), FakeExecutor(), None.__class__ and gauntlet.parse_targets(TARGETS)["prod"])["status"], "passed")

    def test_a_missing_target_is_refused(self):
        result = gauntlet.execute(plan(target="gone"), None, FakeExecutor(), [])
        self.assertEqual(result["status"], "refused")

    def test_a_failed_step_stops_the_plan_unless_it_continues(self):
        p = plan(steps=[step("a", exit=1), step("b")])
        result = self.run_plan(p, FakeExecutor(code=0))
        self.assertEqual([s["status"] for s in result["steps"]], ["failed"])
        p["steps"][0]["continue"] = True
        self.assertEqual(len(self.run_plan(p, FakeExecutor(code=0))["steps"]), 2)

    def test_a_wrong_expected_status_or_text_fails_the_step(self):
        self.assertIn("expected 7", gauntlet.judge(step(exit=7), 0, ""))
        self.assertIn("does not contain", gauntlet.judge(step(contains="HTTP 200"), 0, "HTTP 500"))
        self.assertIn("contains", gauntlet.judge(step(not_contains="error"), 0, "an error"))
        self.assertIn("timed out", gauntlet.judge(step(), None, ""))
        self.assertIsNone(gauntlet.judge(step(contains="ok"), 0, "all ok"))

    def test_secrets_never_reach_the_stored_output(self):
        out = "key SECRETKEY1 ghp_" + "a" * 30 + "\nAuthorization: Bearer abcdefghijklmnopqrst\npassword=hunter22222\n-----BEGIN OPENSSH PRIVATE KEY-----\nxx\n-----END OPENSSH PRIVATE KEY-----"
        result = self.run_plan(plan(), FakeExecutor(output=out), secrets=["SECRETKEY1"])
        text = result["steps"][0]["output"]
        for leaked in ("SECRETKEY1", "ghp_aaaa", "abcdefghijklmnopqrst", "hunter22222", "OPENSSH PRIVATE"):
            self.assertNotIn(leaked, text)

    def test_long_output_is_cut_in_the_middle(self):
        self.assertLess(len(gauntlet.clip("x" * 100000)), gauntlet.MAX_OUTPUT + 50)

    def test_the_automaton_user_runs_steps_and_facts_reach_the_command_as_variables(self):
        executor = FakeExecutor()
        self.run_plan(plan(steps=[step(command="echo $DOMAIN", **{"as": "automaton"})]), executor)
        command = executor.calls[0][1]
        self.assertTrue(command.startswith("runuser -u automaton -- bash -lc"))
        self.assertIn("DOMAIN=", command)
        self.assertIn("box.example.com", command)

    def test_a_script_is_sent_on_standard_input(self):
        executor = FakeExecutor()
        self.run_plan(plan(steps=[step(command="bash -s", script="wipe.sh")]), executor)
        self.assertEqual(executor.calls[0][1], "bash -s")
        self.assertIn("uninstall-automaton.sh", executor.calls[0][2])
        self.assertTrue(executor.calls[0][2].startswith("export DOMAIN="))

    def test_signature_follows_the_first_failed_step(self):
        a = self.run_plan(plan(steps=[step("a", exit=1)]), FakeExecutor())
        b = self.run_plan(plan(steps=[step("a", exit=1)]), FakeExecutor())
        c = self.run_plan(plan(steps=[step("c", exit=1)]), FakeExecutor())
        self.assertEqual(gauntlet.signature(a), gauntlet.signature(b))
        self.assertNotEqual(gauntlet.signature(a), gauntlet.signature(c))
        self.assertIsNone(gauntlet.signature(self.run_plan(plan(), FakeExecutor())))


class StoreTests(unittest.TestCase):
    def test_runs_are_stored_with_steps_and_orphans_are_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            store = gauntlet.Store(os.path.join(folder, "g.db"))
            run_id = store.begin("p", "box", "manual")
            result = gauntlet.execute(plan(steps=[step("a"), step("b", exit=3)]), gauntlet.parse_targets(TARGETS)["box"], FakeExecutor(), [])
            store.save(run_id, result)
            run = store.run(run_id)
            self.assertEqual((run["status"], [s["status"] for s in run["steps"]]), ("failed", ["passed", "failed"]))
            second = store.begin("p", "box", "schedule")
            store.finish_orphans()
            self.assertEqual(store.run(second)["status"], "failed")
            self.assertIsNone(store.run(999))


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = gauntlet.Store(os.path.join(self.folder.name, "g.db"))
        self.github, self.mails = FakeGitHub(), []
        self.repos = ["rzvdaniel/automaton", "rzvdaniel/automaton-apps"]
        self.reporter = failures.Reporter(self.store, self.github, self.repos, {"rzvdaniel/automaton": {"owner": "rzvdaniel", "number": 1}},
                                          None, lambda subject, text: self.mails.append((subject, text)))
        self.plan = gauntlet.validate_plan(BROKEN, "t")

    def tearDown(self):
        self.folder.cleanup()

    def fail(self):
        result = gauntlet.execute(self.plan, gauntlet.parse_targets(TARGETS)["box"], FakeExecutor(output="HTTP 500"), [])
        run_id = self.store.begin("broken", "box", "manual")
        self.store.save(run_id, result)
        self.reporter.failed(self.plan, result, run_id)
        return run_id

    def test_a_broken_step_gives_one_email_and_one_issue_in_the_right_repo_on_the_board(self):
        self.fail()
        self.assertEqual(len(self.mails), 1)
        self.assertEqual([i[0] for i in self.github.issues], ["rzvdaniel/automaton"])
        self.assertIn("HTTP 500", self.github.issues[0][2])
        self.assertEqual(self.github.boarded, [("rzvdaniel", 1, "N1")])
        self.assertIn("issues/1", self.mails[0][1])

    def test_a_second_failure_comments_on_that_issue_instead_of_opening_a_new_one(self):
        self.fail()
        self.fail()
        self.assertEqual((len(self.github.issues), len(self.github.comments)), (1, 1))
        self.assertIn("Failed again", self.github.comments[0][2])

    def test_a_later_pass_says_passing_again_once_and_never_closes(self):
        self.fail()
        ok = {"plan": "broken", "target": "box", "status": "passed", "steps": []}
        self.reporter.passed(self.plan, ok, 5)
        self.reporter.passed(self.plan, ok, 6)
        self.assertEqual(len(self.github.comments), 1)
        self.assertIn("Passing again", self.github.comments[0][2])
        self.assertFalse(hasattr(self.github, "close"))
        self.fail()  # failing again re-arms the note
        self.reporter.passed(self.plan, ok, 8)
        self.assertEqual(len(self.github.comments), 3)

    def test_a_closed_issue_is_not_reused(self):
        self.fail()
        self.github.open = False
        self.fail()
        self.assertEqual(len(self.github.issues), 2)

    def test_without_github_the_email_still_goes(self):
        self.reporter.github = None
        self.fail()
        self.assertEqual(len(self.mails), 1)

    def test_a_github_error_does_not_lose_the_email(self):
        class Broken(FakeGitHub):
            def create_issue(self, *a):
                raise HTTPError("u", 500, "x", {}, None)
        self.reporter.github = Broken()
        self.fail()
        self.assertEqual(len(self.mails), 1)

    def test_claude_picks_the_repo_only_from_the_allowed_list(self):
        good = failures.parse_diagnosis('noise {"repo":"rzvdaniel/automaton-apps","title":"T","body":"B"} more', self.repos)
        self.assertEqual(failures.choose_repo(self.plan, {"steps": []}, self.repos, good["repo"]), "rzvdaniel/automaton-apps")
        evil = failures.parse_diagnosis('{"repo":"someone/else","title":"T","body":"B"}', self.repos)
        self.assertIsNone(evil["repo"])
        self.assertEqual(failures.choose_repo(self.plan, {"steps": []}, self.repos, evil["repo"]), "rzvdaniel/automaton")
        self.assertIsNone(failures.parse_diagnosis("no json", self.repos))

    def test_the_diagnosis_becomes_the_issue_text(self):
        self.reporter.diagnose = lambda prompt: {"repo": "rzvdaniel/automaton-apps", "title": "Found it", "body": "Because X."}
        self.fail()
        self.assertEqual(self.github.issues[0][0:2], ("rzvdaniel/automaton-apps", "Found it"))

    def test_repo_and_board_settings_are_checked(self):
        with self.assertRaises(gauntlet.InvalidConfig):
            failures.parse_repos("not a repo")
        with self.assertRaises(gauntlet.InvalidConfig):
            failures.parse_boards('{"a/b": 1}')


def env(folder, **extra):
    return {"AUTOMATON_APP_DATA_DIR": folder, "TARGETS": TARGETS, **extra}


class AppTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.folder.cleanup()

    def app(self, executor=None, **extra):
        return main.App(env(self.folder.name, **extra), executor=executor or FakeExecutor(), email=lambda s, t: None)

    def wait(self, app):
        for _ in range(100):
            if not app.running:
                return
            time.sleep(0.05)
        self.fail("run did not finish")

    def test_access_rules(self):
        managed = self.app(AUTOMATON_APP_ID="a1")
        self.assertEqual(managed.may_manage({}), "signin")
        signed = {"X-Automaton-Viewer-Role": "member", "X-Automaton-Viewer-Token": "t"}
        self.assertIsNone(managed.may_manage(signed))
        self.assertFalse(managed.may_run(signed))
        self.assertTrue(managed.may_run({**signed, "X-Automaton-Viewer-Role": "Administrator"}))
        alone = self.app(ADMIN_TOKEN="x" * 20)
        self.assertEqual(alone.may_manage({"X-Automaton-Viewer-Role": "administrator", "X-Automaton-Viewer-Token": "t"}), "token", "forged headers do nothing")
        self.assertIsNone(alone.may_manage({"Authorization": "Bearer " + "x" * 20}))
        self.assertEqual(self.app(ADMIN_TOKEN="short").may_manage({"Authorization": "Bearer short"}), "token")
        # the Actions of the schedules call the running app with the ADMIN_TOKEN and no Studio sign-in
        scheduled = self.app(AUTOMATON_APP_ID="a1", ADMIN_TOKEN="x" * 20)
        bearer = {"Authorization": "Bearer " + "x" * 20}
        self.assertIsNone(scheduled.may_manage(bearer))
        self.assertTrue(scheduled.may_run(bearer))
        self.assertEqual(scheduled.may_manage({"Authorization": "Bearer " + "y" * 20}), "signin")
        self.assertFalse(scheduled.may_run({"Authorization": "Bearer " + "y" * 20}))
        self.assertEqual(managed.may_manage(bearer), "signin", "no token configured: a Bearer header means nothing")

    def test_a_manual_run_stores_every_step(self):
        app = self.app()
        run_id, why = app.start("smoke", "manual")
        self.assertIsNone(why)
        self.assertEqual(app.start("smoke", "manual")[1], "another run is in progress")
        self.wait(app)
        run = app.store.run(run_id)
        self.assertEqual(run["status"], "passed")
        self.assertEqual(len(run["steps"]), 9)
        self.assertEqual(app.start("nope", "manual"), (None, "unknown plan"))

    def test_no_plan_runs_on_the_apps_own_clock(self):
        app = self.app()
        self.assertFalse(hasattr(app, "tick") or hasattr(app, "loop") or hasattr(gauntlet, "due"))
        time.sleep(0.2)
        self.assertEqual(app.store.runs(10), [])

    def test_every_built_in_plan_has_a_studio_schedule_and_an_action(self):
        manifest = json.loads((HERE / "automaton.json").read_text())["application"]
        schedules = {s["action"]: s for s in manifest["schedules"]}
        # docs-walk has no default schedule (owner decision, apps#379); it stays an Action for manual runs
        plans = set(gauntlet.load_plans(HERE / "plans"))
        self.assertEqual(set(schedules), plans - {"docs-walk"})
        self.assertEqual({k: s["cron"] for k, s in schedules.items()},
                         {"smoke": "30 2 * * *", "full-cycle": "0 3 * * 0", "upgrade": "0 3 * * 6", "restore-drill": "0 5 * * 0"})
        for key in plans:
            self.assertTrue((HERE / "actions" / key / "action.yaml").is_file(), key)
            self.assertIn("schedulable: true", (HERE / "actions" / key / "action.yaml").read_text())
        self.assertIn("ADMIN_TOKEN", [s["name"] for s in manifest["secrets"]])

    def test_home_card_has_no_host_names_or_logs(self):
        app = self.app()
        self.assertEqual(app.home_card()["status"], "No run yet")
        app.start("smoke", "schedule")
        self.wait(app)
        card = json.dumps(app.home_card())
        self.assertIn("Last run: passed", card)
        self.assertNotIn("203.0.113", card)
        self.assertNotIn("example.com", card)
        failing = self.app(executor=FakeExecutor(code=1, output="boom"))
        failing.start("smoke", "schedule")
        self.wait(failing)
        self.assertEqual(failing.home_card()["tone"], "critical")

    def test_a_standalone_app_needs_its_token_over_http(self):
        app = self.app(ADMIN_TOKEN="t" * 20)
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app, b"<html>"))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}"

        def call(path, method="GET", body=None, headers=None):
            request = Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=headers or {})
            try:
                with urlopen(request) as response:
                    return response.status, json.loads(response.read() or b"null") if "json" in response.headers.get("Content-Type", "") else None
            except HTTPError as error:
                return error.code, None
        auth = {"Authorization": "Bearer " + "t" * 20, "X-Gauntlet": "1", "Content-Type": "application/json"}
        try:
            self.assertEqual(call("/health")[0], 200)
            self.assertEqual(call("/api/state")[0], 401)
            self.assertEqual(call("/api/runs/1")[0], 401)
            self.assertEqual(call("/api/home-card")[0], 200)
            status, state = call("/api/state", headers=auth)
            self.assertEqual((status, {p["name"] for p in state["plans"]}), (200, {"smoke", "full-cycle", "upgrade", "docs-walk", "restore-drill"}))
            self.assertEqual(call("/api/runs", "POST", {"plan": "smoke"}, {"Authorization": auth["Authorization"]})[0], 403, "needs X-Gauntlet")
            self.assertEqual(call("/api/runs", "POST", {"plan": "nope"}, auth)[0], 404)
            self.assertEqual(call("/api/runs", "POST", {}, auth)[0], 400)
            status, started = call("/api/runs", "POST", {"plan": "smoke"}, auth)
            self.assertEqual(status, 202)
            self.wait(app)
            self.assertEqual(call(f"/api/runs/{started['id']}", headers=auth)[1]["status"], "passed")
            self.assertEqual(call("/api/runs/999", headers=auth)[0], 404)
        finally:
            server.shutdown()

    def test_a_schedule_starts_a_plan_through_the_action_in_a_managed_app(self):
        app = self.app(AUTOMATON_APP_ID="a1", ADMIN_TOKEN="t" * 20)
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app, b"<html>"))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"

            def post(token):
                request = Request(base + "/api/runs", method="POST", data=b'{"plan":"smoke","trigger":"action"}',
                                  headers={"Authorization": "Bearer " + token, "X-Gauntlet": "1"})
                try:
                    with urlopen(request) as response:
                        return response.status
                except HTTPError as error:
                    return error.code
            self.assertEqual(post("z" * 20), 401)
            self.assertEqual(post("t" * 20), 202)
            self.wait(app)
            self.assertEqual([(r["plan"], r["trigger"], r["status"]) for r in app.store.runs(5)], [("smoke", "action", "passed")])
            signed = Request(base + "/api/runs", method="POST", data=b'{"plan":"smoke","trigger":"action"}',
                             headers={"X-Automaton-Viewer-Role": "Administrator", "X-Automaton-Viewer-Token": "v", "X-Gauntlet": "1"})
            self.assertEqual(urlopen(signed).status, 202)
            self.wait(app)
            self.assertEqual(app.store.runs(1)[0]["trigger"], "manual", "a signed-in administrator cannot label a run as the schedule's")
        finally:
            server.shutdown()

    def test_the_ssh_key_is_never_in_a_log_or_report(self):
        key = "-----BEGIN OPENSSH PRIVATE KEY-----\nabcdef\n-----END OPENSSH PRIVATE KEY-----"
        app = self.app(executor=FakeExecutor(output=key), SSH_KEY=key)
        app.start("smoke", "manual")
        self.wait(app)
        self.assertNotIn("abcdef", json.dumps(app.store.run(1)))


class DocsWalkTests(unittest.TestCase):
    def test_the_script_runs_claude_on_haiku_at_low_effort_and_ends_with_the_result_line(self):
        script = (HERE / "plans" / "scripts" / "docs-walk.sh").read_text()
        self.assertIn("--model haiku --effort low", script)
        self.assertIn("DOCS-WALK RESULT: PASS $version", script)
        self.assertIn("exit 1", script)
        self.assertEqual(json.loads((HERE / "plans" / "docs-walk.json").read_text())["steps"][0]["contains"], "DOCS-WALK RESULT: PASS")

    def test_the_section_replaces_an_earlier_one_and_goes_before_the_report(self):
        body = "Notes\n\n## Docs walk\n\nResult: Fail\n\n## Automaton Server 1.2.3\nx\n"
        out = failures.set_docs_walk(body, "Pass", "pages: a, b")
        self.assertEqual(out, "Notes\n\n## Docs walk\n\nResult: Pass\npages: a, b\n\n## Automaton Server 1.2.3\nx\n")

    def test_only_the_very_last_line_for_the_release_the_script_named_is_recorded_and_only_with_a_token(self):
        def run(output, token=True):
            github = FakeGitHub()
            failures.Reporter(None, github if token else None, [], {}, None, lambda *a: None).docs_walk({"steps": [{"output": output}]})
            return getattr(github, "walks", [])
        good = "DOCS-WALK RELEASE 0.2.176\nfound things\nDOCS-WALK RESULT: FAIL 0.2.176 - deploy page unclear\n"
        self.assertEqual(run(good), [("0.2.176", "Fail", "deploy page unclear")])
        self.assertEqual(run(good, token=False), [])
        self.assertEqual(run("DOCS-WALK RELEASE 0.2.176\nDOCS-WALK RESULT: PASS 0.2.175 - x\n"), [])  # Claude named another release
        self.assertEqual(run("DOCS-WALK RELEASE 0.2.176\nDOCS-WALK RESULT: PASS 0.2.176 - x\nmore text\n"), [])  # not the last line
        self.assertEqual(run("DOCS-WALK RESULT: PASS 0.2.176 - x\n"), [])  # no release line from the script


class PlanScriptTests(unittest.TestCase):
    def test_deleting_data_always_comes_with_a_confirmation(self):
        # uninstall-automaton.sh refuses --delete-data without --confirm (--yes does not confirm it)
        files = list((HERE / "plans" / "scripts").glob("*.sh")) + list((HERE / "plans").glob("*.json"))
        uses = [f for f in files if "uninstall-automaton.sh" in f.read_text() or "--delete-data" in f.read_text()]
        self.assertTrue(uses)
        for f in uses:
            for line in f.read_text().splitlines():
                if "--delete-data" in line and not line.lstrip().startswith("#"):
                    self.assertIn("--confirm", line, f"{f.name} deletes data without --confirm: {line.strip()}")


if __name__ == "__main__":
    unittest.main()
