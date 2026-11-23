import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import keeper
import main

RUNNER = "11111111-2222-3333-4444-555555555555"
BASE = {"AUTOMATON_API_URL": "http://api.test", "APP_AUTOMATON_API_KEY": "key", "AGENT_MACHINE_ID": RUNNER, "AGENT_REPO": "acme/widgets"}
SECRET = "AABBCCDDEE1234567890"


def settings(**extra):
    return keeper.Settings(dict(BASE, **extra))


class SettingsTests(unittest.TestCase):
    def test_defaults_and_url(self):
        s = settings()
        self.assertEqual((s.name, s.labels, s.user, s.github_url), ("agent-keeper", "agent", "agent", "https://github.com/acme/widgets"))
        self.assertIsNone(s.missing())

    def test_repo_url_form_and_org(self):
        self.assertEqual(settings(AGENT_REPO="https://github.com/acme/widgets/").repo, "acme/widgets")
        self.assertEqual(settings(AGENT_REPO="acme").github_url, "https://github.com/acme")

    def test_missing(self):
        self.assertIn("AGENT_MACHINE_ID", keeper.Settings({}).missing())
        self.assertIn("AGENT_REPO", keeper.Settings({"AGENT_MACHINE_ID": RUNNER}).missing())

    def test_rejects_bad_values(self):
        for key, value in (("AGENT_MACHINE_ID", "nope"), ("AGENT_REPO", "a b"), ("AGENT_RUNNER_NAME", "x;rm"), ("AGENT_RUNNER_LABELS", "a,$(id)"), ("AGENT_RUNNER_USER", "Root x")):
            with self.assertRaises(keeper.ConfigError, msg=key):
                settings(**{key: value})


class BuildTests(unittest.TestCase):
    def test_token_goes_only_to_stdin(self):
        body = keeper.build_request(settings(), "setup", SECRET)
        self.assertEqual(body["stdin"], SECRET + "\n")
        self.assertNotIn(SECRET, json.dumps({k: v for k, v in body.items() if k != "stdin"}))

    def test_settings_are_quoted_into_header(self):
        body = keeper.build_request(settings(AGENT_RUNNER_LABELS="agent,gpu"), "status", None)
        self.assertTrue(body["script"].startswith("AK_USER=agent\nAK_URL=https://github.com/acme/widgets\nAK_NAME=agent-keeper\nAK_LABELS=agent,gpu\n"))
        self.assertIsNone(body["stdin"])

    def test_remove_needs_a_token_and_setup_does_not(self):
        with self.assertRaises(ValueError):
            keeper.build_request(settings(), "remove", None)
        self.assertIsNone(keeper.build_request(settings(), "setup", None)["stdin"])

    def test_bad_token_is_refused(self):
        for bad in ("short", "has space 123456", "a;rm -rf /abc", "x" * 201):
            with self.assertRaises(ValueError):
                keeper.build_request(settings(), "setup", bad)

    def test_token_not_sent_for_status_or_update(self):
        for action in ("status", "update-tools"):
            self.assertIsNone(keeper.build_request(settings(), action, SECRET)["stdin"])

    def test_unknown_action(self):
        with self.assertRaises(ValueError):
            keeper.read_script("../x")


class ScriptTests(unittest.TestCase):
    def test_scripts_parse(self):
        for action in keeper.ACTIONS:
            script = keeper.read_script(action)
            result = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_scripts_never_echo_or_trace_the_token(self):
        for action in keeper.ACTIONS:
            script = keeper.read_script(action)
            self.assertNotIn("set -x", script)
            self.assertNotRegex(script, r"(echo|printf)[^\n]*AK_TOKEN")
            self.assertNotRegex(script, r"--token")

    def test_status_script_runs_locally_without_changing_anything(self):
        script = "AK_USER=nosuchuser_ak\nAK_URL=x\nAK_NAME=x\nAK_LABELS=agent\n" + keeper.read_script("status")
        result = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("registered=no", result.stdout)
        self.assertIn("service=none", result.stdout)
        self.assertEqual(keeper.parse_status(result.stdout)["state"], "not set up")


class BusyProbeTests(unittest.TestCase):
    def test_busy_probe_matches_the_process_name_only(self):
        # The Runner runs the whole script as `bash -c <script>`: `pgrep -f` would match that command line and always say busy.
        script = keeper.read_script("status")
        self.assertIn("pgrep -x Runner.Worker", script)
        self.assertNotIn("pgrep -f", script)


class ParseTests(unittest.TestCase):
    def test_states(self):
        base = "registered=yes\nservice=active\nbusy=no\nlisten"
        self.assertEqual(keeper.parse_status("registered=no")["state"], "not set up")
        self.assertEqual(keeper.parse_status("registered=yes\nservice=inactive")["state"], "offline")
        self.assertEqual(keeper.parse_status("registered=yes\nservice=active\nbusy=yes\nlistening=1")["state"], "busy")
        self.assertEqual(keeper.parse_status("registered=yes\nservice=active\nbusy=no\nlistening=3")["state"], "online, idle")
        self.assertEqual(keeper.parse_status("registered=yes\nservice=active\nbusy=no\nlistening=0")["state"], "starting")

    def test_tools_and_disk(self):
        parsed = keeper.parse_status("registered=yes\nservice=active\ntool_gh=2.1\ntool_claude=\ndisk_total=100\ndisk_used=40\njob=build")
        self.assertEqual(parsed["tools"], {"gh": "2.1"})
        self.assertEqual((parsed["diskTotal"], parsed["diskUsed"], parsed["job"]), (100, 40, "build"))

    def test_scrub(self):
        self.assertEqual(keeper.scrub("a " + SECRET + " b", SECRET), "a *** b")
        self.assertEqual(len(keeper.scrub("x" * 50000, None)), keeper.OUTPUT_LIMIT)


class Fake(BaseHTTPRequestHandler):
    calls = []
    reply = (200, {"exitCode": 0, "timedOut": False, "output": "== done\nregistered=no", "error": ""})

    def log_message(self, *a):
        pass

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.calls.append((self.path, dict(self.headers), body))
        code, payload = Fake.reply
        raw = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ServerTests(unittest.TestCase):
    def setUp(self):
        Fake.calls = []
        Fake.reply = (200, {"exitCode": 0, "timedOut": False, "output": "== done\nregistered=no\nvalue " + SECRET, "error": ""})
        self.fake = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=self.fake.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        env = dict(BASE, AUTOMATON_API_URL=f"http://127.0.0.1:{self.fake.server_port}", AUTOMATON_APP_DATA_DIR=self.tmp.name)
        self.app = main.Keeper(env)
        self.http = HTTPServer(("127.0.0.1", 0), main.make_handler(self.app))
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.fake.shutdown()
        self.http.shutdown()
        self.tmp.cleanup()

    def post(self, path, body=None, headers=None):
        h = {"X-Agent-Keeper": "1", "Content-Type": "application/json", "X-Automaton-Viewer-Token": "viewer-jwt"}
        h.update(headers or {})
        try:
            with urlopen(Request(self.url + path, data=json.dumps(body or {}).encode(), headers=h, method="POST")) as r:
                return r.status, json.loads(r.read())
        except HTTPError as e:
            return e.code, json.loads(e.read())

    def wait(self):
        for _ in range(200):
            if not self.app.running:
                return
            threading.Event().wait(0.02)

    def test_status_runs_in_request_and_forwards_viewer_token(self):
        code, body = self.post("/api/run/status")
        self.assertEqual(code, 200)
        path, headers, sent = Fake.calls[0]
        self.assertEqual(path, f"/api/server/runners/{RUNNER}/host-exec")
        self.assertEqual(headers["X-Automaton-Viewer-Token"], "viewer-jwt")
        self.assertEqual(headers["Authorization"], "Bearer key")
        self.assertEqual(body["status"]["parsed"]["state"], "not set up")

    def test_setup_token_is_used_once_and_never_stored(self):
        code, _ = self.post("/api/run/setup", {"token": SECRET})
        self.assertEqual(code, 202)
        self.wait()
        self.assertEqual(Fake.calls[0][2]["stdin"], SECRET + "\n")
        self.assertNotIn(SECRET, json.dumps(Fake.calls[0][2]["script"]))
        with open(self.app.path, encoding="utf-8") as handle:
            saved = handle.read()
        self.assertNotIn(SECRET, saved)
        self.assertIn("***", saved)
        with urlopen(self.url + "/api/state") as r:
            self.assertNotIn(SECRET, r.read().decode())

    def test_server_refusal_is_saved_with_its_message(self):
        Fake.reply = (403, {"error": "Host access is turned off."})
        self.post("/api/run/status")
        with urlopen(self.url + "/api/state") as r:
            state = json.loads(r.read())
        self.assertEqual(state["status"]["status"], "forbidden")
        self.assertEqual(state["status"]["message"], "Host access is turned off.")

    def test_header_required_and_unknown_action(self):
        self.assertEqual(self.post("/api/run/status", headers={"X-Agent-Keeper": "0"})[0], 404)
        self.assertEqual(self.post("/api/run/bogus")[0], 404)

    def test_bad_token_is_400_and_nothing_is_sent(self):
        self.assertEqual(self.post("/api/run/remove", {"token": "bad token!"})[0], 400)
        self.assertEqual(self.post("/api/run/remove", {})[0], 400)
        self.assertEqual(Fake.calls, [])

    def test_second_run_while_one_runs_is_409(self):
        self.app.running = {"action": "setup", "startedAt": 0}
        self.assertEqual(self.post("/api/run/status")[0], 409)

    def test_admin_flag_is_display_only(self):
        def state(role):
            h = {"X-Automaton-Viewer-Role": role} if role else {}
            with urlopen(Request(self.url + "/api/state", headers=h)) as r:
                return json.loads(r.read())["admin"]
        self.assertTrue(state("Administrator"))
        self.assertFalse(state("viewer"))
        self.assertFalse(state(None))

    def test_static_files_and_health(self):
        for path in ("/", "/health", "/keeper.js", "/keeper.css", "/ui/app.css", "/ui/app.js"):
            with urlopen(self.url + path) as r:
                self.assertEqual(r.status, 200, path)


if __name__ == "__main__":
    unittest.main()
