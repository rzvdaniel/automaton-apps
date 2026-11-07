import http.client
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path

import heartbeat
import main
from heartbeat import InvalidInput

TOKEN = "an-admin-token-of-32-characters-xx"


class Durations(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(heartbeat.parse_duration("90"), 90)
        self.assertEqual(heartbeat.parse_duration("5m"), 300)
        self.assertEqual(heartbeat.parse_duration("24h"), 86400)
        self.assertEqual(heartbeat.parse_duration("1h 30m"), 5400)
        self.assertEqual(heartbeat.parse_duration("2D"), 172800)
        self.assertEqual(heartbeat.parse_duration(60), 60)

    def test_rejects_bad_values(self):
        for bad in ("", "abc", "5x", "-5m", "0", "1.5h", None, True, "999d"):
            with self.assertRaises(InvalidInput, msg=repr(bad)):
                heartbeat.parse_duration(bad)
        self.assertEqual(heartbeat.parse_duration("0", allow_zero=True), 0)

    def test_format(self):
        self.assertEqual(heartbeat.format_duration(45), "45s")
        self.assertEqual(heartbeat.format_duration(5400), "1h 30m")
        self.assertEqual(heartbeat.format_duration(90000), "1d 1h")


class Checks(unittest.TestCase):
    def make(self, existing=None, **kw):
        values = {"name": "db-dump", "period": "24h", "grace": "1h", **kw}
        return heartbeat.new_check(values["name"], values["period"], values["grace"], 1000.0, existing or [])

    def test_new_check(self):
        check = self.make()
        self.assertEqual((check["period"], check["grace"], check["alerted"]), (86400, 3600, "up"))
        self.assertGreaterEqual(len(check["token"]), 32)

    def test_tokens_are_unique_and_long(self):
        tokens = {self.make()["token"] for _ in range(200)}
        self.assertEqual(len(tokens), 200)

    def test_validation(self):
        for kw in ({"name": ""}, {"name": "x" * 81}, {"period": "30s"}, {"period": "nope"}, {"grace": "x"}):
            with self.assertRaises(InvalidInput, msg=str(kw)):
                self.make(**kw)
        with self.assertRaises(InvalidInput):
            self.make([self.make()], name="DB-Dump")
        self.assertEqual(self.make(grace="")["grace"], 0)
        with self.assertRaises(InvalidInput):
            heartbeat.new_check("n", "1h", "0", 0, [{"name": str(i)} for i in range(heartbeat.MAX_CHECKS)])

    def test_find_by_token(self):
        a, b = self.make(), self.make(name="other")
        self.assertIs(heartbeat.find_by_token([a, b], b["token"]), b)
        self.assertIsNone(heartbeat.find_by_token([a, b], a["token"] + "x"))
        self.assertIsNone(heartbeat.find_by_token([a, b], ""))


class Decisions(unittest.TestCase):
    def setUp(self):
        self.check = heartbeat.new_check("db-dump", "24h", "1h", 0.0, [])
        self.day = 86400

    def test_on_time_check_in_stays_green(self):
        heartbeat.record_ping(self.check, self.day - 10)
        for now in (self.day, 2 * self.day, 2 * self.day + 3000):
            self.assertEqual(heartbeat.status(self.check, now), "up" if now < self.day + self.day + 3600 - 10 else "late")
            self.assertIsNone(heartbeat.decide(self.check, now))

    def test_never_pinged_is_waiting_then_late(self):
        self.assertEqual(heartbeat.status(self.check, self.day), "new")
        self.assertEqual(heartbeat.status(self.check, self.day + 3600), "new")
        self.assertEqual(heartbeat.status(self.check, self.day + 3601), "late")
        self.assertEqual(heartbeat.decide(self.check, self.day + 3601), "missed")

    def test_one_missed_and_one_recovered(self):
        heartbeat.record_ping(self.check, 100)
        events = []
        send = lambda event, text, name: events.append(event) or True
        late = 100 + self.day + 3601
        for now in (late, late + 300, late + 600, late + 9000):
            heartbeat.run_pass([self.check], now, send)
        self.assertEqual(events, ["missed"])
        heartbeat.record_ping(self.check, late + 9500)
        for now in (late + 9501, late + 9800):
            heartbeat.run_pass([self.check], now, send)
        self.assertEqual(events, ["missed", "recovered"])

    def test_failed_delivery_is_retried(self):
        calls = []
        def send(event, text, name):
            calls.append(event)
            return len(calls) > 1
        late = self.day + 4000
        heartbeat.run_pass([self.check], late, send)
        heartbeat.run_pass([self.check], late + 30, send)
        heartbeat.run_pass([self.check], late + 60, send)
        self.assertEqual(calls, ["missed", "missed"])

    def test_messages(self):
        text = heartbeat.message("missed", self.check, self.day + 4000)
        self.assertEqual(text, "MISSED: db-dump - never checked in (expected every 1d, 1h grace)")
        heartbeat.record_ping(self.check, 0)
        self.assertIn("no check-in for 1d 1h 6m", heartbeat.message("missed", self.check, self.day + 4000))
        self.assertEqual(heartbeat.message("recovered", self.check, 0), "RECOVERED: db-dump checked in again")

    def test_public_view_can_hide_token(self):
        self.assertNotIn("token", heartbeat.public_view(self.check, 0, with_token=False))
        self.assertIn("token", heartbeat.public_view(self.check, 0))


class Storage(unittest.TestCase):
    def test_round_trip_and_corruption(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "d", "checks.json")
            self.assertEqual(heartbeat.load_checks(path), [])
            check = heartbeat.new_check("a", "1h", "0", 1.0, [])
            heartbeat.save_checks(path, [check])
            self.assertEqual(heartbeat.load_checks(path), [check])
            self.assertEqual(os.stat(path).st_mode & 0o077, 0)
            Path(path).write_text("[1, {\"id\": 1}]")
            self.assertEqual(heartbeat.load_checks(path), [])
            Path(path).write_text("{broken")
            self.assertEqual(heartbeat.load_checks(path), [])


class Server(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.clock = [1000.0]
        self.sent = []
        self.start()

    def start(self, token=TOKEN):
        env = {"ADMIN_TOKEN": token, "WEBHOOK_URL": "http://hooks.example/SECRETHOOK", "AUTOMATON_APP_DATA_DIR": self.folder.name}
        self.app = main.App(env, now=lambda: self.clock[0], post=lambda url, payload: self.sent.append((url, payload)) or True)
        self.httpd = main.ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app, b"<html>page</html>"))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.stop)

    def stop(self):
        self.httpd.shutdown(); self.httpd.server_close()

    def request(self, method, path, body=None, token=TOKEN):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=5)
        headers = {"Authorization": "Bearer " + token} if token is not None else {}
        connection.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, (json.loads(data) if data and response.getheader("Content-Type") == "application/json" else data)

    def create(self, **kw):
        status, body = self.request("POST", "/api/checks", {"name": "db-dump", "period": "24h", "grace": "1h", **kw})
        self.assertEqual(status, 201, body)
        return body

    def test_full_lifecycle_one_alert_one_recovery(self):
        check = self.create()
        url = "/ping/" + check["token"]
        self.assertEqual(self.request("GET", url, token=None)[0], 200)
        self.clock[0] += 86400 + 1800            # inside the grace
        self.app.check_overdue()
        self.assertEqual(self.sent, [])
        self.clock[0] += 3600                    # now late
        for _ in range(4):
            self.app.check_overdue()
        self.assertEqual([p["event"] for _, p in self.sent], ["missed"])
        self.assertEqual(self.request("POST", url, token=None)[0], 200)
        for _ in range(3):
            self.app.check_overdue()
        self.assertEqual([p["event"] for _, p in self.sent], ["missed", "recovered"])
        payload = self.sent[0][1]
        self.assertEqual(payload["text"], payload["content"])
        self.assertTrue(payload["text"].startswith("MISSED: db-dump"))

    def test_state_survives_restart_without_repeating_alerts(self):
        check = self.create()
        self.clock[0] += 200000
        self.app.check_overdue()
        self.stop(); self.start()
        self.app.check_overdue()
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.request("GET", "/ping/" + check["token"], token=None)[0], 200)

    def test_unknown_token_is_404_and_guessing_does_not_work(self):
        self.create()
        for path in ("/ping/nope", "/ping/", "/ping/a/b"):
            self.assertEqual(self.request("GET", path, token=None)[0], 404, path)

    def test_admin_api_needs_the_token(self):
        self.assertEqual(self.request("GET", "/api/checks", token=None)[0], 401)
        self.assertEqual(self.request("GET", "/api/checks", token="wrong")[0], 401)
        self.assertEqual(self.request("GET", "/api/checks")[0], 200)
        self.assertEqual(self.request("DELETE", "/api/checks/x", token="wrong")[0], 401)

    def test_api_disabled_without_a_long_admin_token(self):
        self.stop(); self.start(token="short")
        self.assertEqual(self.request("GET", "/api/checks", token="short")[0], 503)
        self.assertEqual(self.request("GET", "/api/checks", token="")[0], 503)
        self.assertEqual(self.request("GET", "/health", token=None)[0], 200)

    def test_create_validation_and_delete(self):
        self.assertEqual(self.request("POST", "/api/checks", {"name": "x", "period": "10s"})[0], 400)
        self.assertEqual(self.request("POST", "/api/checks", [1])[0], 400)
        check = self.create()
        self.assertEqual(self.request("POST", "/api/checks", {"name": "db-dump", "period": "1h"})[0], 400)
        listed = self.request("GET", "/api/checks")[1]
        self.assertEqual([c["status"] for c in listed], ["new"])
        self.assertEqual(self.request("DELETE", "/api/checks/" + check["id"])[0], 204)
        self.assertEqual(self.request("DELETE", "/api/checks/" + check["id"])[0], 404)
        self.assertEqual(self.request("GET", "/ping/" + check["token"], token=None)[0], 404)

    def test_page_health_and_unknown_routes(self):
        self.assertEqual(self.request("GET", "/", token=None), (200, b"<html>page</html>"))
        self.assertEqual(self.request("GET", "/health", token=None)[0], 200)
        self.assertEqual(self.request("GET", "/nothing", token=None)[0], 404)
        self.assertEqual(self.request("PUT", "/api/checks", token=None)[0], 501)

    def test_logs_never_hold_tokens_or_webhook(self):
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            check = self.create()
            self.request("GET", "/ping/" + check["token"], token=None)
            self.clock[0] += 200000
            self.app.check_overdue()
        text = out.getvalue()
        self.assertIn("MISSED: db-dump", text)
        for secret in (check["token"], "SECRETHOOK", TOKEN):
            self.assertNotIn(secret, text)


class Page(unittest.TestCase):
    def test_page_ships_and_uses_text_not_html_for_names(self):
        page = (Path(__file__).parent / "index.html").read_text()
        self.assertIn("textContent = c.name", page)
        self.assertNotIn("innerHTML", page)


if __name__ == "__main__":
    unittest.main()
