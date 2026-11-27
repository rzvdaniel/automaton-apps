import datetime as dt
import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import main


def counts(server, cli, linux=0, windows=0, bundle=0):
    return {"install-automaton.sh": server, "install.sh": cli, "automaton-linux-x64": linux,
            "automaton-win-x64.exe": windows, "automaton-server.tar.gz": bundle}


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
        self.app.snapshot({"1": counts(100, 150, 20, 10, 30)}, f"{earlier}T12:00:00+00:00")
        self.app.snapshot({"1": counts(110, 165, 25, 12, 35)}, f"{sunday}T12:00:00+00:00")
        self.app.snapshot({"1": counts(115, 173, 28, 16, 50), "2": counts(4, 6, 2, 1)}, main.timestamp())
        with patch.object(main, "timestamp", return_value=f"{monday}T13:00:00+00:00"):
            self.app.record({"file": "install-automaton.sh", "version": "server-v1", "source": "CI"})
            self.app.record({"file": "install.sh", "version": "1", "source": "CI"})
            self.app.record({"file": "automaton-linux-x64", "version": "1", "source": "CI"})
            self.app.record({"file": "automaton-server.tar.gz", "version": "1", "source": "CI"})
        summary = self.app.summary()
        self.assertEqual((summary["week"]["server_installs"], summary["week"]["cli_installs"]), (8, 22))
        self.assertEqual((summary["since_start"]["server_installs"], summary["since_start"]["cli_installs"]), (18, 44))
        self.assertNotIn("updates", summary["week"])
        self.assertEqual((summary["github"][1]["server_downloads"], summary["github"][1]["cli_downloads"]), (115, 217))
        self.assertEqual(summary["ours"][0]["source"], "CI")

    def test_same_day_refresh_keeps_start_and_manual_changes_others(self):
        day = dt.datetime.now(dt.timezone.utc).date().isoformat()
        self.app.snapshot({"1": counts(5, 6)}, f"{day}T00:00:00+00:00")
        self.app.snapshot({"1": counts(8, 10)}, f"{day}T01:00:00+00:00")
        with patch.object(main, "timestamp", return_value=f"{day}T02:00:00+00:00"):
            self.app.record({"file": "install-automaton.sh", "version": "v1", "source": "manual"})
        data = self.app.summary()
        self.assertEqual(data["since_start"]["server_installs"], 2)
        self.assertEqual(data["github"][0]["others_server"], 7)
        self.assertEqual(data["observed_from"], f"{day}T00:00:00+00:00")
        self.assertEqual(main.App({"AUTOMATON_APP_DATA_DIR": self.temp.name}).summary(), data)

    def test_clamps_and_validation(self):
        self.app.snapshot({"1": counts(2, 1)}, "2020-01-01T00:00:00+00:00")
        self.app.snapshot({"1": counts(1, 0)}, "2020-01-02T00:00:00+00:00")
        self.assertEqual(self.app.summary()["since_start"]["server_installs"], 0)
        for body in ({}, {"file": "other", "version": "1", "source": "x"},
                     {"file": [], "version": "1", "source": "x"},
                     {"file": "automaton-linux-x64.sha256", "version": "1", "source": "x"},
                     {"file": "automaton-server.tar.gz.sha256", "version": "1", "source": "x"},
                     {"file": "../automaton-linux-x64", "version": "1", "source": "x"},
                     {"file": "install.sh", "version": [], "source": "x"},
                     {"file": "install.sh", "version": "1", "source": " "}):
            with self.assertRaises(ValueError):
                self.app.record(body)

    def test_week_is_unavailable_after_a_long_snapshot_gap(self):
        now = dt.datetime.now(dt.timezone.utc)
        monday = (now - dt.timedelta(days=now.weekday())).date()
        old = monday - dt.timedelta(days=8)
        self.app.snapshot({"1": counts(2, 3)}, f"{old}T12:00:00+00:00")
        self.app.snapshot({"1": counts(20, 30)}, main.timestamp())
        data = self.app.summary()
        self.assertIsNone(data["week"])
        self.assertIn("unavailable", data["week_error"])
        self.assertEqual(data["since_start"]["server_installs"], 18)

    def test_existing_snapshots_are_preserved_but_not_used_as_new_baseline(self):
        with self.app.connect() as db:
            db.execute("INSERT INTO baseline VALUES (1, ?, ?)", ("2020-01-01", json.dumps({"1": {"install.sh": 4}})))
            db.execute("INSERT INTO snapshots VALUES (?, ?, ?)", ("2020-01-01", "2020-01-01", "{}"))
        self.assertIsNone(self.app.summary()["since_start"])
        self.app.snapshot({"1": counts(30, 40, 50)})
        self.assertEqual(self.app.summary()["since_start"]["server_installs"], 0)
        self.assertEqual(self.app.summary()["since_start"]["cli_installs"], 0)
        with self.app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0], 1)

    def test_subtraction_is_per_asset_and_bundle_is_not_counted(self):
        self.app.snapshot({"1": counts(0, 0, 0, 0, 0)}, "2020-01-01T00:00:00+00:00")
        self.app.snapshot({"1": counts(2, 3, 5, 1, 100)}, main.timestamp())
        for file in ("install-automaton.sh", "install.sh", "automaton-linux-x64",
                     "automaton-win-x64.exe", "automaton-server.tar.gz"):
            self.app.record({"file": file, "version": "1", "source": "test"})
        data = self.app.summary()
        self.assertEqual(data["since_start"]["server_installs"], 1)
        self.assertEqual(data["since_start"]["cli_installs"], 6)
        self.assertEqual(data["github"][0]["others_cli"], 6)

    def test_first_observation_this_week_is_marked_partial(self):
        self.app.snapshot({"1": counts(2, 3)})
        self.assertTrue(self.app.summary()["week"]["partial"])

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
            {"name": "install-automaton.sh", "download_count": 4},
            {"name": "automaton-linux-x64", "download_count": 2},
            {"name": "automaton-win-x64.exe", "download_count": 3},
            {"name": "automaton-server.tar.gz", "download_count": 9},
            {"name": "automaton-server.tar.gz.sha256", "download_count": 30},
            {"name": "automaton-linux-x64.sha256", "download_count": 30},
            {"name": "update-automaton.sh", "download_count": 30}]}
        with patch.object(main, "urlopen", side_effect=[Response([unrelated] * 100), Response([release])]) as fetch:
            self.assertEqual(main.fetch_releases(), {"1": counts(4, 8, 2, 3, 9)})
            self.assertEqual(fetch.call_count, 2)

    def test_refresh_failure_keeps_snapshot(self):
        self.app.snapshot({"1": counts(1, 2)})
        with patch.object(main, "fetch_releases", side_effect=OSError):
            self.app.refresh()
        self.assertEqual(self.app.summary()["github"][0]["server_downloads"], 1)
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
            for file in ("install-automaton.sh", "automaton-server.tar.gz", "automaton-linux-x64", "automaton-win-x64.exe"):
                self.assertEqual(request("POST", "/ours", {**body, "file": file}, auth)[0], 201)
            self.assertEqual(request("POST", "/ours", {**body, "file": "automaton-linux-x64.sha256"}, auth)[0], 400)
            self.assertEqual(request("POST", "/api/manual", body, admin)[0], 201)
            self.assertEqual(len(request("GET", "/summary.json", headers=auth)[1]["ours"]), 6)
            self.app.managed = True
            self.assertEqual(request("GET", "/api/summary", headers=admin)[0], 401)
            self.assertEqual(request("GET", "/api/summary", headers={"X-Automaton-Viewer-Role": "admin", "X-Automaton-Viewer-Token": "trusted"})[0], 200)
            self.assertEqual(request("POST", "/ours", body, auth)[0], 201)


if __name__ == "__main__":
    unittest.main()
