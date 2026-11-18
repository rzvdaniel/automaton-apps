from datetime import datetime, timezone
import http.server
import os
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest
from unittest import mock

import main
import monitor
from monitor import ConfigError, Result, Site


class ParseSites(unittest.TestCase):
    def test_parses_urls_status_and_keyword(self):
        sites = monitor.parse_legacy_sites("https://a.example\nhttps://b.example/x|301;# comment\nhttps://c.example|200|Hello world\n\n")
        self.assertEqual(sites, [Site("https://a.example"), Site("https://b.example/x", 301),
                                 Site("https://c.example", 200, "Hello world")])

    def test_make_site_rejects_bad_entries(self):
        for url, status in [("", ""), ("ftp://a.example", ""), ("a.example", ""), ("https://a.example", "abc"), ("https://a.example", "99")]:
            with self.assertRaises(ConfigError, msg=url + status):
                monitor.make_site(url, status)
        self.assertEqual(monitor.make_site(" https://a.example ", "", " "), Site("https://a.example"))

    def test_legacy_import_skips_invalid_duplicates_and_extras(self):
        text = "bad\nhttps://a.example|200\nhttps://a.example\n" + "\n".join(f"https://s{i}.example" for i in range(60))
        sites = monitor.parse_legacy_sites(text)
        self.assertEqual(sites[0], Site("https://a.example", 200))
        self.assertEqual(len(sites), monitor.MAX_SITES)

    def test_display_url_hides_credentials_and_query(self):
        self.assertEqual(monitor.display_url("https://user:pw@a.example:8443/p?token=abc#x"), "https://a.example:8443/p")


class Certificate(unittest.TestCase):
    def make_der(self, not_after: bytes, tag=0x18):
        def tlv(t, body):
            return bytes([t, len(body)]) + body
        validity = tlv(0x30, tlv(tag, b"20260101000000Z" if tag == 0x18 else b"260101000000Z") + tlv(tag, not_after))
        tbs = tlv(0x30, tlv(0xA0, tlv(0x02, b"\x02")) + tlv(0x02, b"\x01") + tlv(0x30, b"") + tlv(0x30, b"") + validity + tlv(0x30, b""))
        return tlv(0x30, tbs + tlv(0x30, b"") + tlv(0x03, b"\x00"))

    def test_reads_generalized_and_utc_time(self):
        expected = datetime(2026, 3, 4, 5, 6, 7, tzinfo=timezone.utc)
        self.assertEqual(monitor.certificate_not_after(self.make_der(b"20260304050607Z")), expected)
        self.assertEqual(monitor.certificate_not_after(self.make_der(b"260304050607Z", tag=0x17)), expected)

    @unittest.skipUnless(shutil.which("openssl"), "openssl not installed")
    def test_reads_the_certificate_a_server_presents(self):
        with tempfile.TemporaryDirectory() as folder:
            key, crt = os.path.join(folder, "k.pem"), os.path.join(folder, "c.pem")
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt,
                            "-days", "10", "-subj", "/CN=localhost"], check=True, capture_output=True)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(crt, key)
            listener = socket.create_server(("127.0.0.1", 0))
            def serve():
                for _ in range(1):
                    connection, _ = listener.accept()
                    try:
                        context.wrap_socket(connection, server_side=True).close()
                    except OSError:
                        pass
            threading.Thread(target=serve, daemon=True).start()
            days = monitor.certificate_days_left("127.0.0.1", listener.getsockname()[1], 5)
            listener.close()
        self.assertIn(days, (9, 10))

    def test_rejects_garbage(self):
        with self.assertRaises((ValueError, IndexError)):
            monitor.certificate_not_after(b"\x30\x03\x01\x01")


def fetch_returning(*outcomes):
    queue = list(outcomes)
    def fetch(url, timeout, want_body):
        outcome = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome
    return fetch


class CheckSite(unittest.TestCase):
    def check(self, site, *outcomes, cert=lambda *a: None):
        return monitor.check_site(site, fetch=fetch_returning(*outcomes), cert=cert, sleep=lambda s: None)

    def test_up_on_2xx_and_3xx_range(self):
        result = self.check(Site("http://a.example"), (200, b""))
        self.assertTrue(result.ok)
        self.assertEqual(result.status, 200)

    def test_down_on_500_and_expected_status_mismatch(self):
        self.assertEqual(self.check(Site("http://a.example"), (503, b"")).error, "HTTP 503")
        self.assertEqual(self.check(Site("http://a.example", 301), (200, b"")).error, "HTTP 200, expected 301")
        self.assertTrue(self.check(Site("http://a.example", 404), (404, b"")).ok)

    def test_keyword(self):
        site = Site("http://a.example", None, "Welcome")
        self.assertTrue(self.check(site, (200, b"<h1>Welcome home</h1>")).ok)
        self.assertEqual(self.check(site, (200, b"<h1>Oops</h1>")).error, "keyword 'Welcome' not found")

    def test_retries_once_before_failing(self):
        self.assertTrue(self.check(Site("http://a.example"), OSError("reset"), (200, b"")).ok)
        self.assertFalse(self.check(Site("http://a.example"), OSError("reset")).ok)

    def test_connection_errors_are_described(self):
        self.assertEqual(self.check(Site("http://a.example"), ConnectionRefusedError()).error, "connection refused")
        self.assertEqual(self.check(Site("http://a.example"), TimeoutError()).error, "timed out")

    def test_expired_certificate_fails_the_check(self):
        result = self.check(Site("https://a.example"), (200, b""), cert=lambda *a: -3)
        self.assertFalse(result.ok)
        self.assertEqual(result.error, "certificate expired 3 days ago")
        self.assertEqual(result.cert_days, -3)

    def test_soon_expiring_certificate_still_up(self):
        result = self.check(Site("https://a.example"), (200, b""), cert=lambda *a: 5)
        self.assertTrue(result.ok)
        self.assertEqual(result.cert_days, 5)


class Decide(unittest.TestCase):
    UP, DOWN = Result(True, 200, 50), Result(False, error="HTTP 500")

    def test_first_run_up_is_silent_first_run_down_alerts(self):
        self.assertEqual(monitor.decide(None, self.UP, 1, 14)[1], [])
        self.assertEqual(monitor.decide(None, self.DOWN, 1, 14)[1], ["down"])

    def test_one_alert_per_outage_then_one_recovery(self):
        state, events = monitor.decide(None, self.DOWN, 1, 14)
        self.assertEqual(events, ["down"])
        monitor.confirm(state, "down")
        for t in (2, 3, 4):
            state, events = monitor.decide(state, self.DOWN, t, 14)
            self.assertEqual(events, [])
        state, events = monitor.decide(state, self.UP, 5, 14)
        self.assertEqual(events, ["recovered"])
        monitor.confirm(state, "recovered")
        self.assertEqual(monitor.decide(state, self.UP, 6, 14)[1], [])

    def test_undelivered_alert_is_retried(self):
        state, events = monitor.decide(None, self.DOWN, 1, 14)
        state, events = monitor.decide(state, self.DOWN, 2, 14)   # not confirmed: webhook failed
        self.assertEqual(events, ["down"])

    def test_flap_without_alert_sends_nothing(self):
        state, _ = monitor.decide(None, self.UP, 1, 14)
        state, events = monitor.decide(state, self.UP, 2, 14)
        self.assertEqual(events, [])

    def test_certificate_warning_once_and_cleared_after_renewal(self):
        soon = Result(True, 200, 5, cert_days=9)
        state, events = monitor.decide(None, soon, 1, 14)
        self.assertEqual(events, ["cert_warning"])
        monitor.confirm(state, "cert_warning")
        state, events = monitor.decide(state, Result(True, 200, 5, cert_days=8), 2, 14)
        self.assertEqual(events, [])
        state, events = monitor.decide(state, Result(True, 200, 5, cert_days=89), 3, 14)
        self.assertEqual(events, ["cert_ok"])
        monitor.confirm(state, "cert_ok")
        self.assertFalse(state["cert_alerted"])

    def test_since_changes_only_when_status_changes(self):
        state, _ = monitor.decide(None, self.UP, 10, 14)
        state, _ = monitor.decide(state, self.UP, 20, 14)
        self.assertEqual(state["since"], 10)
        state, _ = monitor.decide(state, self.DOWN, 30, 14)
        self.assertEqual(state["since"], 30)


class RunCycle(unittest.TestCase):
    def test_sends_exactly_one_alert_and_one_recovery_across_cycles(self):
        sent, outcomes = [], {"ok": False}
        check = lambda site, timeout: Result(True, 200, 5) if outcomes["ok"] else Result(False, error="HTTP 500")
        send = lambda event, text, site: sent.append((event, text)) or True
        sites, state = [Site("https://a.example/?token=secret")], {}
        for _ in range(4):
            state = monitor.run_cycle(sites, state, 14, 5, send, check=check)
        outcomes["ok"] = True
        for _ in range(3):
            state = monitor.run_cycle(sites, state, 14, 5, send, check=check)
        self.assertEqual([e for e, _ in sent], ["down", "recovered"])
        self.assertTrue(all("secret" not in text for _, text in sent))

    def test_failed_delivery_retries_next_cycle(self):
        calls = []
        def send(event, text, site):
            calls.append(event)
            return len(calls) > 1
        check = lambda site, timeout: Result(False, error="HTTP 500")
        sites, state = [Site("https://a.example")], {}
        state = monitor.run_cycle(sites, state, 14, 5, send, check=check)
        state = monitor.run_cycle(sites, state, 14, 5, send, check=check)
        state = monitor.run_cycle(sites, state, 14, 5, send, check=check)
        self.assertEqual(calls, ["down", "down"])

    def test_email_helpers(self):
        self.assertIsNone(main.send_email("", "", ["administrators"], "s", "t"))
        self.assertIsNone(main.send_email("http://api.example", "", ["administrators"], "s", "t"))
        self.assertEqual(main.email_recipients("owner; a@example.test"), ["owner", "a@example.test"])
        self.assertEqual(main.email_recipients(" "), ["administrators"])
        self.assertTrue(main.deliver([None]))
        self.assertTrue(main.deliver([False, True]))
        self.assertFalse(main.deliver([False, None]))

    def test_email_and_optional_heartbeat_settings(self):
        settings = main.Settings({})
        self.assertEqual((settings.heartbeat, settings.api_key, settings.email_to), ("", "", ["administrators"]))

    def test_removed_sites_leave_the_state(self):
        check = lambda site, timeout: Result(True, 200, 5)
        state = monitor.run_cycle([Site("https://a.example"), Site("https://b.example")], {}, 14, 5, lambda *a: True, check=check)
        state = monitor.run_cycle([Site("https://b.example")], state, 14, 5, lambda *a: True, check=check)
        self.assertEqual(list(state), ["https://b.example"])


class StateFile(unittest.TestCase):
    def test_round_trip_and_corrupt_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "sub", "state.json")
            self.assertEqual(monitor.load_state(path), {})
            monitor.save_state(path, {"a": {"up": True}})
            self.assertEqual(monitor.load_state(path), {"a": {"up": True}})
            with open(path, "w") as handle:
                handle.write("{broken")
            self.assertEqual(monitor.load_state(path), {})


class Receiver(http.server.BaseHTTPRequestHandler):
    hits = []
    def do_POST(self):
        Receiver.hits.append(("POST", self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200); self.end_headers()
    def do_GET(self):
        Receiver.hits.append(("GET", b""))
        self.send_response(200); self.end_headers()
    def log_message(self, *args): pass


class AppRun(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(monitor, "RETRY_DELAY", 0)
        patcher.start(); self.addCleanup(patcher.stop)
        Receiver.hits = []
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.folder = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.folder.cleanup()

    def env(self, **extra):
        return {"SITES": self.base + "/site", "WEBHOOK_URL": self.base + "/hook/SECRET", "HEARTBEAT_URL": self.base + "/ping/SECRET",
                "AUTOMATON_APP_DATA_DIR": self.folder.name, **extra}

    def test_good_run_pings_heartbeat_and_crashed_run_does_not(self):
        with mock.patch.dict(os.environ, self.env(), clear=True):
            app = main.Monitor()
            self.assertTrue(app.run_once())
        self.assertEqual([m for m, _ in Receiver.hits].count("GET"), 2)  # the site check and the heartbeat
        Receiver.hits.clear()
        with mock.patch.dict(os.environ, self.env(CHECK_INTERVAL_SECONDS="5"), clear=True):
            app = main.Monitor()
            self.assertFalse(app.run_once())
        self.assertEqual(Receiver.hits, [])
        self.assertIn("CHECK_INTERVAL_SECONDS", app.last_error)

    def test_webhook_gets_text_and_content_and_secret_stays_out_of_output(self):
        import contextlib, io, json
        out = io.StringIO()
        with mock.patch.dict(os.environ, self.env(SITES="http://127.0.0.1:1/x"), clear=True), contextlib.redirect_stdout(out):
            main.Monitor().run_once()
        body = json.loads([b for m, b in Receiver.hits if m == "POST"][0])
        self.assertTrue(body["text"].startswith("DOWN: http://127.0.0.1:1/x"))
        self.assertEqual(body["text"], body["content"])
        self.assertNotIn("SECRET", out.getvalue())

    def test_state_survives_restart_so_no_second_alert(self):
        with mock.patch.dict(os.environ, self.env(SITES="http://127.0.0.1:1/x"), clear=True):
            main.Monitor().run_once()
            main.Monitor().run_once()
        self.assertEqual([m for m, _ in Receiver.hits].count("POST"), 1)

    def test_settings_validation(self):
        for bad in ({"CHECK_INTERVAL_SECONDS": "5"}, {"CERT_WARN_DAYS": "x"}, {"TIMEOUT_SECONDS": "0"}):
            with self.assertRaises(ConfigError):
                main.Settings(bad)
        settings = main.Settings({})
        self.assertEqual((settings.interval, settings.warn_days, settings.timeout), (300, 14, 10))

    def test_status_page_escapes_and_hides_query(self):
        snapshot = {"lastRun": 0, "lastError": "<b>x</b>", "sites": [
            {"id": "a1", "expected": None, "keyword": '"><script>', "pending": False, "site": "https://a.example/<i>", "up": False, "status": 500, "ms": 3, "error": "<script>", "cert_days": 4, "since": 0, "checked": 0}]}
        page = main.render(snapshot)
        self.assertNotIn("<script>", page)
        self.assertNotIn("<b>x", page)
        self.assertIn("&lt;script&gt;", page)

    def test_status_page_has_the_topbar_above_the_page(self):
        page = main.render({"lastRun": 0, "lastError": None, "sites": []})
        self.assertIn("Add your first site", page)
        self.assertNotIn("SITES", page)
        self.assertLess(page.index('class="a-topbar"'), page.index('class="a-page"'))
        self.assertEqual(page.count("</header>"), 1)


class ManageSites(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.env = {"AUTOMATON_APP_DATA_DIR": self.folder.name}

    def test_starts_empty_with_no_sites_setting(self):
        app = main.Monitor(env=self.env)
        self.assertEqual(app.snapshot()["sites"], [])
        self.assertTrue(app.run_once())  # an empty list is a completed run, not an error

    def test_add_edit_remove_persist_across_restart(self):
        app = main.Monitor(env=self.env)
        self.assertIsNone(app.edit("add", {"url": "https://a.example", "status": "200", "keyword": "Hi"}))
        site = app.snapshot()["sites"][0]
        self.assertEqual((site["site"], site["expected"], site["keyword"], site["pending"]), ("https://a.example", 200, "Hi", True))
        self.assertIsNone(app.edit("edit", {"id": site["id"], "url": "https://b.example", "status": "", "keyword": ""}))
        again = main.Monitor(env=self.env).snapshot()["sites"]
        self.assertEqual([(s["id"], s["site"], s["expected"]) for s in again], [(site["id"], "https://b.example", None)])
        self.assertIsNone(app.edit("remove", {"id": site["id"]}))
        self.assertEqual(main.Monitor(env=self.env).snapshot()["sites"], [])

    def test_rejects_invalid_duplicate_unknown_and_too_many(self):
        app = main.Monitor(env=self.env)
        self.assertIn("http", app.edit("add", {"url": "nope"}))
        self.assertIn("100 to 599", app.edit("add", {"url": "https://a.example", "status": "9"}))
        self.assertIsNone(app.edit("add", {"url": "https://a.example"}))
        self.assertIn("already", app.edit("add", {"url": "https://a.example"}))
        self.assertIn("no longer", app.edit("edit", {"id": "zz", "url": "https://c.example"}))
        self.assertIn("no longer", app.edit("remove", {"id": "zz"}))
        for i in range(monitor.MAX_SITES - 1):
            self.assertIsNone(app.edit("add", {"url": f"https://s{i}.example"}))
        self.assertIn("At most", app.edit("add", {"url": "https://last.example"}))

    def test_old_sites_setting_is_imported_once(self):
        env = {**self.env, "SITES": "https://a.example|200|Hi\nhttps://b.example;broken"}
        sites = main.Monitor(env=env).snapshot()["sites"]
        self.assertEqual([(s["site"], s["expected"], s["keyword"]) for s in sites], [("https://a.example", 200, "Hi"), ("https://b.example", None, None)])
        app = main.Monitor(env=env)
        app.edit("remove", {"id": sites[0]["id"]})
        again = main.Monitor(env=env).snapshot()["sites"]  # the setting is still there, but only the stored list counts now
        self.assertEqual([s["site"] for s in again], ["https://b.example"])

    def test_emptied_list_is_not_reimported(self):
        env = {**self.env, "SITES": "https://a.example"}
        app = main.Monitor(env=env)
        app.edit("remove", {"id": app.snapshot()["sites"][0]["id"]})
        self.assertEqual(main.Monitor(env=env).snapshot()["sites"], [])

    def test_manifest_has_no_sites_setting_and_no_required_one(self):
        import json
        manifest = json.load(open(os.path.join(os.path.dirname(__file__), "automaton.json")))["application"]
        names = [s["name"] for s in manifest["settings"]] + [s["name"] for s in manifest["secrets"]]
        self.assertNotIn("SITES", names)
        self.assertFalse([s for s in manifest["settings"] if s.get("required")])
        self.assertEqual(names, ["CHECK_INTERVAL_SECONDS", "CERT_WARN_DAYS", "TIMEOUT_SECONDS", "EMAIL_TO", "WEBHOOK_URL", "HEARTBEAT_URL"])


class Http(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.app = main.Monitor(env={"AUTOMATON_APP_DATA_DIR": self.folder.name})
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (self.server.shutdown(), self.server.server_close()))
        self.host = f"127.0.0.1:{self.server.server_port}"

    def post(self, path, body, origin="same", signed=True):
        import http.client
        connection = http.client.HTTPConnection(self.host)
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if signed:
            headers.update({"X-Automaton-Viewer-Role": "user", "X-Automaton-Viewer-Token": "signed"})
        if origin:
            headers["Origin"] = "http://" + self.host if origin == "same" else origin
        connection.request("POST", path, body, headers)
        response = connection.getresponse()
        response.read()
        return response.status, response.getheader("Location")

    def test_add_through_the_page_and_redirect_with_error(self):
        self.assertEqual(self.post("/sites/add", "url=https%3A%2F%2Fa.example&status=&keyword="), (303, "../"))
        self.assertEqual(self.app.snapshot()["sites"][0]["site"], "https://a.example")
        status, location = self.post("/sites/add", "url=nope")
        self.assertEqual(status, 303)
        self.assertIn("error=", location)
        from urllib.parse import urljoin
        import urllib.request
        target = urljoin(f"http://{self.host}/sites/add", location)  # what the browser does after the redirect
        self.assertTrue(target.startswith(f"http://{self.host}/?error="))
        self.assertIn("must start with http", urllib.request.urlopen(target).read().decode())

    def test_cross_site_or_originless_posts_are_refused(self):
        for origin in ("http://evil.example", None):
            self.assertEqual(self.post("/sites/add", "url=https%3A%2F%2Fa.example", origin)[0], 403)
        self.assertEqual(self.app.snapshot()["sites"], [])

    def test_posts_without_the_viewer_headers_are_401_and_change_nothing(self):
        import http.client
        self.assertEqual(self.post("/sites/add", "url=https%3A%2F%2Fa.example", signed=False)[0], 401)
        for name in ("X-Automaton-Viewer-Role", "X-Automaton-Viewer-Token"):  # one header alone is not enough
            connection = http.client.HTTPConnection(self.host)
            connection.request("POST", "/sites/add", "url=https%3A%2F%2Fa.example", {"Origin": "http://" + self.host, name: "x"})
            self.assertEqual(connection.getresponse().status, 401)
        self.app.edit("add", {"url": "https://b.example"})
        site_id = self.app.snapshot()["sites"][0]["id"]
        for action in ("edit", "remove"):
            self.assertEqual(self.post(f"/sites/{action}", f"id={site_id}&url=https%3A%2F%2Fc.example", signed=False)[0], 401)
        self.assertEqual([s["site"] for s in self.app.snapshot()["sites"]], ["https://b.example"])

    def test_loopback_and_link_local_targets_are_refused(self):
        for url in ("http://localhost/", "http://127.0.0.1:8080/", "http://[::1]/", "http://169.254.169.254/latest", "http://0.0.0.0/", "http://[::ffff:127.0.0.1]/", "http://x.localhost/", "http://2130706433/", "http://127.1/", "http://0x7f000001/", "http://0177.0.0.1/"):
            self.assertIn("this server itself", self.app.edit("add", {"url": url}), url)
        self.assertEqual(self.app.snapshot()["sites"], [])
        self.assertIsNone(self.app.edit("add", {"url": "https://example.com/"}))
        site_id = self.app.snapshot()["sites"][0]["id"]
        self.assertIn("this server itself", self.app.edit("edit", {"id": site_id, "url": "http://169.254.169.254/"}))

    def test_corrupt_sites_file_is_kept_until_fixed_by_hand(self):
        path = os.path.join(self.folder.name, "sites.json")
        open(path, "w").write("{broken")
        app = main.Monitor(env={"AUTOMATON_APP_DATA_DIR": self.folder.name})
        self.assertEqual(app.snapshot()["sites"], [])
        self.assertEqual(open(path).read(), "{broken")

    def test_unknown_path_and_oversized_body(self):
        self.assertEqual(self.post("/sites/other", "")[0], 404)
        self.assertEqual(self.post("/sites/add", "x" * 9000)[0], 413)

    def test_status_json_does_not_expose_ids_or_keywords(self):
        import json, urllib.request
        self.app.edit("add", {"url": "https://a.example", "keyword": "secret-word"})
        body = urllib.request.urlopen(f"http://{self.host}/status.json").read().decode()
        self.assertNotIn("secret-word", body)
        self.assertEqual(json.loads(body)["sites"][0]["site"], "https://a.example")


if __name__ == "__main__":
    unittest.main()
