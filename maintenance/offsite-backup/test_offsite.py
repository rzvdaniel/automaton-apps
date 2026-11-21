import io
import unittest
from datetime import datetime, timezone
from urllib.error import HTTPError

import offsite

ENV = {"S3_ENDPOINT": "https://s3.example.test", "S3_BUCKET": "bk", "S3_ACCESS_KEY_ID": "AK", "S3_SECRET_ACCESS_KEY": "SK",
       "API_BASE_URL": "https://api.example.test", "AUTOMATON_APP_ID": "app1"}
P = "automaton/api.example.test/app1/"
NS = "http://s3.amazonaws.com/doc/2006-03-01/"


def page(keys, token=None):
    items = "".join(f"<Contents><Key>{k}</Key><Size>{n}</Size></Contents>" for k, n in keys)
    more = f"<IsTruncated>true</IsTruncated><NextContinuationToken>{token}</NextContinuationToken>" if token else "<IsTruncated>false</IsTruncated>"
    return f'<ListBucketResult xmlns="{NS}">{items}{more}</ListBucketResult>'.encode()


class Opener:
    def __init__(self, *bodies, status=200):
        self.bodies, self.requests, self.status = list(bodies), [], status

    def open(self, request, timeout=0):
        self.requests.append(request)
        if self.status >= 400:
            raise HTTPError(request.full_url, self.status, "x", {}, io.BytesIO(b""))
        return io.BytesIO(self.bodies.pop(0))


class CheckinTests(unittest.TestCase):
    def test_reads_the_stored_checkin_from_the_install_folder(self):
        opener = Opener(b'{"at": "2026-11-21T03:52:00+00:00", "ok": false, "message": "the address answered HTTP 500"}')
        result = offsite.last_checkin(offsite.Config(ENV), datetime(2026, 11, 21, tzinfo=timezone.utc), opener)
        self.assertEqual(result, {"at": "2026-11-21T03:52:00+00:00", "ok": False, "message": "the address answered HTTP 500"})
        self.assertTrue(opener.requests[0].full_url.startswith("https://s3.example.test/bk/" + P + ".last-checkin"))

    def test_none_when_missing_or_unreadable(self):
        self.assertIsNone(offsite.last_checkin(offsite.Config(ENV), opener=Opener(status=404)))
        self.assertIsNone(offsite.last_checkin(offsite.Config(ENV), opener=Opener(b"not json")))


class OffsiteTests(unittest.TestCase):
    def test_lists_newest_first_with_a_restore_command_and_ignores_other_objects(self):
        opener = Opener(page([(P + "automaton-20261101T030000Z.tar.age", 10), (P + ".stale-alert", 0), (P + "automaton-20261103T030000Z.tar.age", 2048), (P + "notes.txt", 1)]))
        status, copies, _ = offsite.list_copies(offsite.Config(ENV), datetime(2026, 11, 20, tzinfo=timezone.utc), opener)
        self.assertEqual(status, "ok")
        self.assertEqual([c["name"] for c in copies], ["automaton-20261103T030000Z.tar.age", "automaton-20261101T030000Z.tar.age"])
        self.assertEqual(copies[0]["sizeBytes"], 2048)
        self.assertIn("sudo bash /opt/automaton-server/restore.sh --archive ./automaton-20261103T030000Z.tar.age --key", copies[0]["command"])
        self.assertIn("s3://bk/" + P + "automaton-20261103T030000Z.tar.age", copies[0]["command"])

    def test_request_is_signed_and_never_leaks_the_secret(self):
        opener = Opener(page([]))
        offsite.list_copies(offsite.Config(ENV), datetime(2026, 11, 20, tzinfo=timezone.utc), opener)
        request = opener.requests[0]
        self.assertTrue(request.get_header("Authorization").startswith("AWS4-HMAC-SHA256 Credential=AK/20261120/us-east-1/s3/aws4_request"))
        self.assertNotIn("SK", request.get_header("Authorization") + request.full_url)
        self.assertIn("prefix=automaton%2Fapi.example.test%2Fapp1%2F", request.full_url)

    def test_follows_continuation_tokens(self):
        opener = Opener(page([(P + "automaton-20261101T030000Z.tar.age", 1)], "t1"), page([(P + "automaton-20261102T030000Z.tar.age", 1)]))
        _, copies, _ = offsite.list_copies(offsite.Config(ENV), opener=opener)
        self.assertEqual(len(copies), 2)
        self.assertIn("continuation-token=t1", opener.requests[1].full_url)

    def test_storage_errors_and_missing_settings_are_reported_not_raised(self):
        self.assertEqual(offsite.list_copies(offsite.Config(ENV), opener=Opener(status=403))[0], "error")
        self.assertEqual(offsite.list_copies(offsite.Config({}))[0], "not_configured")

    def test_a_prefix_outside_the_install_or_with_odd_characters_is_refused(self):
        self.assertEqual(offsite.list_copies(offsite.Config({**ENV, "S3_PREFIX": "automaton/other/x"}))[0], "not_configured")
        self.assertEqual(offsite.list_copies(offsite.Config({**ENV, "S3_PREFIX": P + "a'b"}))[0], "not_configured")
        self.assertEqual(offsite.list_copies(offsite.Config({**ENV, "S3_PREFIX": P + "weekly"}), opener=Opener(page([])))[0], "ok")


if __name__ == "__main__":
    unittest.main()


class TestApiBaseOnly(unittest.TestCase):
    def test_prefix_ignores_automaton_api_url(self):
        env = {k: v for k, v in ENV.items() if k != "API_BASE_URL"}
        env["AUTOMATON_API_URL"] = "http://internal:8080"
        self.assertNotIn("internal", offsite.Config(env).prefix)
