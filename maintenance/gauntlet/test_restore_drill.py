import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import failures
import gauntlet
from test_gauntlet import TARGETS, FakeGitHub

HERE = Path(__file__).parent
SCRIPTS = HERE / "plans" / "scripts"
KEY = "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ"
SETTINGS = {"DRILL_BACKUP_KEY": "# created: today\n" + KEY, "DRILL_S3_ACCESS_KEY_ID": "AKIDEXAMPLE0001",
            "DRILL_S3_SECRET_ACCESS_KEY": "s3cr3t-s3cr3t-s3cr3t", "DRILL_S3_REGION": "auto", "DRILL_S3_BUCKET": "drill-bucket"}
OBJECTS = {"automaton/old.example.com/app1/automaton-20261101T030000Z.tar.age": b"old",
           "automaton/prod.example.com/app2/automaton-20261120T031500Z.tar.age": b"newest backup bytes",
           "automaton/prod.example.com/app2/notes.txt": b"ignored"}


def fake_s3(objects, truncate=False):
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):  # noqa: N802
            seen.append(self.headers.get("Authorization", ""))
            path, _, query = self.path.partition("?")
            if not self.headers.get("Authorization", "").startswith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE0001/"):
                self.send_response(403); self.end_headers(); return
            if path == "/drill-bucket":
                body = "<ListBucketResult>" + "".join(f"<Contents><Key>{k}</Key></Contents>" for k in objects) + "</ListBucketResult>"
                self.send_response(200); self.end_headers(); self.wfile.write(body.encode()); return
            data = objects.get(path[len("/drill-bucket/"):])
            if data is None:
                self.send_response(404); self.end_headers(); return
            self.send_response(200); self.send_header("Content-Length", str(len(data)))
            self.end_headers(); self.wfile.write(data[:3] if truncate else data)
            self.close_connection = True

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, seen


class DrillTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.dir, self.result = os.path.join(self.folder.name, "drill"), os.path.join(self.folder.name, "result")

    def tearDown(self):
        self.folder.cleanup()

    def settings(self, server):
        return {**SETTINGS, "DRILL_S3_ENDPOINT": f"http://127.0.0.1:{server.server_port}"}

    def run_script(self, name, extra, command=None):
        step = {"name": name, "command": "bash -s", "timeout": 60, "exit": 0, "contains": None, "not_contains": None, "as": "root",
                "continue": False, "script": name, "repo": None, "env": [k for k in extra if k.startswith("DRILL_")]}
        target = gauntlet.parse_targets(TARGETS)["runner-02"]
        _, stdin = gauntlet.render(step, target, SCRIPTS, extra)
        env = {**os.environ, "DRILL_DIR": self.dir, "DRILL_RESULT_DIR": self.result}
        done = subprocess.run(["bash", "-s"], input=stdin, capture_output=True, text=True, env=env, timeout=60)
        return done.returncode, done.stdout + done.stderr

    def test_the_plan_is_on_runner_02_wipes_and_passes_the_secrets_only_on_stdin(self):
        plan = gauntlet.load_plans(HERE / "plans")["restore-drill"]
        self.assertEqual((plan["target"], plan["wipes"]), ("runner-02", True))
        target = gauntlet.parse_targets(TARGETS)["runner-02"]
        for s in plan["steps"]:
            command, stdin = gauntlet.render(s, target, SCRIPTS, SETTINGS)
            self.assertNotIn("s3cr3t", command)
            self.assertEqual("DRILL_BACKUP_KEY" in (stdin or ""), "DRILL_BACKUP_KEY" in s["env"])
        self.assertEqual(plan["steps"][-2]["name"], "Result and duration")
        self.assertEqual(plan["steps"][-1]["script"], "wipe.sh")
        for bad in ({"name": "x", "wipes": True, "steps": [{"name": "a", "command": "b", "env": ["HOME"]}]},
                    {"name": "x", "wipes": True, "steps": [{"name": "a", "command": "true", "env": ["DRILL_BACKUP_KEY"]}]},
                    {"name": "x", "steps": [{"name": "a", "script": "wipe.sh", "env": ["DRILL_BACKUP_KEY"]}]}):
            with self.assertRaises(gauntlet.InvalidConfig):
                gauntlet.validate_plan(bad, "t")

    def test_the_newest_archive_is_downloaded_and_the_key_is_private(self):
        server, seen = fake_s3(OBJECTS)
        code, out = self.run_script("drill-download.sh", self.settings(server))
        self.assertEqual(code, 0, out)
        self.assertEqual(Path(self.dir, "automaton-20261120T031500Z.tar.age").read_bytes(), b"newest backup bytes")
        self.assertEqual(oct(os.stat(os.path.join(self.dir, "backup-key")).st_mode & 0o777), "0o600")
        self.assertIn(KEY, Path(self.dir, "backup-key").read_text())
        self.assertNotIn(KEY, out)
        self.assertNotIn("s3cr3t", out)
        self.assertNotIn("s3cr3t", " ".join(seen))  # the secret signs requests; it is never sent

    def test_missing_settings_a_wrong_credential_or_an_empty_bucket_fail_the_step(self):
        server, _ = fake_s3(OBJECTS)
        code, out = self.run_script("drill-download.sh", {k: v for k, v in self.settings(server).items() if k != "DRILL_S3_BUCKET"})
        self.assertNotEqual(code, 0)
        self.assertIn("DRILL_S3_BUCKET", out)
        self.assertNotEqual(self.run_script("drill-download.sh", {**self.settings(server), "DRILL_S3_ACCESS_KEY_ID": "bad-key-id"})[0], 0)
        empty, _ = fake_s3({"automaton/x/readme.txt": b"x"})
        code, out = self.run_script("drill-download.sh", self.settings(empty))
        self.assertNotEqual(code, 0)
        self.assertIn("no .tar.age backup", out)
        self.assertFalse(os.path.exists(os.path.join(self.dir, "backup-key")))

    def test_a_deliberately_broken_copy_fails_the_drill_deletes_the_key_and_opens_an_issue(self):
        server, _ = fake_s3(OBJECTS, truncate=True)  # the archive arrives cut short
        settings = self.settings(server)
        test = self
        plan = gauntlet.load_plans(HERE / "plans")["restore-drill"]
        target = gauntlet.parse_targets(TARGETS)["runner-02"]

        # run only the drill's own scripts locally; install, wipe, restore.sh and checks are the machine's
        def machine_run(target, command, timeout, stdin=None):
            local = [(SCRIPTS / f"{n}.sh").read_text() for n in ("drill-download", "drill-key-delete", "drill-report")]
            if stdin and any(stdin.endswith(text) for text in local):
                env = {**os.environ, "DRILL_DIR": test.dir, "DRILL_RESULT_DIR": test.result}
                done = subprocess.run(["bash", "-s"], input=stdin, capture_output=True, text=True, env=env, timeout=60)
                return done.returncode, done.stdout + done.stderr
            return 0, "ok"

        class Local:
            run = staticmethod(machine_run)

        secrets = [SETTINGS["DRILL_BACKUP_KEY"].splitlines()[-1], SETTINGS["DRILL_S3_SECRET_ACCESS_KEY"]]
        result = gauntlet.execute(plan, target, Local(), secrets, scripts=SCRIPTS, extra=settings)
        self.assertEqual(result["status"], "failed")
        failed = [s["name"] for s in result["steps"] if s["status"] == "failed"]
        self.assertEqual(failed[0], "Download the newest backup and place the key")
        self.assertIn("Result and duration", failed)
        self.assertEqual(result["steps"][-1]["name"], "Wipe the machine")  # the cleanup steps still ran
        self.assertFalse(os.path.exists(os.path.join(self.dir, "backup-key")))
        self.assertNotIn("s3cr3t", json.dumps(result))
        store = gauntlet.Store(os.path.join(self.folder.name, "g.db"))
        github, mails = FakeGitHub(), []
        reporter = failures.Reporter(store, github, ["rzvdaniel/automaton"], {}, None, lambda s, t: mails.append((s, t)))
        run_id = store.begin("restore-drill", "runner-02", "schedule")
        store.save(run_id, result)
        reporter.failed(plan, result, run_id)
        self.assertEqual([i[0] for i in github.issues], ["rzvdaniel/automaton"])
        self.assertEqual(len(mails), 1)

    def test_report_names_result_and_duration(self):
        os.makedirs(self.result)
        for name, text in (("start", "0"), ("restore-seconds", "42"), ("archive", "automaton-20261120T031500Z.tar.age"), ("health-ok", "")):
            Path(self.result, name).write_text(text)
        code, out = self.run_script("drill-report.sh", {})
        self.assertEqual(code, 0)
        self.assertIn("RESTORE DRILL: PASS", out)
        self.assertIn("restored in 42 s", out)
        os.remove(os.path.join(self.result, "health-ok"))
        self.assertNotEqual(self.run_script("drill-report.sh", {})[0], 0)


if __name__ == "__main__":
    unittest.main()
