import io
import json
import unittest
from urllib.error import HTTPError

import backup


class Opener:
    def __init__(self, status=200, body=b"{}"):
        self.status, self.body, self.requests = status, body, []

    def open(self, request, timeout=0):
        self.requests.append(request)
        if self.status >= 400:
            raise HTTPError(request.full_url, self.status, "x", {}, io.BytesIO(self.body))
        return io.BytesIO(self.body)


SETTINGS = backup.Settings({"AUTOMATON_API_URL": "https://api.example.test/", "APP_AUTOMATON_API_KEY": "key"})


class BackupTests(unittest.TestCase):
    def test_run_needs_a_viewer_token_and_makes_no_call_without_one(self):
        opener = Opener()
        self.assertEqual(backup.run_backup(SETTINGS, None, opener=opener)[0], "forbidden")
        self.assertEqual(opener.requests, [])

    def test_run_posts_the_fixed_path_with_the_viewer_token(self):
        opener = Opener(202, b'{"requested":true}')
        opener.status = 200
        status, data, _ = backup.run_backup(SETTINGS, "tok", opener=opener)
        request = opener.requests[0]
        self.assertEqual((status, request.get_method(), request.full_url), ("ok", "POST", "https://api.example.test/api/Install/backups/run"))
        self.assertEqual(request.get_header("X-automaton-viewer-token"), "tok")

    def test_server_refusals_become_plain_statuses(self):
        for code, status in ((403, "forbidden"), (409, "conflict"), (503, "unavailable")):
            self.assertEqual(backup.run_backup(SETTINGS, "tok", opener=Opener(code, b'{"error":"x"}'))[0], status)
        self.assertEqual(backup.run_backup(SETTINGS, "tok", opener=Opener(500))[0], "error")

    def test_forbidden_never_echoes_server_text_and_missing_setup_is_named(self):
        self.assertIn("system administrator", backup.run_backup(SETTINGS, "tok", opener=Opener(403, b'{"error":"secret"}'))[2])
        self.assertEqual(backup.run_backup(backup.Settings({}), "tok")[0], "not_configured")
        self.assertEqual(backup.run_backup(backup.Settings({"AUTOMATON_API_URL": "https://a.test"}), "tok")[0], "no_key")

    def test_backups_reduces_to_the_newest_copy(self):
        body = json.dumps({"lastSuccessAt": "2026-11-14T03:00:00Z", "lastError": None, "backups": [
            {"name": "a", "createdAt": "2026-11-13T03:00:00Z", "sizeBytes": 1}, {"name": "b", "createdAt": "2026-11-14T03:00:00Z", "sizeBytes": 2}]}).encode()
        status, data, _ = backup.backups(SETTINGS, opener=Opener(200, body))
        self.assertEqual((status, data["count"], data["newest"]["name"]), ("ok", 2, "b"))


if __name__ == "__main__":
    unittest.main()
