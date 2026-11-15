import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import main
import watchtower

TOKEN = "an-admin-token-of-32-characters-xx"


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class Engine(unittest.TestCase):
    def setUp(self):
        self.state = watchtower.new_state()

    def run_at(self, now, **kw):
        watchtower.run_watchers(self.state, now, **kw)

    def test_fires_once_and_resolves(self):
        self.state["dummy"] = True
        self.run_at(100)
        self.run_at(200)
        self.assertEqual(len(self.state["alerts"]), 1)
        self.assertEqual(len(watchtower.pending(self.state, 200)), 1)
        watchtower.confirm(self.state["alerts"][0], 200)
        self.run_at(300)
        self.assertEqual(watchtower.pending(self.state, 300), [])
        self.state["dummy"] = False
        self.run_at(400)
        self.assertIsNotNone(self.state["alerts"][0]["resolved_at"])
        self.assertEqual(watchtower.active(self.state), [])

    def test_comes_back_as_new_alert(self):
        self.state["dummy"] = True
        self.run_at(100)
        self.state["dummy"] = False
        self.run_at(200)
        self.state["dummy"] = True
        self.run_at(300)
        self.assertEqual(len(self.state["alerts"]), 2)
        self.assertEqual(len(watchtower.pending(self.state, 300)), 1)  # the first one ended, the new one is not emailed yet

    def test_schedule_and_disable(self):
        self.state["dummy"] = True
        self.run_at(100)
        self.state["dummy"] = False
        self.run_at(110)  # interval 30: not due, still active
        self.assertEqual(len(watchtower.active(self.state)), 1)
        watchtower.set_rule(self.state, "dummy", {"enabled": False})
        self.assertEqual(watchtower.active(self.state), [])  # turning a watcher off ends its alerts

    def test_failing_watcher_keeps_alerts(self):
        self.state["dummy"] = True
        self.run_at(100)
        original = watchtower.WATCHERS["dummy"]
        watchtower.WATCHERS["dummy"] = (original[0], original[1], lambda s: 1 / 0)
        try:
            self.run_at(500)
        finally:
            watchtower.WATCHERS["dummy"] = original
        self.assertEqual(len(watchtower.active(self.state)), 1)

    def test_mute(self):
        self.state["dummy"] = True
        self.run_at(100)
        alert = self.state["alerts"][0]
        watchtower.mute(alert, 24, 100)
        self.assertEqual(watchtower.pending(self.state, 200), [])
        self.assertEqual(len(watchtower.pending(self.state, 100 + 24 * 3600 + 1)), 1)
        watchtower.unmute(alert)
        self.assertEqual(len(watchtower.pending(self.state, 200)), 1)
        for bad in (0, 169, "24", True, None):
            with self.assertRaises(watchtower.InvalidInput):
                watchtower.mute(alert, bad, 100)

    def test_rule_validation(self):
        for body in ({"interval": 5}, {"interval": "30"}, {"enabled": "yes"}, {"interval": True}):
            with self.assertRaises(watchtower.InvalidInput):
                watchtower.set_rule(self.state, "dummy", body)
        with self.assertRaises(KeyError):
            watchtower.set_rule(self.state, "nope", {})

    def test_save_load_and_corrupt(self):
        self.state["dummy"] = True
        self.run_at(100)
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "state.json")
            watchtower.save_state(path, self.state)
            self.assertEqual(watchtower.load_state(path)["alerts"][0]["key"], "dummy")
            Path(path).write_text("{nope")
            with self.assertRaises(watchtower.CorruptState):
                watchtower.load_state(path)
            Path(path).write_text('{"alerts": [{"id": 1}]}')
            with self.assertRaises(watchtower.CorruptState):
                watchtower.load_state(path)

    def test_trim_drops_oldest_resolved(self):
        for i in range(watchtower.MAX_ALERTS + 5):
            self.state["alerts"].append({"id": str(i), "resolved_at": 1.0})
        watchtower.trim(self.state)
        self.assertEqual(len(self.state["alerts"]), watchtower.MAX_ALERTS)
        self.assertEqual(self.state["alerts"][0]["id"], "5")


class Server(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.clock = Clock()
        self.mails = []
        self.mail_result = True

        def email(api_url, api_key, to, subject, text):
            self.mails.append((subject, text))
            return self.mail_result
        env = {"ADMIN_TOKEN": TOKEN, "AUTOMATON_APP_DATA_DIR": self.folder.name, "PUBLIC_URL": "https://wt.example/"}
        self.app = main.App(env, now=self.clock, email=email)
        page = (Path(main.__file__).parent / "index.html").read_bytes()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app, page))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def call(self, method, path, body=None, token=TOKEN):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1])
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, data

    def state(self):
        return json.loads(self.call("GET", "/api/state")[1])

    def test_auth(self):
        self.assertEqual(self.call("GET", "/api/state", token=None)[0], 401)
        self.assertEqual(self.call("GET", "/api/state", token="x" * 32)[0], 401)
        self.assertEqual(self.call("GET", "/api/state")[0], 200)
        self.assertEqual(self.call("GET", "/")[0], 200)
        self.assertEqual(self.call("GET", "/health")[0], 200)

    def test_locked_without_token(self):
        self.app.admin_token = ""
        self.assertEqual(self.call("GET", "/api/state")[0], 503)

    def test_dummy_alerts_once_and_not_repeated(self):
        self.assertEqual(self.call("POST", "/api/dummy", {"on": True})[0], 200)
        self.assertEqual(len(self.mails), 1)
        self.assertIn("https://wt.example/mute/", self.mails[0][1])
        for _ in range(3):
            self.clock.t += 60
            self.app.run_pass()
            self.call("POST", "/api/run")
        self.assertEqual(len(self.mails), 1)
        self.call("POST", "/api/dummy", {"on": False})
        self.assertEqual(self.state()["alerts"][0]["resolved_at"] is not None, True)
        self.call("POST", "/api/dummy", {"on": True})
        self.assertEqual(len(self.mails), 2)

    def test_state_does_not_expose_mute_tokens(self):
        self.call("POST", "/api/dummy", {"on": True})
        self.assertNotIn("token", self.state()["alerts"][0])

    def test_failed_email_is_retried_unavailable_is_not(self):
        self.mail_result = False
        self.call("POST", "/api/dummy", {"on": True})
        self.call("POST", "/api/run")
        self.assertEqual(len(self.mails), 2)
        self.mail_result = None
        self.call("POST", "/api/run")
        self.call("POST", "/api/run")
        self.assertEqual(len(self.mails), 3)

    def test_mute_link_get_does_not_mute_post_does(self):
        self.mail_result = None
        self.call("POST", "/api/dummy", {"on": True})
        token = self.app.state["alerts"][0]["token"]
        status, page = self.call("GET", "/mute/" + token, token=None)
        self.assertEqual(status, 200)
        self.assertIn(b"<button>", page)
        self.assertFalse(self.state()["alerts"][0]["muted"])
        status, _ = self.call("POST", "/mute/" + token, token=None)
        self.assertEqual(status, 200)
        self.assertTrue(self.state()["alerts"][0]["muted"])
        self.assertEqual(self.call("GET", "/mute/nope", token=None)[0], 404)
        self.assertEqual(self.call("POST", "/mute/nope", token=None)[0], 404)

    def test_muted_alert_is_not_emailed(self):
        self.app.state["alerts"].append({"id": "a1", "key": "k", "watcher": "other", "title": "muted-one", "detail": "", "severity": "warning",
                                         "token": "tok", "first_seen": 1.0, "last_seen": 1.0, "resolved_at": None, "notified_at": None,
                                         "muted_until": self.clock.t + 3600})
        self.app.run_pass()
        self.assertEqual(self.mails, [])
        self.clock.t += 7200
        self.app.run_pass()
        self.assertEqual(len(self.mails), 1)

    def test_api_mute_and_unmute(self):
        self.call("POST", "/api/dummy", {"on": True})
        alert_id = self.state()["alerts"][0]["id"]
        self.assertTrue(json.loads(self.call("POST", f"/api/alerts/{alert_id}/mute", {"hours": 2})[1])["alerts"][0]["muted"])
        self.assertEqual(self.call("POST", f"/api/alerts/{alert_id}/mute", {"hours": 0})[0], 400)
        self.assertEqual(self.call("POST", "/api/alerts/zzz/mute", {})[0], 404)
        self.assertFalse(json.loads(self.call("DELETE", f"/api/alerts/{alert_id}/mute")[1])["alerts"][0]["muted"])

    def test_rules_and_bad_input(self):
        self.assertEqual(self.call("PUT", "/api/rules/dummy", {"interval": 60})[0], 200)
        self.assertEqual(self.state()["watchers"][0]["interval"], 60)
        self.assertEqual(self.call("PUT", "/api/rules/dummy", {"interval": 1})[0], 400)
        self.assertEqual(self.call("PUT", "/api/rules/nope", {})[0], 404)
        self.assertEqual(self.call("POST", "/api/dummy", {"on": "yes"})[0], 400)

    def test_concurrent_passes_email_once(self):
        gate = threading.Event()
        original = self.app.email

        def slow(*args):
            gate.wait(2)
            return original(*args)
        self.app.email = slow
        self.app.state["dummy"] = True
        threads = [threading.Thread(target=self.app.run_pass, kwargs={"force": True}) for _ in range(2)]
        for thread in threads:
            thread.start()
        gate.set()
        for thread in threads:
            thread.join()
        self.assertEqual(len(self.mails), 1)

    def test_state_survives_restart(self):
        self.call("POST", "/api/dummy", {"on": True})
        again = main.App({"ADMIN_TOKEN": TOKEN, "AUTOMATON_APP_DATA_DIR": self.folder.name}, now=self.clock, email=lambda *a: True)
        self.assertEqual(len(again.state["alerts"]), 1)
        self.assertIsNotNone(again.state["alerts"][0]["notified_at"])


if __name__ == "__main__":
    unittest.main()
