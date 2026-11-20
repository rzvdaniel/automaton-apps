import io
import json
import os
import tempfile
from pathlib import Path
import threading
import unittest
from datetime import datetime, timezone
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import console
import homecard
import main

# No test may reach a real server: the backup and app sources answer nothing unless a test passes its own.
console.fetch_backups = lambda *_a, **_k: None
console.fetch_apps = lambda *_a, **_k: None

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


def cycle(state, conf, data, send, now=NOW, backups=None, apps=None):
    return console.run_cycle(conf, state, now, send, fetch=lambda _s: ("ok", data, None),
                             fetch_backup=lambda _s: backups, fetch_app=lambda _s: apps, fetch_security=lambda _s: None)


class SettingsTests(unittest.TestCase):
    def test_defaults_and_validation(self):
        conf = settings()
        self.assertEqual((conf.interval, conf.disk_free_percent, conf.security_days, conf.reboot_days), (300, 20, 7, 3))
        with self.assertRaises(console.ConfigError):
            settings(DISK_FREE_WARN_PERCENT="0")
        with self.assertRaises(console.ConfigError):
            settings(CHECK_INTERVAL_SECONDS="5")
        with self.assertRaises(console.ConfigError):
            settings(API_BASE_URL="ftp://x")


class AddressTests(unittest.TestCase):
    def test_server_provided_address_wins_and_old_setting_is_fallback(self):
        both = settings(AUTOMATON_API_URL="https://a.example.com/", API_BASE_URL="https://b.example.com")
        self.assertEqual(both.api_base_url, "https://a.example.com")
        self.assertEqual(settings().api_base_url, "https://api.example.com")
        self.assertEqual(settings(API_BASE_URL="", AUTOMATON_API_URL="https://a.example.com").api_base_url, "https://a.example.com")


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
        self.assertEqual(self.judge(health(disk_free_gb=8))["disk"], "critical")
        self.assertEqual(self.judge(health(disk_free_gb=19))["disk"], "warning")
        self.assertEqual(self.judge(health(disk_free_gb=21))["disk"], "ok")
        self.assertEqual(self.judge(health(disk_free_gb=8), DISK_FREE_WARN_PERCENT="10")["disk"], "warning")

    def test_the_disk_warns_above_80_percent_used_by_default(self):
        self.assertEqual(settings().disk_free_percent, 20)
        found = console.conditions(health(disk_free_gb=19), console.new_state(), settings(), NOW)
        self.assertTrue(found["disk_low"][0])
        self.assertFalse(console.conditions(health(disk_free_gb=21), console.new_state(), settings(), NOW)["disk_low"][0])

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

    def test_unknown_update_counts_never_make_the_overall_state_ok(self):
        verdict = self.judge(health(securityUpdates=None, updatesPending=None))
        self.assertEqual((verdict["updates"], verdict["overall"]), ("unknown", "unknown"))
        self.assertEqual(self.judge(health())["overall"], "ok")

    def test_the_dashboard_keeps_cleanup_figures_through_one_refused_read(self):
        script = (Path(__file__).parent / "dashboard.js").read_text()
        self.assertIn("cleanupRefusals >= 2", script)

    def test_offline_runner_and_expiring_certificate_and_old_backup(self):
        data = health()
        data["runners"][0]["status"] = "offline"
        data["certificates"] = [{"host": "a", "daysRemaining": 5}]
        data["backup"]["lastSuccessAgeHours"] = 80
        verdict = self.judge(data)
        self.assertEqual((verdict["runners"], verdict["certificates"], verdict["backup"], verdict["overall"]), ("critical",) * 4)

    def test_no_figures_means_no_assessment(self):
        self.assertEqual(console.assess(None, console.new_state(), settings(), NOW), {"overall": "unknown"})


class PageTests(unittest.TestCase):
    def test_the_page_uses_the_system_look_topbar_fonts_and_columns(self):
        here = os.path.dirname(os.path.abspath(__file__))
        page = open(os.path.join(here, "index.html"), encoding="utf-8").read()
        for needle in ('data-look="system"', 'class="a-topbar"', "fonts.googleapis.com/css2?family=Bricolage+Grotesque", 'href="console.css"'):
            self.assertIn(needle, page)
        script = open(os.path.join(here, "dashboard.js"), encoding="utf-8").read()
        for needle in ("class=\"cards\"", "a-banner", 'class="summary"'):
            self.assertIn(needle, script)


class AttentionTests(unittest.TestCase):
    def items(self, data, state=None, **env):
        state = state or console.new_state()
        console.record(state, data, NOW)
        conf = settings(**env)
        return console.attention(data, console.assess(data, state, conf, NOW), conf, NOW)

    def test_a_healthy_server_needs_nothing(self):
        self.assertEqual(self.items(health()), [])

    def test_one_restart_count_and_one_security_count(self):
        items = self.items(health(security=1, reboot=True, reboot_days=29))
        restart = next(i for i in items if i["title"] == "Restart the server.")
        self.assertIn("29 days", restart["detail"])
        self.assertEqual(restart["command"], "sudo reboot")
        self.assertEqual([i["title"] for i in items].count("Install 1 security update."), 1)
        self.assertEqual(items[0]["level"], "critical")

    def test_disk_above_80_percent_names_the_cleanup_command(self):
        item = self.items(health(disk_free_gb=19))[0]
        self.assertEqual((item["level"], item["command"]), ("warning", "docker image prune -a"))
        self.assertIn("81% of the disk is used", item["detail"])

    def test_security_wait_is_written_without_a_trailing_zero(self):
        state = console.new_state()
        state["securitySince"] = int(NOW - 3 * 86400)
        item = self.items(health(security=2), state)[0]
        self.assertIn("Waiting 3 days (warning", item["detail"])

    def test_grammar_and_offline_runner(self):
        data = health()
        data["runners"][0]["status"] = "offline"
        self.assertEqual(console.plural(1, "day"), "1 day")
        self.assertEqual(console.plural(2, "day"), "2 days")
        self.assertEqual([i["title"] for i in self.items(data)], ["A Runner is offline."])

    def test_every_card_in_warning_has_an_item_and_the_count_matches(self):
        data = health(disk_free_gb=19, security=2, reboot=True, reboot_days=5, memoryAvailableBytes=GB // 2, cpuPercent=90.0, updatesPending=30)
        data["server"]["updateAvailable"] = True
        data["runners"][0]["upgradeAvailable"] = True
        data["certificates"][0]["daysRemaining"] = 10
        data["backup"]["lastSuccessAgeHours"] = 40
        state = console.new_state()
        console.record(state, data, NOW)
        conf = settings()
        status = console.assess(data, state, conf, NOW)
        items = console.attention(data, status, conf, NOW)
        cards = {"server": "server", "runners": "runners", "updates": "updates", "resources": "resources", "backups": "backup", "certificates": "certificates"}
        raised = {name for name, key in cards.items() if status[key] in ("warning", "critical")}
        self.assertEqual(raised, set(cards))
        self.assertEqual({i["card"] for i in items}, raised)
        self.assertTrue(all(i["detail"] or i["command"] for i in items))
        self.assertEqual(len(items), len({(i["title"]) for i in items}))

    def test_a_runner_upgrade_alone_is_listed(self):
        data = health()
        data["runners"][0]["upgradeAvailable"] = True
        items = self.items(data)
        self.assertEqual([(i["title"], i["card"], i["level"]) for i in items], [("Upgrade a Runner.", "runners", "warning")])
        self.assertIn("main", items[0]["detail"])

    def test_many_pending_updates_are_listed(self):
        items = self.items(health(updatesPending=30))
        self.assertEqual([(i["title"], i["card"]) for i in items], [("Install 30 updates.", "updates")])

    def test_reclaimable_space_is_images_and_build_cache(self):
        free = console.reclaimable({"dockerImagesBytes": 3 * GB, "dockerBuildCacheBytes": GB, "dockerVolumesBytes": 5 * GB})
        self.assertEqual((free["freeable"], free["total"]), (4 * GB, 9 * GB))
        self.assertIsNone(console.reclaimable({})["freeable"])

    def test_the_page_receives_the_list_and_the_reclaimable_space(self):
        state = console.new_state()
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("ok", health(disk_free_gb=10, dockerImagesBytes=GB), None), fetch_security=lambda _s: None)
        shot = console.snapshot(state, settings(), NOW)
        self.assertEqual(shot["attention"][0]["command"], "docker image prune -a")
        self.assertEqual(shot["reclaim"]["freeable"], GB)


    def test_disk_by_app_lists_the_chosen_online_machine_largest_first(self):
        data = two_machines()
        data["runners"][0]["apps"] = [
            {"appId": "a", "appName": "small", "totalBytes": 10, "imageBytes": 4, "dataBytes": 6, "secret": "x"},
            {"appId": "b", "appName": "big", "totalBytes": 5 * GB, "imageBytes": GB, "dataBytes": 4 * GB, "logsBytes": None},
            "junk", {"appName": "no total"}]
        rows = console.app_disk(data["runners"][0])
        self.assertEqual([row["name"] for row in rows], ["big", "small"])
        self.assertNotIn("secret", rows[1])
        self.assertIsNone(rows[0]["logsBytes"])
        self.assertEqual(console.app_disk(None), [])
        self.assertEqual(console.app_disk({"name": "x", "status": "offline", "apps": data["runners"][0]["apps"]}), [])

    def test_unused_images_are_reported_next_to_the_reclaimable_space(self):
        self.assertEqual(console.reclaimable({"dockerUnusedImagesBytes": 7})["unused"], 7)
        self.assertIsNone(console.reclaimable({})["unused"])


def two_machines(**second):
    data = health()
    busy = dict(data["host"], diskAvailableBytes=10 * GB, cpuPercent=50.0, **second)
    data["runners"] = [
        {"name": "Production", "status": "online", "version": "1.0", "upgradeAvailable": False, "host": data["host"], "hostAgeSeconds": 60},
        {"name": "Runner-01", "status": "online", "version": "1.0", "upgradeAvailable": False, "host": busy, "hostAgeSeconds": 120},
        {"name": "Renamed Twice", "status": "offline", "version": "1.0", "upgradeAvailable": False, "host": busy, "hostAgeSeconds": 10800,
         "lastHeartbeatAtUtc": iso(10800)},
    ]
    return data


class MachineTests(unittest.TestCase):
    def snapshot(self, machine=None):
        state = console.new_state()
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("ok", two_machines(), None), fetch_security=lambda _s: None)
        return console.snapshot(state, settings(), NOW, machine)

    def test_each_machine_shows_its_own_figures_history_and_needs_you(self):
        first, second = self.snapshot("Production"), self.snapshot("Runner-01")
        self.assertEqual((first["health"]["host"]["diskAvailableBytes"], second["health"]["host"]["diskAvailableBytes"]), (60 * GB, 10 * GB))
        self.assertEqual((first["history"][0]["disk"], second["history"][0]["disk"]), (40.0, 90.0))
        self.assertEqual(first["machine"], "Production")
        self.assertNotIn("Free disk space.", [i["title"] for i in first["attention"]])
        self.assertIn("Free disk space.", [i["title"] for i in second["attention"]])

    def test_the_list_names_every_machine_and_defaults_to_the_freshest_online_one(self):
        shot = self.snapshot()
        self.assertEqual([m["name"] for m in shot["machines"]], ["Production", "Runner-01", "Renamed Twice"])
        self.assertEqual([m["online"] for m in shot["machines"]], [True, True, False])
        self.assertEqual(shot["machine"], "Production")
        self.assertEqual(self.snapshot("nobody")["machine"], "Production")

    def test_an_offline_machine_shows_no_figures_and_says_so(self):
        shot = self.snapshot("Renamed Twice")
        self.assertIsNone(shot["health"]["host"])
        self.assertEqual(shot["history"], [])
        self.assertEqual(shot["attention"][0]["title"], "Renamed Twice is offline.")
        self.assertEqual(shot["machines"][2]["hostAgeSeconds"], 10800)

    def test_a_server_without_per_runner_figures_still_shows_its_host(self):
        state = console.new_state()
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("ok", health(), None), fetch_security=lambda _s: None)
        shot = console.snapshot(state, settings(), NOW, "main")
        self.assertEqual(shot["health"]["host"]["diskAvailableBytes"], 60 * GB)
        self.assertEqual(len(shot["history"]), 1)

    def test_a_removed_runner_loses_its_history(self):
        state = console.new_state()
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("ok", two_machines(), None), fetch_security=lambda _s: None)
        data = two_machines()
        data["runners"] = data["runners"][:1]
        console.run_cycle(settings(), state, NOW + 300, Recorder(), fetch=lambda _s: ("ok", data, None), fetch_security=lambda _s: None)
        self.assertEqual(list(state["machines"]), ["Production"])


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
        self.assertIn("docker image prune -a", body["text"])

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
        console.run_cycle(settings(), state, NOW, send, fetch=lambda _s: ("not_approved", None, "refused"), fetch_security=lambda _s: None)
        self.assertEqual((state["history"], send.sent, state["status"]), ([], [], "not_approved"))
        self.assertIsNone(console.snapshot(state, settings(), NOW)["health"])

    def test_a_revoked_permission_hides_the_last_figures(self):
        state = console.new_state()
        cycle(state, settings(), health(), Recorder())
        self.assertIsNotNone(console.snapshot(state, settings(), NOW)["health"])
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("not_approved", None, "refused"), fetch_security=lambda _s: None)
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


class KeepFiguresTests(unittest.TestCase):
    def good(self):
        state = console.new_state()
        cycle(state, settings(), health(), Recorder())
        return state

    def failed(self, state, reply):
        console.run_cycle(settings(), state, NOW + 300, Recorder(), fetch=lambda _s: reply)
        return console.snapshot(state, settings(), NOW + 300)

    def test_every_failed_read_but_a_revoked_key_keeps_the_figures_and_says_why(self):
        for reply in [("error", None, "The server answered HTTP 502."), ("unavailable", None, "old server"), ("weird", None, None)]:
            view = self.failed(self.good(), reply)
            self.assertIsNotNone(view["health"], reply)
            self.assertEqual(view["failedAt"], NOW + 300)
            self.assertTrue(view["message"])
            self.assertEqual(view["fetchedAt"], NOW)

    def test_a_read_that_answers_without_figures_is_an_error_not_a_silent_ok(self):
        state = console.new_state()
        view = self.failed(state, ("ok", {}, None))
        self.assertEqual((view["status"], view["health"]), ("error", None))
        self.assertIn("without figures", view["message"])

    def test_the_next_good_read_clears_the_failure(self):
        state = self.good()
        self.failed(state, ("error", None, "timeout"))
        cycle(state, settings(), health(), Recorder())
        view = console.snapshot(state, settings(), NOW)
        self.assertEqual((view["status"], view["failedAt"], view["message"]), ("ok", None, None))

    def test_the_failure_survives_a_restart(self):
        state = self.good()
        self.failed(state, ("error", None, "timeout"))
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "state.json")
            console.save_state(path, state)
            view = console.snapshot(console.load_state(path), settings(), NOW + 300)
        self.assertEqual((view["status"], view["failedAt"], view["health"] is not None), ("error", NOW + 300, True))

    def test_an_empty_answer_is_read_as_an_error_with_the_http_code(self):
        class Response:
            status = 200
            def read(self, _n): return b"{}"
            def __enter__(self): return self
            def __exit__(self, *_a): return False
        class Opener:
            def open(self, _request, timeout=0): return Response()
        status, data, message = console.fetch_health(settings(), opener=Opener())
        self.assertEqual((status, data), ("error", None))
        self.assertIn("HTTP 200", message)


class SnapshotTests(unittest.TestCase):
    def test_revoking_hides_history_and_warnings_too(self):
        state = console.new_state()
        cycle(state, settings(), health(disk_free_gb=5), Recorder())
        console.run_cycle(settings(), state, NOW, Recorder(), fetch=lambda _s: ("not_approved", None, "refused"), fetch_security=lambda _s: None)
        view = console.snapshot(state, settings(), NOW)
        self.assertEqual((view["health"], view["history"], view["alerts"]), (None, [], {}))

    def test_a_passing_error_keeps_the_last_figures_and_says_so(self):
        state = console.new_state()
        cycle(state, settings(), health(), Recorder())
        console.run_cycle(settings(), state, NOW + 300, Recorder(), fetch=lambda _s: ("error", None, "timeout"), fetch_security=lambda _s: None)
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
        self.assertEqual(self.get("/console.css")[0], 200)
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


CLEANUP = {"settings": {"timeUtc": "05:00", "keepDays": 7, "journalLimitMb": 200}, "nextRunAtUtc": "2026-11-14T05:00:00Z",
           "runs": [{"result": "succeeded", "startedAtUtc": "2026-11-13T05:00:01.1234567Z", "bytesFreed": 1800000000, "runnerName": "main",
                     "trigger": "scheduled", "message": None}]}


class CleanupTests(unittest.TestCase):
    def test_warns_when_the_last_run_failed_or_is_older_than_two_days(self):
        now = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc).timestamp()
        self.assertIsNone(console.cleanup_warning(CLEANUP, now))
        self.assertIsNone(console.cleanup_warning({"runs": []}, now), "a server that never ran yet is not a warning")
        self.assertIn("more than two days", console.cleanup_warning(CLEANUP, now + 3 * 86400))
        failed = {"runs": [{"result": "failed", "message": "daemon down", "startedAtUtc": "2026-11-13T05:00:00Z"}]}
        self.assertEqual(console.cleanup_warning(failed, now), "The last cleanup failed: daemon down")

    def test_the_call_only_reads_with_the_key_and_maps_errors(self):
        class Opener:
            def __init__(self, error=None):
                self.error, self.requests = error, []

            def open(self, request, timeout=None):
                self.requests.append(request)
                if self.error:
                    raise urllib.error.HTTPError(request.full_url, self.error, "x", {}, io.BytesIO(b"{}"))
                return io.BytesIO(json.dumps(CLEANUP).encode())

        conf = settings()
        good = Opener()
        status, data, _ = console.cleanup_call(conf, opener=good)
        self.assertEqual((status, data["settings"]["keepDays"]), ("ok", 7))
        self.assertEqual((good.requests[0].method, good.requests[0].full_url), ("GET", "https://api.example.com/api/server/cleanup"))
        self.assertEqual(good.requests[0].get_header("Authorization"), "Bearer key")
        self.assertIsNone(good.requests[0].get_header("X-automaton-viewer-token"))
        for code, expected in [(401, "not_approved"), (403, "not_approved"), (404, "unavailable"), (500, "error")]:
            self.assertEqual(console.cleanup_call(conf, opener=Opener(code))[0], expected)
        self.assertEqual(console.cleanup_call(settings(APP_AUTOMATON_API_KEY=""))[0], "no_key")

    def test_the_studio_link_comes_from_the_setting_or_the_api_address(self):
        self.assertEqual(console.studio_server_url(settings(API_BASE_URL="https://api.example.com")), "https://studio.example.com/server")
        self.assertEqual(console.studio_server_url(settings(STUDIO_URL="https://studio.test.example/")), "https://studio.test.example/server")
        self.assertIsNone(console.studio_server_url(settings(API_BASE_URL="https://other.example.com")))
        self.assertEqual(console.studio_server_url(settings(), "https://studio.test.example"), "https://studio.test.example/server", "the server's answer beats the guess")
        self.assertEqual(console.studio_server_url(settings(), "javascript:alert(1)"), "https://studio.example.com/server")
        self.assertIsNone(console.studio_server_url(settings(API_BASE_URL="https://other.example.com", STUDIO_URL="javascript:alert(1)")))


class CleanupServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.calls = []
        outer = self

        def fake(settings_, **_):
            outer.calls.append("GET")
            return outer.reply

        self.reply = ("ok", dict(CLEANUP), None)
        self.original = console.cleanup_call
        console.cleanup_call = fake
        env = {"AUTOMATON_APP_DATA_DIR": self.directory.name, "API_BASE_URL": "https://api.example.com"}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(main.Console(env)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        console.cleanup_call = self.original
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, method, path, body=None):
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), method=method,
                                         headers={"Content-Type": "application/json", "X-Server-Console": "1"})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, None

    def test_the_card_data_is_read_with_a_studio_link_and_no_change_flag(self):
        status, body = self.request("GET", "/api/cleanup")
        self.assertEqual((status, body["status"], body["cleanup"]["settings"]["keepDays"]), (200, "ok", 7))
        self.assertEqual(body["cleanup"]["studioUrl"], "https://studio.example.com/server")
        self.assertNotIn("canChange", body["cleanup"])
        self.assertEqual(self.calls, ["GET"])

    def test_the_card_is_hidden_data_when_the_permission_is_missing(self):
        self.reply = ("not_approved", None, "nope")
        self.assertEqual(self.request("GET", "/api/cleanup")[0], 403)
        self.reply = ("unavailable", None, "old server")
        self.assertEqual(self.request("GET", "/api/cleanup")[0], 404)

    def test_the_app_offers_no_way_to_change_the_cleanup(self):
        for method, path in [("PUT", "/api/cleanup/settings"), ("POST", "/api/cleanup/run"), ("POST", "/api/cleanup")]:
            self.assertIn(self.request(method, path, {"keepDays": 3})[0], (404, 501))
        self.assertEqual(self.calls, [])


class MaintenanceTests(unittest.TestCase):
    RUNNER = "11111111-2222-3333-4444-555555555555"

    class Opener:
        def __init__(self, code=200, body=b"{}", error_body=b'{"error": "No."}'):
            self.code, self.body, self.error_body, self.requests = code, body, error_body, []

        def open(self, request, timeout=None):
            self.requests.append(request)
            if self.code != 200:
                raise urllib.error.HTTPError(request.full_url, self.code, "x", {}, io.BytesIO(self.error_body))
            return io.BytesIO(self.body)

    def test_the_cleanup_call_is_one_fixed_post_with_the_key_and_the_viewer_token(self):
        opener = self.Opener(body=b'{"id": "x"}')
        status, data, _ = console.start_cleanup(settings(), self.RUNNER, "viewer-token", opener=opener)
        self.assertEqual((status, data), ("ok", {"id": "x"}))
        request = opener.requests[0]
        self.assertEqual((request.method, request.full_url), ("POST", f"https://api.example.com/api/server/runners/{self.RUNNER}/cleanup"))
        self.assertEqual(request.get_header("X-automaton-viewer-token"), "viewer-token")
        self.assertTrue(request.get_header("Authorization").startswith("Bearer "))

    def test_nothing_but_a_guid_reaches_the_path(self):
        opener = self.Opener()
        for bad in ["../x", "a/b", "", self.RUNNER + "/../x", "x?y=1"]:
            self.assertEqual(console.start_cleanup(settings(), bad, "t", opener=opener)[0], "not_found")
            self.assertEqual(console.cleanup_run(settings(), self.RUNNER, bad, opener=opener)[0], "not_found")
        self.assertEqual(opener.requests, [])

    def test_the_servers_refusals_are_named(self):
        for code, expected in [(401, "not_approved"), (403, "forbidden"), (404, "not_found"), (409, "conflict"), (500, "error")]:
            status, _, message = console.start_cleanup(settings(), self.RUNNER, "t", opener=self.Opener(code))
            self.assertEqual(status, expected)
        self.assertEqual(console.start_cleanup(settings(), self.RUNNER, "t", opener=self.Opener(409))[2], "No.")
        self.assertEqual(console.start_cleanup(settings(APP_AUTOMATON_API_KEY=""), self.RUNNER, "t")[0], "no_key")

    TARGET = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    def test_logs_restart_and_disk_are_three_fixed_posts_with_the_viewer_token(self):
        for operation, lines, path in [
            ("logs", "50", f"/apps/{self.TARGET}/logs?lines=50"), ("logs", "5000", f"/apps/{self.TARGET}/logs?lines=100"),
            ("logs", "²", f"/apps/{self.TARGET}/logs?lines=100"), ("logs", "1; rm", f"/apps/{self.TARGET}/logs?lines=100"), ("restart", "1", f"/apps/{self.TARGET}/restart"), ("disk", "1", "/disk-report")]:
            opener = self.Opener(body=b"{}")
            self.assertEqual(console.app_operation(settings(), operation, self.RUNNER, self.TARGET, "vt", lines, opener=opener)[0], "ok")
            request = opener.requests[0]
            self.assertEqual((request.method, request.full_url), ("POST", f"https://api.example.com/api/server/runners/{self.RUNNER}{path}"))
            self.assertEqual(request.get_header("X-automaton-viewer-token"), "vt")

    def test_only_guids_and_known_operations_reach_the_path(self):
        opener = self.Opener()
        for runner, target, operation in [("../x", self.TARGET, "logs"), (self.RUNNER, "a/b", "logs"), (self.RUNNER, "", "restart"),
                                          (self.RUNNER, self.TARGET, "exec"), (self.RUNNER, self.TARGET, "shell")]:
            self.assertEqual(console.app_operation(settings(), operation, runner, target, "t", opener=opener)[0], "not_found")
        self.assertEqual(console.runner_apps(settings(), "x/../y", opener=opener)[0], "not_found")
        self.assertEqual(opener.requests, [])

    def test_machine_operations_send_only_the_two_fixed_names_with_the_typed_name(self):
        for operation in ("os-update", "reboot"):
            opener = self.Opener(body=b"{}")
            self.assertEqual(console.machine_operation(settings(), operation, self.RUNNER, "Runner-01", "vt", opener=opener)[0], "ok")
            request = opener.requests[0]
            self.assertEqual((request.method, request.full_url), ("POST", f"https://api.example.com/api/server/runners/{self.RUNNER}/{operation}"))
            self.assertEqual(json.loads(request.data), {"confirm": "Runner-01"})
            self.assertEqual(request.get_header("X-automaton-viewer-token"), "vt")
        opener = self.Opener()
        for runner, operation, confirm in [("../x", "reboot", "a"), (self.RUNNER, "shutdown", "a"), (self.RUNNER, "reboot", ""), (self.RUNNER, "reboot", None), (self.RUNNER, "os-update", "x" * 201)]:
            self.assertEqual(console.machine_operation(settings(), operation, runner, confirm, "t", opener=opener)[0], "not_found")
        self.assertEqual(opener.requests, [])

    def test_the_viewer_token_is_only_sent_with_the_one_change(self):
        opener = self.Opener(body=b"[]")
        console.maintenance_permissions(settings(), opener=opener)
        self.assertIsNone(opener.requests[0].get_header("X-automaton-viewer-token"))


class TaskCallTests(unittest.TestCase):
    RUNNER = MaintenanceTests.RUNNER
    Opener = MaintenanceTests.Opener

    def test_each_task_is_one_fixed_call_with_the_viewer_token(self):
        for call, method, path in [
            (lambda o: console.server_cleanup_run(settings(), "vt", opener=o), "POST", "/api/server/cleanup/run"),
            (lambda o: console.backup_run(settings(), "vt", opener=o), "POST", "/api/Install/backups/run"),
            (lambda o: console.runner_upgrade(settings(), self.RUNNER, "vt", opener=o), "POST", f"/api/server/runners/{self.RUNNER}/upgrade")]:
            opener = self.Opener(body=b"{}")
            self.assertEqual(call(opener)[0], "ok")
            request = opener.requests[0]
            self.assertEqual((request.method, request.full_url), (method, "https://api.example.com" + path))
            self.assertEqual(request.get_header("X-automaton-viewer-token"), "vt")

    def test_installing_os_updates_asks_for_security_updates_only_and_reads_the_result_without_the_token(self):
        opener = self.Opener(body=b"{}")
        self.assertEqual(console.os_updates_run(settings(), "vt", opener=opener)[0], "ok")
        request = opener.requests[0]
        self.assertEqual((request.method, request.full_url), ("POST", "https://api.example.com/api/Install/os-updates/run"))
        self.assertEqual(json.loads(request.data), {"scope": "security"})
        self.assertEqual(request.get_header("X-automaton-viewer-token"), "vt")
        opener = self.Opener(body=b"{}")
        console.os_updates_status(settings(), opener=opener)
        self.assertEqual((opener.requests[0].method, opener.requests[0].full_url), ("GET", "https://api.example.com/api/install/os-updates"))
        self.assertIsNone(opener.requests[0].get_header("X-automaton-viewer-token"))

    def test_a_server_without_the_endpoint_or_with_a_busy_host_is_named(self):
        self.assertEqual(console.os_updates_run(settings(), "vt", opener=self.Opener(404))[0], "not_found")
        self.assertEqual(console.os_updates_run(settings(), "vt", opener=self.Opener(403))[0], "forbidden")
        self.assertEqual(console.os_updates_run(settings(), "vt", opener=self.Opener(409))[0], "conflict")

    def test_the_servers_503_message_reaches_the_administrator(self):
        text = "Run sudo bash /opt/automaton-server/update.sh once on the server to enable it."
        status, _, message = console.os_updates_run(settings(), "vt", opener=self.Opener(503, error_body=json.dumps({"message": text}).encode()))
        self.assertEqual((status, message), ("error", text))
        self.assertEqual(console.os_updates_run(settings(), "vt", opener=self.Opener(503, error_body=b"not json"))[2], "The server answered HTTP 503.")

    def test_restarting_the_server_posts_the_time_with_the_viewer_token_and_reads_the_status_without_it(self):
        opener = self.Opener(body=b"{}")
        self.assertEqual(console.server_restart_run(settings(), "vt", "2026-11-21T01:00:00+01:00", opener=opener)[0], "ok")
        request = opener.requests[0]
        self.assertEqual((request.method, request.full_url), ("POST", "https://api.example.com/api/Install/restart/run"))
        self.assertEqual(json.loads(request.data), {"restartAtUtc": "2026-11-21T00:00:00Z"})
        self.assertEqual(request.get_header("X-automaton-viewer-token"), "vt")
        opener = self.Opener(body=b"{}")
        console.server_restart_run(settings(), "vt", opener=opener)
        self.assertEqual(json.loads(opener.requests[0].data), {"restartAtUtc": None})
        opener = self.Opener(body=b"{}")
        console.server_restart_status(settings(), opener=opener)
        self.assertEqual((opener.requests[0].method, opener.requests[0].full_url), ("GET", "https://api.example.com/api/install/restart"))
        self.assertIsNone(opener.requests[0].get_header("X-automaton-viewer-token"))

    def test_a_bad_restart_time_is_refused_before_any_call(self):
        opener = self.Opener(body=b"{}")
        for bad in ("tomorrow", 5, "x" * 50):
            self.assertEqual(console.server_restart_run(settings(), "vt", bad, opener=opener)[0], "error")
        self.assertEqual(opener.requests, [])

    def test_a_server_without_the_restart_endpoint_busy_or_refusing_is_named(self):
        self.assertEqual(console.server_restart_run(settings(), "vt", opener=self.Opener(404))[0], "not_found")
        self.assertEqual(console.server_restart_run(settings(), "vt", opener=self.Opener(403))[0], "forbidden")
        self.assertEqual(console.server_restart_run(settings(), "vt", opener=self.Opener(409))[0], "conflict")

    def test_reading_the_upgrade_sends_no_viewer_token(self):
        opener = self.Opener(body=b"{}")
        console.runner_upgrade(settings(), self.RUNNER, "vt", start=False, opener=opener)
        self.assertEqual(opener.requests[0].method, "GET")
        self.assertIsNone(opener.requests[0].get_header("X-automaton-viewer-token"))

    def test_only_a_guid_reaches_the_upgrade_path(self):
        opener = self.Opener()
        for bad in ["../x", "a/b", "", "x?y=1"]:
            self.assertEqual(console.runner_upgrade(settings(), bad, "t", opener=opener)[0], "not_found")
        self.assertEqual(opener.requests, [])

    def test_cleanup_settings_are_checked_and_only_the_three_fields_are_sent(self):
        good = {"timeUtc": "05:00", "keepDays": 7, "journalLimitMb": 200, "extra": "x"}
        opener = self.Opener(body=b"{}")
        self.assertEqual(console.server_cleanup_settings(settings(), good, "vt", opener=opener)[0], "ok")
        request = opener.requests[0]
        self.assertEqual((request.method, request.full_url), ("PUT", "https://api.example.com/api/server/cleanup/settings"))
        self.assertEqual(json.loads(request.data), {"timeUtc": "05:00", "keepDays": 7, "journalLimitMb": 200})
        opener = self.Opener()
        for bad in [None, [], {**good, "timeUtc": "25:00"}, {**good, "timeUtc": "5:00"}, {**good, "keepDays": 0}, {**good, "keepDays": 366},
                    {**good, "keepDays": "7"}, {**good, "keepDays": True}, {**good, "journalLimitMb": 49}, {**good, "journalLimitMb": 100001}]:
            self.assertEqual(console.server_cleanup_settings(settings(), bad, "vt", opener=opener)[0], "not_found")
        self.assertEqual(opener.requests, [])

    def test_a_refusal_is_named(self):
        self.assertEqual(console.backup_run(settings(), "vt", opener=self.Opener(403))[0], "forbidden")
        self.assertEqual(console.backup_run(settings(), "vt", opener=self.Opener(503))[0], "error")


class MaintenanceServerTests(unittest.TestCase):
    RUNNER = MaintenanceTests.RUNNER

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.seen = []
        outer = self
        self.original = console.maintain_call
        console.maintain_call = lambda settings_, method, path, token=None, **_: (outer.seen.append((method, path, token)) or ("ok", {"id": "r"}, None))
        env = {"AUTOMATON_APP_DATA_DIR": self.directory.name, "API_BASE_URL": "https://api.example.com"}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(main.Console(env)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        console.maintain_call = self.original
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def post(self, path, headers, data=b""):
        request = urllib.request.Request(self.base + path, data=data, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_a_post_needs_the_pages_header_and_passes_the_viewer_token_on(self):
        path = f"/api/maintenance/cleanup?runner={self.RUNNER}"
        self.assertEqual(self.post(path, {}), 404, "a form on another site cannot set the header")
        self.assertEqual(self.seen, [])
        self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}), 200)
        self.assertEqual(self.seen, [("POST", f"/api/server/runners/{self.RUNNER}/cleanup", "vt")])

    def test_logs_restart_and_disk_need_the_header_and_pass_the_token_on(self):
        target = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        for path, expected in [(f"/api/maintenance/logs?runner={self.RUNNER}&target={target}&lines=20", f"/api/server/runners/{self.RUNNER}/apps/{target}/logs?lines=20"),
                               (f"/api/maintenance/restart?runner={self.RUNNER}&target={target}", f"/api/server/runners/{self.RUNNER}/apps/{target}/restart"),
                               (f"/api/maintenance/disk?runner={self.RUNNER}", f"/api/server/runners/{self.RUNNER}/disk-report")]:
            self.seen.clear()
            self.assertEqual(self.post(path, {}), 404)
            self.assertEqual(self.seen, [])
            self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}), 200)
            self.assertEqual(self.seen, [("POST", expected, "vt")])

    def test_os_update_and_reboot_need_the_header_and_a_typed_name(self):
        for operation in ("os-update", "reboot"):
            path = f"/api/maintenance/{operation}?runner={self.RUNNER}"
            self.seen.clear()
            body = json.dumps({"confirm": "Runner-01"}).encode()
            self.assertEqual(self.post(path, {}, body), 404, "a form on another site cannot set the header")
            self.assertEqual(self.post(path, {"X-Server-Console": "1"}, b""), 404, "no typed name: nothing is sent")
            self.assertEqual(self.post(path, {"X-Server-Console": "1"}, b"{not json"), 404)
            self.assertEqual(self.seen, [])
            self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}, body), 200)
            self.assertEqual(self.seen, [("POST", f"/api/server/runners/{self.RUNNER}/{operation}", "vt")])

    def test_the_typed_name_in_a_header_is_enough_when_the_proxy_drops_the_body(self):
        for operation in ("os-update", "reboot"):
            path = f"/api/maintenance/{operation}?runner={self.RUNNER}"
            self.seen.clear()
            self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Confirm-Machine": "Runner-01"}, b""), 200)
            self.assertEqual(len(self.seen), 1)
            self.seen.clear()
            self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Confirm-Machine": ""}, b""), 404, "an empty name is refused")
            self.assertEqual(self.seen, [])

    def test_a_chunked_body_from_a_proxy_is_read_too(self):
        import http.client
        for operation in ("os-update", "reboot"):
            self.seen.clear()
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1])
            connection.putrequest("POST", f"/api/maintenance/{operation}?runner={self.RUNNER}")
            connection.putheader("X-Server-Console", "1")
            connection.putheader("Transfer-Encoding", "chunked")
            connection.endheaders()
            body = b'{"confirm":"Runner-01"}'
            connection.send(hex(len(body))[2:].encode() + b"\r\n" + body + b"\r\n0\r\n\r\n")
            self.assertEqual(connection.getresponse().status, 200)
            self.assertEqual(len(self.seen), 1)

    def test_only_the_cleanup_can_be_posted(self):
        self.assertEqual(self.post("/api/maintenance/exec?runner=x", {"X-Server-Console": "1"}), 404)
        self.assertEqual(self.post("/api/maintenance", {"X-Server-Console": "1"}), 404)


class BuildTests(unittest.TestCase):
    def test_the_build_copies_every_file_the_server_serves(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "automaton.json"), encoding="utf-8") as handle:
            script = json.load(handle)["application"]["build"]["command"]["arguments"][-1]
        for path, _ in main.STATIC.values():
            self.assertIn(os.path.basename(path), script, f"{path} is served but not copied into dist")


class TaskServerTests(MaintenanceServerTests):
    test_a_post_needs_the_pages_header_and_passes_the_viewer_token_on = None
    test_logs_restart_and_disk_need_the_header_and_pass_the_token_on = None
    test_os_update_and_reboot_need_the_header_and_a_typed_name = None
    test_the_typed_name_in_a_header_is_enough_when_the_proxy_drops_the_body = None

    def test_a_restart_post_without_its_time_never_reaches_the_server(self):
        headers = {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}
        self.seen.clear()
        self.assertEqual(self.post("/api/tasks/restart", {}), 404, "a form on another site cannot set the header")
        self.assertEqual(self.post("/api/tasks/restart", headers), 400, "a dropped body must not become a restart now")
        self.assertEqual(self.post("/api/tasks/restart", headers, b"not json"), 400)
        self.assertEqual(self.seen, [])
        self.assertEqual(self.post("/api/tasks/restart", headers, b'{"restartAtUtc": null}'), 200)
        self.assertEqual(self.seen, [("POST", "/api/Install/restart/run", "vt")])

    def test_a_task_post_needs_the_pages_header_and_passes_the_token_on(self):
        for path, expected in [("/api/tasks/cleanup-run", "/api/server/cleanup/run"), ("/api/tasks/backup", "/api/Install/backups/run"), ("/api/tasks/os-updates", "/api/Install/os-updates/run"),
                               (f"/api/tasks/upgrade?runner={self.RUNNER}", f"/api/server/runners/{self.RUNNER}/upgrade")]:
            self.seen.clear()
            self.assertEqual(self.post(path, {}), 404, "a form on another site cannot set the header")
            self.assertEqual(self.seen, [])
            self.assertEqual(self.post(path, {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}), 200)
            self.assertEqual(self.seen, [("POST", expected, "vt")])

    def test_settings_are_validated_before_the_server_is_asked(self):
        headers = {"X-Server-Console": "1", "X-Automaton-Viewer-Token": "vt"}
        self.assertEqual(self.post("/api/tasks/cleanup-settings", {}, b'{"timeUtc":"05:00","keepDays":7,"journalLimitMb":200}'), 404)
        self.assertEqual(self.post("/api/tasks/cleanup-settings", headers, b'{"timeUtc":"x","keepDays":7,"journalLimitMb":200}'), 404)
        self.assertEqual(self.post("/api/tasks/cleanup-settings", headers, b"{bad"), 404)
        self.assertEqual(self.seen, [])
        self.assertEqual(self.post("/api/tasks/cleanup-settings", headers, b'{"timeUtc":"05:00","keepDays":7,"journalLimitMb":200}'), 200)
        self.assertEqual(self.seen, [("PUT", "/api/server/cleanup/settings", "vt")])

    def test_the_role_header_decides_what_the_page_shows(self):
        for role, expected in [("administrator", True), ("user", False), (None, False)]:
            request = urllib.request.Request(self.base + "/api/tasks", headers={"X-Automaton-Viewer-Role": role} if role else {})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(json.loads(response.read()), {"admin": expected})


if __name__ == "__main__":
    unittest.main()


def backups_data(hours_ago=5, error=None, available=True):
    return {"available": available, "lastSuccessAt": iso(hours_ago * 3600), "lastError": error, "backups": [{"createdAt": iso(hours_ago * 3600)}]}


def offsite_app(status="Succeeded", hours_ago=3, name="Off-site Backup", **extra):
    run = None if hours_ago is None else {"moduleKey": "upload", "status": status, "createdAtUtc": iso(hours_ago * 3600)}
    return dict({"name": name, "liveStatus": "Running", "isPaused": False, "lastActionRun": run}, **extra)


class BackupWarningTests(unittest.TestCase):
    """Watchtower's two backup watchers, now Server Keeper warnings with the same send path as the others."""

    def conditions(self, backups=None, apps=None):
        return console.backup_conditions(backups, apps, NOW)

    def test_a_fresh_backup_and_run_are_quiet(self):
        found = self.conditions(backups_data(5), [offsite_app()])
        self.assertEqual({k: v[0] for k, v in found.items()}, {"backup_old": False, "backup_failed": False, "offsite_failed": False, "offsite_old": False})

    def test_an_old_server_backup_warns_after_26_hours_only(self):
        self.assertFalse(self.conditions(backups_data(25))["backup_old"][0])
        active, text = self.conditions(backups_data(27))["backup_old"]
        self.assertTrue(active)
        self.assertIn("27 hours old", text)

    def test_no_backup_at_all_warns(self):
        data = {"available": True, "lastSuccessAt": None, "backups": []}
        self.assertEqual(self.conditions(data)["backup_old"], (True, "no server backup exists"))

    def test_a_failed_server_backup_warns_and_carries_the_reason(self):
        active, text = self.conditions(backups_data(2, error="disk full"))["backup_failed"]
        self.assertTrue(active)
        self.assertIn("disk full", text)

    def test_a_server_that_reports_no_backups_judges_nothing(self):
        self.assertEqual(self.conditions(backups_data(100, available=False)), {})
        self.assertEqual(self.conditions(None, None), {})

    def test_catalog_app_name_backup_warden_is_found(self):
        found = self.conditions(None, [offsite_app("Failed", 30, name="Backup Warden")])
        self.assertTrue(found["offsite_failed"][0])
        self.assertTrue(found["offsite_old"][0])
        self.assertFalse(self.conditions(None, [offsite_app("Succeeded", 3, name="backup warden")])["offsite_old"][0])

    def test_offsite_failed_old_and_never_run(self):
        self.assertTrue(self.conditions(None, [offsite_app("Failed", 1)])["offsite_failed"][0])
        self.assertTrue(self.conditions(None, [offsite_app("TimedOut", 1)])["offsite_failed"][0])
        self.assertTrue(self.conditions(None, [offsite_app("Succeeded", 30)])["offsite_old"][0])
        never = self.conditions(None, [offsite_app(hours_ago=None)])
        self.assertTrue(never["offsite_old"][0])
        self.assertFalse(never["offsite_failed"][0])

    def test_no_offsite_app_judges_nothing(self):
        self.assertEqual(self.conditions(None, [offsite_app(name="Website Monitor")]), {})

    def test_warning_goes_through_the_normal_send_once_and_recovers(self):
        state, send = console.new_state(), Recorder()
        for minutes in (0, 5, 10):
            cycle(state, settings(), health(), send, NOW + minutes * 60, backups=backups_data(2, error="boom"))
        self.assertEqual([(e, c) for e, c, _ in send.sent], [("warning", "backup_failed")])
        self.assertTrue(send.sent[0][2].startswith("Server Keeper warning: "))
        cycle(state, settings(), health(), send, NOW + 900, backups=backups_data(2))
        self.assertEqual([(e, c) for e, c, _ in send.sent][-1], ("recovered", "backup_failed"))

    def test_a_source_that_cannot_be_read_keeps_the_warning(self):
        state, send = console.new_state(), Recorder()
        cycle(state, settings(), health(), send, NOW, apps=[offsite_app("Failed", 1)])
        cycle(state, settings(), health(), send, NOW + 300, apps=None)
        self.assertEqual([e for e, *_ in send.sent], ["warning"])
        self.assertIn("offsite_failed", state["alerts"])

    def test_every_new_condition_has_advice_and_an_email_subject(self):
        for name in ("backup_old", "backup_failed", "offsite_old", "offsite_failed"):
            self.assertIn(name, console.CONDITIONS)
            self.assertTrue(console.ADVICE[name])
            self.assertIn(name, main.EMAIL_SUBJECTS)

    def test_the_fetchers_return_none_when_unreadable(self):
        class Opener:
            def open(self, request, timeout=0):
                raise urllib.error.URLError("down")
        self.assertIsNone(console.fetch_backups(settings(), opener=Opener()))
        self.assertIsNone(console.fetch_apps(settings(), opener=Opener()))
        self.assertIsNone(console.fetch_backups(console.Settings({}), opener=Opener()))


def card_for(data=None, found=None, failing=None, status="ok", **extra):
    state = console.new_state()
    state.update(health=data, status=status, fetchedAt=int(NOW) - 120, found=found or {}, failingApps=failing, **extra)
    return homecard.build_card(state, NOW)


def alerts_of(card):
    return [(a["severity"], a["text"]) for a in card.get("alerts", [])]


class HomeCardTests(unittest.TestCase):
    schema = None

    @classmethod
    def setUpClass(cls):
        import jsonschema
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "testdata", "home-card.schema.json")
        with open(path, encoding="utf-8") as handle:
            cls.schema = json.load(handle)
        cls.jsonschema = jsonschema

    def valid(self, card):
        self.jsonschema.Draft202012Validator(self.schema).validate(card)
        self.assertLessEqual(len(card["blocks"]), 6)
        self.assertLessEqual(len(card["alerts"]) if "alerts" in card else 0, 5)
        return card

    def test_a_healthy_server_is_all_good_and_valid(self):
        card = self.valid(card_for(health(disk_free_gb=60)))
        self.assertEqual((card["status"], card["tone"]), ("All good", "ok"))
        self.assertEqual(card["alerts"], [])
        self.assertEqual(card["detail"], "Checked 2 min ago")
        meter = card["blocks"][0]
        self.assertEqual(meter, {"type": "meter", "label": "Disk", "value": 40.0, "max": 100, "unit": "%", "warnAt": 85, "critAt": 95})
        self.assertEqual(card["blocks"][1], {"type": "badge", "label": "Last backup", "text": "5 h ago", "tone": "ok"})
        self.assertEqual(card["blocks"][2], {"type": "fact", "label": "Automaton", "value": "0.2.6"})
        self.assertEqual(card["blocks"][-1], {"type": "buttons", "items": [{"label": "Update", "path": "/#server"}, {"label": "Backups", "path": "/#backups"}]})

    def test_disk_thresholds(self):
        self.assertEqual(alerts_of(card_for(health(disk_free_gb=15))), [])  # 85% exactly is not above 85
        self.assertEqual(alerts_of(card_for(health(disk_free_gb=14))), [("warning", "The disk is 86% full.")])
        self.assertEqual(alerts_of(card_for(health(disk_free_gb=5))), [("warning", "The disk is 95% full.")])  # 95% exactly is not above 95
        self.assertEqual(alerts_of(card_for(health(disk_free_gb=4)))[0][0], "critical")
        warn = self.valid(card_for(health(disk_free_gb=10)))
        self.assertEqual((warn["status"], warn["tone"]), ("Needs attention", "warning"))

    def test_backup_failed_is_critical_with_a_failed_badge(self):
        card = self.valid(card_for(health(), found={"backup_failed": True}))
        self.assertEqual(alerts_of(card)[0][0], "critical")
        self.assertEqual((card["status"], card["tone"]), ("Needs attention now", "critical"))
        self.assertEqual(card["blocks"][1]["text"], "Failed")
        self.assertEqual(card["blocks"][1]["tone"], "critical")

    def test_old_backup_and_offsite_are_critical(self):
        card = self.valid(card_for(health(), found={"backup_old": True, "offsite_failed": True, "offsite_old": True}))
        self.assertEqual({s for s, _ in alerts_of(card)}, {"critical"})
        self.assertEqual(len(card["alerts"]), 3)
        self.assertEqual(card["blocks"][1]["tone"], "critical")

    def test_runner_offline_failing_apps_and_update(self):
        data = health()
        data["runners"] = [{"name": "secret-host-1", "status": "offline"}, {"name": "secret-host-2", "status": "Online"}]
        data["server"] = {"version": "0.2.6", "latestVersion": "0.2.7", "updateAvailable": True}
        card = self.valid(card_for(data, failing=2))
        self.assertEqual(alerts_of(card), [("warning", "A Runner is offline."), ("warning", "2 apps are failing."),
                                           ("info", "A newer Automaton release is available.")])
        self.assertIn({"type": "badge", "label": "Update", "text": "0.2.7", "tone": "info"}, card["blocks"])
        self.assertEqual(len(card["blocks"]), 5)

    def test_update_alone_is_info_and_the_card_stays_all_good(self):
        data = health()
        data["server"] = {"version": "0.2.6", "latestVersion": "0.2.7", "updateAvailable": True}
        card = self.valid(card_for(data))
        self.assertEqual((card["status"], card["tone"]), ("All good", "ok"))
        self.assertEqual(alerts_of(card), [("info", "A newer Automaton release is available.")])

    def test_alerts_are_sorted_worst_first_and_capped_at_five(self):
        data = health(disk_free_gb=2)
        data["runners"] = [{"name": "a", "status": "offline"}]
        data["server"] = {"version": "1", "latestVersion": "2", "updateAvailable": True}
        found = {k: True for k in ("backup_failed", "backup_old", "offsite_failed", "offsite_old", "security_overdue", "reboot_overdue")}
        card = self.valid(card_for(data, found=found, failing=1))
        self.assertEqual(len(card["alerts"]), 5)
        self.assertEqual([a["severity"] for a in card["alerts"]], ["critical"] * 5)
        self.assertEqual(card["alerts"][0]["text"], "The last server backup failed. Open Server Keeper for details.")

    def test_the_fail2ban_line_shows_on_with_todays_bans(self):
        card = self.valid(card_for(health(), fail2ban={"running": True, "banned": 12}))
        self.assertIn({"type": "badge", "label": "fail2ban", "text": "on · 12 banned in 24 h", "tone": "ok"}, card["blocks"])
        self.assertEqual((card["status"], alerts_of(card)), ("All good", []))

    def test_fail2ban_off_warns(self):
        card = self.valid(card_for(health(), fail2ban={"running": False, "banned": 0}))
        self.assertIn({"type": "badge", "label": "fail2ban", "text": "off", "tone": "warning"}, card["blocks"])
        self.assertEqual((card["tone"], alerts_of(card)), ("warning", [("warning", "fail2ban is not running.")]))

    def test_without_security_read_there_is_no_fail2ban_line(self):
        card = self.valid(card_for(health(), fail2ban=None))
        self.assertNotIn("fail2ban", json.dumps(card))

    def test_fail2ban_is_read_only_when_reported_and_never_invented(self):
        class Opener:
            def __init__(self, body): self.body = body
            def open(self, request, timeout=0):
                self.url = request.full_url
                return io.BytesIO(json.dumps(self.body).encode())
        conf = settings()
        ok = Opener({"reported": True, "running": True, "bannedLast24Hours": 7})
        self.assertEqual(console.fetch_fail2ban(conf, opener=ok), {"running": True, "banned": 7})
        self.assertTrue(ok.url.endswith("/api/server/security/fail2ban"))
        self.assertIsNone(console.fetch_fail2ban(conf, opener=Opener({"reported": False, "running": None})))

    def test_the_card_holds_no_server_details(self):
        data = health(osName="Ubuntu 24.04 LTS")
        data["runners"] = [{"name": "prod-runner-77", "status": "offline"}]
        data["certificates"] = [{"host": "studio.example.com", "daysRemaining": 1}]
        card = card_for(data, found={"backup_failed": True}, failing=1, message="secret path /var/lib/x")
        text = json.dumps(card)
        for secret in ("prod-runner-77", "studio.example.com", "Ubuntu", "/var/lib", "api.example.com"):
            self.assertNotIn(secret, text)

    def test_without_figures_it_says_why(self):
        waiting = self.valid(card_for(None, status="not_approved"))
        self.assertEqual((waiting["status"], waiting["tone"]), ("Waiting for approval", "info"))
        none = self.valid(card_for(None, status="starting"))
        self.assertEqual(none["status"], "No figures yet")

    def test_no_backup_data_and_unknown_disk(self):
        data = health()
        data["backup"] = {"available": False}
        del data["host"]["diskTotalBytes"]
        card = self.valid(card_for(data))
        self.assertEqual(card["blocks"][0]["label"], "Last backup")
        self.assertEqual(card["blocks"][0]["text"], "Unknown")

    def test_a_failed_last_check_is_said_in_the_detail(self):
        self.assertIn("the last check failed", card_for(health(), status="error")["detail"])

    def test_texts_stay_inside_the_schema_limits_for_long_values(self):
        data = health()
        data["server"] = {"version": "v" * 300, "latestVersion": "x" * 300, "updateAvailable": True}
        self.valid(card_for(data))


class HomeCardEndpointTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        app = main.Console({"AUTOMATON_APP_DATA_DIR": self.directory.name, "API_BASE_URL": "https://api.example.com"})
        app.state.update(health=health(), status="ok", fetchedAt=int(NOW))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def test_the_endpoint_serves_the_card_and_ignores_viewer_headers(self):
        for headers in ({}, {"X-Automaton-Viewer-Role": "administrator"}):
            request = urllib.request.Request(self.base + "/api/home-card", headers=headers)
            with urllib.request.urlopen(request) as response:
                card = json.loads(response.read())
            self.assertEqual(card["status"], "All good")
            self.assertNotIn("host", json.dumps(card).lower().replace("hostname", ""))


class RenameTests(unittest.TestCase):
    def test_the_app_is_named_server_keeper_everywhere_users_look(self):
        here = os.path.dirname(os.path.abspath(__file__))
        manifest = json.load(open(os.path.join(here, "automaton.json"), encoding="utf-8"))
        self.assertEqual(manifest["name"], "Server Keeper")
        self.assertEqual(manifest["summary"], "Live stats, alerts and one-click maintenance for this server.")
        for permission in ("server:read", "notify:email", "backups:read", "apps:read-status"):
            self.assertIn(permission, manifest["application"]["permissions"])
        self.assertIn("homecard.py", json.dumps(manifest["application"]["build"]))
        for name in ("index.html", "dashboard.js", "README.md", "console.css"):
            text = open(os.path.join(here, name), encoding="utf-8").read()
            if name != "README.md":
                self.assertNotIn("Server Console", text, name)
        readme = open(os.path.join(here, "README.md"), encoding="utf-8").read()
        self.assertIn("## Run it on its own", readme)
        self.assertIn("needs an automaton server", readme.lower().replace("**", ""))
        self.assertEqual(console.USER_AGENT, "Automaton-Server-Keeper/1.0")

    def test_the_catalog_keeps_the_id_and_drops_watchtower(self):
        root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        folders = [a["folder"] for a in json.load(open(os.path.join(root, "catalog-apps.json"), encoding="utf-8"))["apps"]]
        self.assertIn("maintenance/server-console", folders)
        self.assertNotIn("maintenance/watchtower", folders)
        self.assertFalse(os.path.exists(os.path.join(root, "maintenance", "watchtower", "automaton.json")))
