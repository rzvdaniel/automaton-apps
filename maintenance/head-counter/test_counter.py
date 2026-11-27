import datetime as dt
import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import main


def counts(installs, bundles):
    return {"install.sh": installs, "automaton-server.tar.gz": bundles}


class CounterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = main.App({"AUTOMATON_APP_DATA_DIR": self.temp.name,
                             "ADMIN_TOKEN": "a" * 20, "HEAD_COUNTER_TOKEN": "b" * 20})

    def test_baseline_week_new_release_and_own_reports(self):
        now = dt.datetime.now(dt.timezone.utc)
        monday = (now - dt.timedelta(days=now.weekday())).date()
        sunday = monday - dt.timedelta(days=1)
        earlier = sunday - dt.timedelta(days=7)
        self.app.snapshot({"1": counts(100, 150)}, f"{earlier}T12:00:00+00:00")
        self.app.snapshot({"1": counts(110, 165)}, f"{sunday}T12:00:00+00:00")
        self.app.snapshot({"1": counts(115, 173), "2": counts(4, 6)}, main.timestamp())
        with patch.object(main, "timestamp", return_value=f"{monday}T13:00:00+00:00"):
            self.app.record({"file": "install.sh", "version": "server-v1", "source": "CI"})
            self.app.record({"file": "automaton-server.tar.gz", "version": "1", "source": "CI"})
        summary = self.app.summary()
        self.assertEqual((summary["week"]["installs"], summary["week"]["updates"]), (8, 5))
        self.assertEqual((summary["since_start"]["installs"], summary["since_start"]["updates"]), (18, 10))
        self.assertEqual(summary["ours"][0]["source"], "CI")

    def test_same_day_refresh_keeps_start_and_manual_changes_others(self):
        day = dt.datetime.now(dt.timezone.utc).date().isoformat()
        self.app.snapshot({"1": counts(5, 6)}, f"{day}T00:00:00+00:00")
        self.app.snapshot({"1": counts(8, 10)}, f"{day}T01:00:00+00:00")
        with patch.object(main, "timestamp", return_value=f"{day}T02:00:00+00:00"):
            self.app.record({"file": "install.sh", "version": "v1", "source": "manual"})
        data = self.app.summary()
        self.assertEqual(data["since_start"]["installs"], 2)
        self.assertEqual(data["github"][0]["others_install"], 7)
        self.assertEqual(data["observed_from"], f"{day}T00:00:00+00:00")
        self.assertEqual(main.App({"AUTOMATON_APP_DATA_DIR": self.temp.name}).summary(), data)

    def test_clamps_and_validation(self):
        self.app.snapshot({"1": counts(2, 1)}, "2020-01-01T00:00:00+00:00")
        self.app.snapshot({"1": counts(1, 0)}, "2020-01-02T00:00:00+00:00")
        self.assertEqual(self.app.summary()["since_start"]["installs"], 0)
        for body in ({}, {"file": "other", "version": "1", "source": "x"},
                     {"file": "install.sh", "version": [], "source": "x"},
                     {"file": "install.sh", "version": "1", "source": " "}):
            with self.assertRaises(ValueError):
                self.app.record(body)

    def test_github_pagination_and_asset_filtering(self):
        class Response:
            def __init__(self, value):
                self.value = json.dumps(value).encode()
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self, *args):
                return self.value
        unrelated = {"tag_name": "client-v1", "assets": []}
        release = {"tag_name": "server-v1", "assets": [
            {"name": "install.sh", "download_count": 8},
            {"name": "automaton-server.tar.gz", "download_count": 9},
            {"name": "automaton-server.tar.gz.sha256", "download_count": 30}]}
        with patch.object(main, "urlopen", side_effect=[Response([unrelated] * 100), Response([release])]) as fetch:
            self.assertEqual(main.fetch_releases(), {"1": counts(8, 9)})
            self.assertEqual(fetch.call_count, 2)

    def test_refresh_failure_keeps_snapshot(self):
        self.app.snapshot({"1": counts(1, 2)})
        with patch.object(main, "fetch_releases", side_effect=OSError):
            self.app.refresh()
        self.assertEqual(self.app.summary()["github"][0]["install"], 1)
        self.assertIn("failed", self.app.summary()["error"])

    def test_http_auth_manual_and_machine_endpoints(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(self.app))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        def request(method, path, body=None, headers=None):
            connection = http.client.HTTPConnection(*server.server_address)
            connection.request(method, path, json.dumps(body) if body is not None else None, headers or {})
            response = connection.getresponse()
            data = response.read()
            connection.close()
            return response.status, json.loads(data)

        body = {"file": "install.sh", "version": "1", "source": "test"}
        auth = {"Authorization": "Bearer " + "b" * 20}
        admin = {"Authorization": "Bearer " + "a" * 20, "X-Head-Counter": "1"}
        with patch.object(main.time, "sleep"):
            self.assertEqual(request("POST", "/ours", body)[0], 401)
            self.assertEqual(request("GET", "/summary.json", headers=admin)[0], 401)
            self.assertEqual(request("GET", "/api/summary", headers={"X-Automaton-Viewer-Role": "admin", "X-Automaton-Viewer-Token": "fake"})[0], 401)
            self.assertEqual(request("POST", "/api/manual", body, {"Authorization": admin["Authorization"]})[0], 403)
            self.assertEqual(request("POST", "/ours", body, auth)[0], 201)
            self.assertEqual(request("POST", "/api/manual", body, admin)[0], 201)
            self.assertEqual(len(request("GET", "/summary.json", headers=auth)[1]["ours"]), 2)
            self.app.managed = True
            self.assertEqual(request("GET", "/api/summary", headers=admin)[0], 401)
            self.assertEqual(request("GET", "/api/summary", headers={"X-Automaton-Viewer-Role": "admin", "X-Automaton-Viewer-Token": "trusted"})[0], 200)
            self.assertEqual(request("POST", "/ours", body, auth)[0], 201)


if __name__ == "__main__":
    unittest.main()
