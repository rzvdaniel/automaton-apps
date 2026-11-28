"""Unit and integration tests for Release Keeper."""

import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from github_sync import run_sync
from main import make_server
from report import generate_daily_report
from store import Store


class ReleaseKeeperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "rk.db")
        self.store = Store(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_store_paging_and_search(self):
        for i in range(25):
            self.store.upsert_release(
                {
                    "version": f"0.2.{100 + i}",
                    "released_at": f"2026-11-{1 + (i % 28):02d}T10:00:00Z",
                    "state": "deployed" if i % 2 == 0 else "ready",
                    "verified": "passed" if i % 2 == 0 else "pending",
                    "notes": f"Release note {i}",
                }
            )
        page1 = self.store.list_releases(limit=20, offset=0)
        self.assertEqual(len(page1["items"]), 20)
        self.assertEqual(page1["total"], 25)
        page2 = self.store.list_releases(limit=20, offset=20)
        self.assertEqual(len(page2["items"]), 5)
        filtered = self.store.list_releases(q="0.2.124")
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["version"], "0.2.124")

    def test_lesson_triage(self):
        self.store.upsert_lesson(
            {
                "id": "automaton#10",
                "title": "Flaky test",
                "area": "Runner",
                "filed_at": "2026-11-28T09:00:00Z",
                "times": 2,
                "state": "open",
            }
        )
        updated = self.store.triage_lesson("automaton#10", "later")
        self.assertIsNotNone(updated)
        self.assertEqual(updated["state"], "later")
        self.assertEqual(updated["fix"], "Later")

    def test_sync_and_daily_report(self):
        os.environ["RK_GH_TOKEN"] = "test-token-1234567890"
        try:
            def fake_get(url, headers=None, timeout=15):
                if url.endswith("/health"):
                    return {"version": "0.2.200"}
                if "/releases" in url:
                    return [
                        {
                            "tag_name": "v0.2.200",
                            "published_at": "2026-11-28T08:00:00Z",
                            "body": "Fix things",
                            "html_url": "https://github.com/rzvdaniel/automaton/releases/tag/v0.2.200",
                        }
                    ]
                if "/issues" in url:
                    return [
                        {
                            "number": 42,
                            "title": "Check disk space",
                            "state": "open",
                            "labels": [{"name": "lesson"}, {"name": "area:ops"}],
                            "created_at": "2026-11-28T07:00:00Z",
                            "body": "Disk filled up.\n### Recommendation\nAdd alert.",
                            "html_url": "https://github.com/rzvdaniel/automaton/issues/42",
                        }
                    ]
                return []

            def fake_post(url, body, headers=None, timeout=15):
                return {
                    "data": {
                        "user": {
                            "projectV2": {
                                "items": {
                                    "nodes": [
                                        {
                                            "fieldValueByName": {"name": "Verify"},
                                            "content": {"number": 99, "title": "Verify me", "url": "https://github.com/x/y/issues/99"},
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }

            res = run_sync(self.store, getter=fake_get, poster=fake_post)
            self.assertTrue(res["ok"])
            self.assertEqual(res["prod_version"], "0.2.200")
            self.assertEqual(res["synced_releases"], 1)
            self.assertGreaterEqual(res["synced_lessons"], 1)

            rep = generate_daily_report(self.store, kind="morning", send_email=False)
            self.assertEqual(rep["kind"], "morning")
            self.assertIn("0.2.200", rep["headline"])
        finally:
            os.environ.pop("RK_GH_TOKEN", None)

    def test_http_server_and_auth(self):
        os.environ["RK_ADMIN_TOKEN"] = "secret-admin-token-123456"
        try:
            srv = make_server("127.0.0.1", 0, self.db_path)
            port = srv.server_address[1]
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health") as r:
                    self.assertEqual(r.status, 200)

                with self.assertRaises(urllib.error.HTTPError) as ctx:
                    urllib.request.urlopen(f"http://127.0.0.1:{port}/api/now")
                self.assertEqual(ctx.exception.code, 401)

                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/now",
                    headers={"Authorization": "Bearer secret-admin-token-123456"},
                )
                with urllib.request.urlopen(req) as r:
                    data = json.loads(r.read().decode("utf-8"))
                    self.assertIn("prod_version", data)
            finally:
                srv.shutdown()
                srv.server_close()
        finally:
            os.environ.pop("RK_ADMIN_TOKEN", None)


if __name__ == "__main__":
    unittest.main()
