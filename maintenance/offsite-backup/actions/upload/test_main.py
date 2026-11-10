import hashlib
import io
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import boto3
from moto import mock_aws

import main


class OffsiteBackupTests(unittest.TestCase):
    def setUp(self):
        self.mock_aws = mock_aws()
        self.mock_aws.start()
        self.addCleanup(self.mock_aws.stop)
        self.s3 = boto3.client("s3", region_name="us-east-1")
        self.s3.create_bucket(Bucket="automaton-backups")
        self.archive = b"encrypted archive test bytes"
        self.name = "automaton-20261104T030000Z"
        self.digest = hashlib.sha256(self.archive).hexdigest()
        self.status = {
            "available": True,
            "backups": [
                {"name": "automaton-20261104T040000Z", "archiveSizeBytes": None, "archiveSha256": None},
                {"name": self.name, "archiveSizeBytes": len(self.archive), "archiveSha256": self.digest},
            ],
        }
        self.environment = patch.dict(os.environ, {
            "APP_AUTOMATON_API_KEY": "scoped-test-key",
            "API_BASE_URL": "https://automaton.test",
            "AUTOMATON_APP_ID": "app-one",
            "S3_ENDPOINT": "https://s3.example.invalid",
            "S3_BUCKET": "automaton-backups",
            "S3_ACCESS_KEY_ID": "test-access",
            "S3_SECRET_ACCESS_KEY": "test-secret",
        }, clear=False)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def api_responses(self, archive=None):
        archive = self.archive if archive is None else archive

        def open_url(request, timeout):
            self.assertEqual(request.get_header("Authorization"), "Bearer scoped-test-key")
            self.assertTrue(request.full_url.startswith("https://automaton.test/"))
            if request.full_url.endswith("/api/install/backups"):
                return io.BytesIO(json.dumps(self.status).encode())
            if request.full_url.endswith("/archive"):
                return io.BytesIO(archive)
            raise AssertionError("Unexpected API URL")

        return open_url

    def test_streams_new_backup_to_s3_and_skips_matching_object(self):
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()) as open_url:
            first = main.run({"apiBaseUrl": "https://attacker.invalid"})
            self.assertTrue(first["uploaded"])
            self.assertEqual(first["backup"], self.name)
            self.assertEqual(first["retained"], 1)
            self.assertEqual(first["deleted"], 0)
            stored = self.s3.get_object(Bucket="automaton-backups", Key=f"automaton/automaton.test/app-one/{self.name}.tar.age")
            self.assertEqual(stored["Body"].read(), self.archive)
            self.assertEqual(stored["Metadata"]["sha256"], self.digest)

            second = main.run({})
            self.assertFalse(second["uploaded"])
            self.assertEqual(open_url.call_count, 3)  # Two metadata reads, one archive download.

    def test_two_installs_keep_copies_under_their_own_prefix(self):
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()):
            main.run({})
            with patch.dict(os.environ, {"AUTOMATON_APP_ID": "app-two"}):
                self.assertTrue(main.run({})["uploaded"])
        keys = [o["Key"] for o in self.s3.list_objects_v2(Bucket="automaton-backups")["Contents"]]
        self.assertEqual(sorted(k.split("/")[2] for k in keys), ["app-one", "app-two"])

    def test_custom_prefix_must_stay_in_the_installs_own_folder(self):
        with patch.dict(os.environ, {"S3_PREFIX": "automaton/automaton.test/app-two/"}):
            with self.assertRaises(main.BackupError):
                main.run({})
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()), \
                patch.dict(os.environ, {"S3_PREFIX": "automaton/automaton.test/app-one/weekly"}):
            self.assertTrue(main.run({})["uploaded"])
        keys = [o["Key"] for o in self.s3.list_objects_v2(Bucket="automaton-backups")["Contents"]]
        self.assertTrue(keys[0].startswith("automaton/automaton.test/app-one/weekly/"))

    def test_missing_app_id_fails(self):
        with patch.dict(os.environ, {"AUTOMATON_APP_ID": ""}):
            with self.assertRaises(main.BackupError):
                main.run({})

    def test_aborts_upload_when_download_hash_does_not_match(self):
        self.status["backups"][1]["archiveSha256"] = "0" * 64
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()):
            with self.assertRaises(main.BackupError):
                main.run({})
        objects = self.s3.list_objects_v2(Bucket="automaton-backups")
        self.assertEqual(objects.get("KeyCount", 0), 0)

    def test_prefix_cannot_escape_the_server_object_namespace(self):
        with patch.dict(os.environ, {"S3_PREFIX": "automaton/another-host/"}):
            with self.assertRaises(main.BackupError):
                main.run({})

    def test_no_encrypted_backup_fails_and_keeps_offsite_copies(self):
        self.status["backups"] = [{"name": self.name, "archiveSizeBytes": None, "archiveSha256": None}]
        with patch.object(main, "make_s3_client", return_value=self.s3) as client,                 patch.object(main, "api_urlopen", side_effect=self.api_responses()):
            with self.assertRaises(main.BackupError):
                main.run({})
        client.assert_not_called()

    def test_api_redirects_are_rejected(self):
        handler = main.RejectRedirectHandler()
        request = main.Request(
            "https://automaton.test/api/install/backups",
            headers={"Authorization": "Bearer scoped-test-key"},
        )
        self.assertIsNone(handler.redirect_request(
            request, None, 302, "Found", {}, "https://attacker.example/collect"))

    def test_retention_keeps_recent_objects_and_seven_oldest_survivors(self):
        prefix = "automaton/automaton.test/"
        now = datetime.now(timezone.utc)
        names = []
        for days_ago in range(40, 0, -1):
            created = now - timedelta(days=days_ago)
            name = "automaton-" + created.strftime("%Y%m%dT%H%M%SZ")
            names.append(name)
            self.s3.put_object(Bucket="automaton-backups", Key=f"{prefix}{name}.tar.age", Body=b"archive")

        retained, deleted = main.apply_retention(self.s3, "automaton-backups", prefix, 30, 7)
        self.assertEqual(retained, 29)
        self.assertEqual(deleted, 11)
        remaining = self.s3.list_objects_v2(Bucket="automaton-backups", Prefix=prefix)["Contents"]
        self.assertEqual(len(remaining), 29)

    def test_retention_keeps_seven_when_every_backup_is_past_the_age_limit(self):
        prefix = "automaton/automaton.test/"
        now = datetime.now(timezone.utc)
        for days_ago in range(49, 39, -1):
            name = "automaton-" + (now - timedelta(days=days_ago)).strftime("%Y%m%dT%H%M%SZ")
            self.s3.put_object(Bucket="automaton-backups", Key=f"{prefix}{name}.tar.age", Body=b"archive")

        retained, deleted = main.apply_retention(self.s3, "automaton-backups", prefix, 30, 7)
        self.assertEqual((retained, deleted), (7, 3))

    def test_wrong_bucket_names_the_setting(self):
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()), \
                patch.dict(os.environ, {"S3_BUCKET": "no-such-bucket"}):
            with self.assertRaises(main.BackupError) as raised:
                main.run({})
        self.assertIn("S3_BUCKET", str(raised.exception))

    def test_failure_sends_email_through_notify_permission(self):
        calls = []

        def open_url(request, timeout):
            calls.append(request)
            return io.BytesIO(b"{}")

        with patch.object(main, "api_urlopen", side_effect=open_url):
            main.notify_failure("Bucket missing")
        self.assertEqual(calls[0].full_url, "https://automaton.test/api/notify/email")
        body = json.loads(calls[0].data)
        self.assertEqual(body["to"], ["administrators"])
        self.assertIn("Bucket missing", body["text"])

    def test_failed_email_never_raises(self):
        with patch.object(main, "api_urlopen", side_effect=OSError("down")):
            main.notify_failure("x")

    def test_s3_error_messages_name_the_setting(self):
        from botocore.exceptions import ClientError, EndpointConnectionError
        denied = ClientError({"Error": {"Code": "403"}, "ResponseMetadata": {"HTTPStatusCode": 403}}, "HeadObject")
        self.assertIn("S3_SECRET_ACCESS_KEY", main.describe_s3_error(denied))
        sig = ClientError({"Error": {"Code": "SignatureDoesNotMatch"}}, "PutObject")
        self.assertIn("S3_REGION", main.describe_s3_error(sig))
        self.assertIn("S3_ENDPOINT", main.describe_s3_error(EndpointConnectionError(endpoint_url="x")))

    def test_main_emails_the_failure_and_skips_without_a_key(self):
        with patch.object(main, "run", side_effect=main.BackupError("boom")),                 patch.object(main, "notify_failure") as notify,                 patch("sys.stdin", io.StringIO("{}")):
            self.assertEqual(main.main(), 1)
        notify.assert_called_once_with("boom")
        with patch.dict(os.environ, {"APP_AUTOMATON_API_KEY": ""}), patch.object(main, "api_urlopen") as open_url:
            main.notify_failure("x")
        open_url.assert_not_called()


if __name__ == "__main__":
    unittest.main()
