import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import console
import main

NOW = 1_800_000_000.0
GB = 1024 ** 3


def iso(seconds_ago: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(NOW - seconds_ago, timezone.utc).isoformat().replace("+00:00", "Z")


def health(disk_free_gb=60, security=0, reboot=False, reboot_days=0, **host):
    figures = {"cpuPercent": 20.0, "cpuCount": 4, "load5": 0.4, "memoryTotalBytes": 8 * GB, "memoryAvailableBytes": 5 * GB,
               "diskTotalBytes": 100 * GB, "diskAvailableBytes": disk_free_gb * GB, "securityUpdates": security, "updatesPending": security + 3,
               "rebootRequired": reboot, "rebootRequiredSinceUtc": iso(reboot_days * 86400) if reboot else None, "osName": "Ubuntu 24.04 LTS"}
    figures.update(host)
    return {"server": {"version": "0.2.6", "latestVersion": "0.2.6", "updateAvailable": False}, "host": figures, "hostAgeSeconds": 60,
            "runners": [{"name": "main", "status": "online", "version": "1.0", "upgradeAvailable": False}],
            "certificates": [{"host": "studio.example.com", "daysRemaining": 60}],
            "backup": {"available": True, "lastSuccessAgeHours": 5, "lastSuccessAt": iso(5 * 3600)}}


def settings(**env):
    base = {"API_BASE_URL": "https://api.example.com", "APP_AUTOMATON_API_KEY": "key", "WEBHOOK_URL": "https://hooks.example.com/x"}
    base.update(env)
    return console.Settings(base)


class Recorder:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def __call__(self, event, condition, text):
        self.sent.append((event, condition, text))
        return self.ok


def cycle(state, conf, data, send, now=NOW):
    return console.run_cycle(conf, state, now, send, fetch=lambda _s: ("ok", data, None))


class SettingsTests(unittest.TestCase):
    def test_defaults_and_validation(self):
        conf = settings()
        self.assertEqual((conf.interval, conf.disk_free_percent, conf.security_days, conf.reboot_days), (300, 15, 7, 3))
        with self.assertRaises(console.ConfigError):
            settings(DISK_FREE_WARN_PERCENT="0")
        with self.assertRaises(console.ConfigError):
            settings(CHECK_INTERVAL_SECONDS="5")
        with self.assertRaises(console.ConfigError):
            settings(API_BASE_URL="ftp://x")


class FetchTests(unittest.TestCase):
    class Opener:
        def __init__(self, result):
            self.result, self.requests = result, []

        def open(self, request, timeout=0):
            self.requests.append(request)
            if isinstance(self.result, Exception):
                raise self.result
            return self

        def read(self, _n):
            return json.dumps(self.result).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    def test_sends_the_key_as_a_bearer_token_to_the_health_endpoint(self):
        opener = self.Opener({"ok": 1})
        self.assertEqual(console.fetch_health(settings(), opener=opener), ("ok", {"ok": 1}, None))
        self.assertEqual(opener.requests[0].full_url, "https://api.example.com/api/server/health")
        self.assertEqual(opener.requests[0].get_header("Authorization"), "Bearer key")

    def test_without_approval_the_app_has_no_key_and_asks_nothing(self):
        opener = self.Opener({})
        status, data, _ = console.fetch_health(settings(APP_AUTOMATON_API_KEY=""), opener=opener)
        self.assertEqual((status, data, opener.requests), ("no_key", None, []))

    def test_a_refused_key_means_not_approved(self):
        error = urllib.error.HTTPError("u", 403, "Forbidden", {}, None)
        self.assertEqual(console.fetch_health(settings(), opener=self.Opener(error))[:2], ("not_approved", None))
        error = urllib.error.HTTPError("u", 404, "Not Found", {}, None)
        self.assertEqual(console.fetch_health(settings(), opener=self.Opener(error))[0], "unavailable")
        self.assertEqual(console.fetch_health(settings(), opener=self.Opener(urllib.error.URLError("down")))[0], "error")

    def test_a_missing_api_address_is_reported(self):
        self.assertEqual(console.fetch_health(settings(API_BASE_URL=""))[0], "not_configured")


class HistoryTests(unittest.TestCase):
    def test_keeps_24_hours_and_computes_percentages(self):
        state = console.new_state()
        console.record(state, health(), NOW - 25 * 3600)
        console.record(state, health(disk_free_gb=25), NOW)
        self.assertEqual(len(state["history"]), 1)
        self.assertEqual(state["history"][0], {"t": int(NOW), "cpu": 20.0, "mem": 37.5, "disk": 75.0})

    def test_state_survives_a_restart_and_a_damaged_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "data", "state.json")
            state = console.new_state()
            console.record(state, health(security=2), NOW)
            console.save_state(path, state)
            self.assertEqual(console.load_state(path)["securitySince"], int(NOW))
            with open(path, "w") as handle:
                handle.write("{broken")
            self.assertEqual(console.load_state(path)["history"], [])


class AssessTests(unittest.TestCase):
    def judge(self, data, state=None, **env):
        state = state or console.new_state()
        console.record(state, data, NOW)
        return console.assess(data, state, settings(**env), NOW)

    def test_a_healthy_server_is_ok(self):
        verdict = self.judge(health())
        self.assertEqual(verdict["overall"], "ok")
        self.assertEqual(verdict["updates"], "ok")

    def test_low_disk_follows_the_threshold(self):
        self.assertEqual(self.judge(health(disk_free_gb=12))["disk"], "critical")
        self.assertEqual(self.judge(health(disk_free_gb=20))["disk"], "warning")
        self.assertEqual(self.judge(health(disk_free_gb=12), DISK_FREE_WARN_PERCENT="10")["disk"], "warning")

    def test_security_updates_turn_critical_after_the_limit(self):
        state = console.new_state()
        state["securitySince"] = int(NOW - 8 * 86400)
        self.assertEqual(self.judge(health(security=2), state)["security"], "critical")
        self.assertEqual(self.judge(health(security=2))["security"], "warning")

    def test_restart_required_turns_critical_after_the_limit(self):
        self.assertEqual(self.judge(health(reboot=True, reboot_days=1))["reboot"], "warning")
        self.assertEqual(self.judge(health(reboot=True, reboot_days=4))["reboot"], "critical")

    def test_unknown_figures_are_not_called_ok(self):
        verdict = self.judge(health(securityUpdates=None, updatesPending=None, rebootRequired=None))
        self.assertEqual((verdict["security"], verdict["reboot"]), ("unknown", "unknown"))

    def test_offline_runner_and_expiring_certificate_and_old_backup(self):
        data = health()
        data["runners"][0]["status"] = "offline"
        data["certificates"] = [{"host": "a", "daysRemaining": 5}]
        data["backup"]["lastSuccessAgeHours"] = 80
        verdict = self.judge(data)
        self.assertEqual((verdict["runners"], verdict["certificates"], verdict["backup"], verdict["overall"]), ("critical",) * 4)

    def test_no_figures_means_no_assessment(self):
        self.assertEqual(console.assess(None, console.new_state(), settings(), NOW), {"overall": "unknown"})


class AlertTests(unittest.TestCase):
    def test_lowering_the_threshold_sends_exactly_one_warning_then_one_recovery(self):
        state, send = console.new_state(), Recorder()
        low = health(disk_free_gb=10)
        for minutes in range(0, 20, 5):
            cycle(state, settings(), low, send, NOW + minutes * 60)
        self.assertEqual([(e, c) for e, c, _ in send.sent], [("warning", "disk_low")])
        self.assertIn("10% free", send.sent[0][2])
        for minutes in range(20, 40, 5):
            cycle(state, settings(), health(disk_free_gb=40), send, NOW + minutes * 60)
        self.assertEqual([(e, c) for e, c, _ in send.sent], [("warning", "disk_low"), ("recovered", "disk_low")])
        self.assertEqual(state["alerts"], {})

    def test_security_updates_warn_only_after_the_waiting_limit(self):
        state, send = console.new_state(), Recorder()
        cycle(state, settings(), health(security=3), send, NOW)
        cycle(state, settings(), health(security=3), send, NOW + 6 * 86400)
        self.assertEqual(send.sent, [])
        cycle(state, settings(), health(security=3), send, NOW + 8 * 86400)
        cycle(state, settings(), health(security=3), send, NOW + 8 * 86400 + 300)
        self.assertEqual([(e, c) for e, c, _ in send.sent], [("warning", "security_overdue")])
        cycle(state, settings(), health(security=0), send, NOW + 9 * 86400)
        self.assertEqual([e for e, *_ in send.sent], ["warning", "recovered"])
        self.assertIsNone(state["securitySince"])

    def test_restart_warns_after_the_limit(self):
        state, send = console.new_state(), Recorder()
        cycle(state, settings(), health(reboot=True, reboot_days=2), send)
        self.assertEqual(send.sent, [])
        cycle(state, settings(), health(reboot=True, reboot_days=4), send)
        cycle(state, settings(), health(reboot=True, reboot_days=4), send)
        self.assertEqual([(e, c) for e, c, _ in send.sent], [("warning", "reboot_overdue")])

    def test_an_undelivered_warning_is_retried_not_forgotten(self):
        state, failing = console.new_state(), Recorder(ok=False)
        cycle(state, settings(), health(disk_free_gb=5), failing)
        self.assertEqual(state["alerts"], {})
        working = Recorder()
        cycle(state, settings(), health(disk_free_gb=5), working)
        self.assertEqual(len(working.sent), 1)
        self.assertIn("disk_low", state["alerts"])

    def test_a_warning_is_tracked_even_when_no_channel_is_available(self):
        state, send = console.new_state(), Recorder()
        cycle(state, settings(WEBHOOK_URL=""), health(disk_free_gb=5), send)
        self.assertIn("disk_low", state["alerts"])
        self.assertIn("advice", console.snapshot(state, settings(), NOW)["alerts"]["disk_low"])

    def test_delivery_rules(self):
        self.assertTrue(console.delivered([None]))
        self.assertFalse(console.delivered([False, True]))
        self.assertTrue(console.delivered([]))
        self.assertFalse(console.delivered([False, None]))

    def test_email_target_is_validated(self):
        self.assertEqual(settings().email_to, "administrators")
        self.assertEqual(settings(EMAIL_TO="Owner").email_to, "owner")
        with self.assertRaises(console.ConfigError):
            settings(EMAIL_TO="everyone")


class EmailTests(unittest.TestCase):
    def serve(self, status):
        seen = []

        class Handler(main.BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                seen.append((self.path, self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(status)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return seen, f"http://127.0.0.1:{server.server_address[1]}"

    def test_a_warning_is_emailed_with_the_app_key(self):
        seen, url = self.serve(200)
        conf = settings(API_BASE_URL=url)
        self.assertIs(main.send_email(conf, "disk_low", "disk space is low"), True)
        path, auth, body = seen[0]
        self.assertEqual((path, auth, body["to"], body["subject"]), ("/api/notify/email", "Bearer key", ["administrators"], "Disk space is low"))
        self.assertIn("docker system prune", body["text"])

    def test_refusals_mean_not_available_and_server_errors_mean_retry(self):
        for status, expected in ((403, None), (409, None), (404, None), (400, None), (429, None), (502, False)):
            _, url = self.serve(status)
            self.assertIs(main.send_email(settings(API_BASE_URL=url), "disk_low", "x"), expected, status)

    def test_off_or_missing_key_sends_nothing(self):
        seen, url = self.serve(200)
        self.assertIsNone(main.send_email(settings(API_BASE_URL=url, EMAIL_TO="off"), "disk_low", "x"))
        self.assertIsNone(main.send_email(settings(API_BASE_URL=url, APP_AUTOMATON_API_KEY=""), "disk_low", "x"))
        self.assertEqual(seen, [])


class AlertPermissionTests(unittest.TestCase):
    def test_nothing_is_recorded_or_sent_while_the_permission_is_not_approved(self):
        state, send = console.new_state(), Recorder()
        console.run_cycle(settings(), state, NOW, send, fetch=lambda _s: ("not_approved", None, "refused"))
        self.assertEqual((state["history"], send.sent, state["status"]), ([], [], "not_approved"))
        self.assertIsNone(console.snapshot(state, settings(), NOW)["health"])

    def test_a_revoked_permission_hides_the_last_figures(self):
        state = console.new_state()
        cycle(state, settings(), health(), Recorder())
        self.assertIsNotNone(console.snapshot(state, settings(), NOW)["health"])
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("not_approved", None, "refused"))
        self.assertIsNone(console.snapshot(state, settings(), NOW)["health"])


class ChannelTests(unittest.TestCase):
    def test_a_failed_channel_is_retried_without_resending_the_other(self):
        import tempfile
        env = {"API_BASE_URL": "http://127.0.0.1:9", "APP_AUTOMATON_API_KEY": "key", "WEBHOOK_URL": "https://hooks.example.com/x",
               "AUTOMATON_APP_DATA_DIR": tempfile.mkdtemp()}
        app = main.Console(env)
        hooks, mails = [], [False, True]
        original = (main.post_webhook, main.send_email)
        main.post_webhook = lambda url, payload: hooks.append(payload) or True
        main.send_email = lambda *args: mails.pop(0)
        try:
            self.assertFalse(app.send("warning", "disk_low", "x"))
            self.assertTrue(app.send("warning", "disk_low", "x"))
        finally:
            main.post_webhook, main.send_email = original
        self.assertEqual((len(hooks), mails, app.state["sent"]), (1, [], {}))


class SnapshotTests(unittest.TestCase):
    def test_revoking_hides_history_and_warnings_too(self):
        state = console.new_state()
        cycle(state, settings(), health(disk_free_gb=5), Recorder())
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("not_approved", None, "refused"))
        view = console.snapshot(state, settings(), NOW)
        self.assertEqual((view["health"], view["history"], view["alerts"]), (None, [], {}))

    def test_a_passing_error_keeps_the_last_figures_and_says_so(self):
        state = console.new_state()
        cycle(state, settings(), health(), Recorder())
        console.run_cycle(settings(), state, NOW + 300, Recorder(), fetch=lambda _s: ("error", None, "timeout"))
        view = console.snapshot(state, settings(), NOW + 300)
        self.assertIsNotNone(view["health"])
        self.assertEqual((view["status"], len(view["history"])), ("error", 1))


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        env = {"AUTOMATON_APP_DATA_DIR": self.directory.name, "API_BASE_URL": "https://api.example.com"}
        self.app = main.Console(env)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def get(self, path, token=None):
        request = urllib.request.Request(self.base + path, headers={"Authorization": f"Bearer {token}"} if token else {})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def test_health_and_static_files_are_public_and_data_is_not(self):
        self.assertEqual(self.get("/health"), (200, b"ok"))
        self.assertEqual(self.get("/")[0], 200)
        self.assertEqual(self.get("/ui/app.css")[0], 200)
        self.assertEqual(self.get("/dashboard.js")[0], 200)
        self.assertEqual(self.get("/console.py")[0], 404)
        self.assertEqual(self.get("/../main.py")[0], 404)

    def test_the_state_is_served_without_a_token_because_the_platform_signs_visitors_in(self):
        status, body = self.get("/api/state")
        self.assertEqual(status, 200)
        self.assertIsNone(json.loads(body)["health"])

    def test_status_reveals_only_the_permission_state(self):
        self.app.state["status"] = "not_approved"
        self.assertEqual(json.loads(self.get("/api/status")[1]), {"status": "not_approved"})


if __name__ == "__main__":
    unittest.main()
