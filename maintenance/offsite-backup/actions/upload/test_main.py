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

    def run_with_checkin(self, calls, fail_times=0, upload=True, url="https://hb.example.test/ping/secret-token"):
        def open_url(request, timeout):
            if request.full_url.startswith("https://hb.example.test"):
                self.assertEqual(timeout, 10)
                calls.append(request.full_url)
                if len(calls) <= fail_times:
                    raise main.HTTPError(request.full_url, 500, "x", {}, io.BytesIO(b""))
                return io.BytesIO(b"ok")
            return self.api_responses()(request, timeout)

        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=open_url), \
                patch.object(main.time, "sleep"), \
                patch.dict(os.environ, {"CHECKIN_URL": url}):
            return main.run({})

    def marker(self):
        body = self.s3.get_object(Bucket="automaton-backups", Key="automaton/automaton.test/app-one/.last-checkin")["Body"].read()
        return json.loads(body)

    def test_new_backup_leads_to_one_checkin_and_a_second_run_to_none(self):
        calls = []
        self.assertTrue(self.run_with_checkin(calls)["uploaded"])
        self.assertEqual(len(calls), 1)
        self.assertTrue(self.marker()["ok"])
        self.assertFalse(self.run_with_checkin(calls)["uploaded"])
        self.assertEqual(len(calls), 1)  # nothing new, no check-in

    def test_failed_upload_makes_no_checkin(self):
        calls = []
        self.status["backups"][1]["archiveSha256"] = "0" * 64
        with self.assertRaises(main.BackupError):
            self.run_with_checkin(calls)
        self.assertEqual(calls, [])

    def test_checkin_retries_three_times_then_reports_failure_without_failing_the_upload(self):
        calls = []
        self.assertTrue(self.run_with_checkin(calls, fail_times=99)["uploaded"])
        self.assertEqual(len(calls), 4)
        marker = self.marker()
        self.assertFalse(marker["ok"])
        self.assertIn("HTTP 500", marker["message"])
        self.assertNotIn("secret-token", json.dumps(marker))

    def test_checkin_recovers_on_a_retry_and_rejects_a_non_https_address(self):
        calls = []
        self.run_with_checkin(calls, fail_times=2)
        self.assertEqual(len(calls), 3)
        self.assertTrue(self.marker()["ok"])
        calls = []
        self.s3.delete_object(Bucket="automaton-backups", Key=f"automaton/automaton.test/app-one/{self.name}.tar.age")
        self.assertTrue(self.run_with_checkin(calls, url="http://hb.example.test/x")["uploaded"])
        self.assertEqual(calls, [])
        self.assertIn("https", self.marker()["message"])

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

    def test_headless_400_and_403_name_region_endpoint_and_keys(self):
        from botocore.exceptions import ClientError
        for status in (400, 403):
            error = ClientError({"Error": {"Code": str(status)}, "ResponseMetadata": {"HTTPStatusCode": status}},
                                "HeadObject")
            message = main.describe_s3_error(error)
            for needle in ("S3_REGION", "auto", "S3_ENDPOINT", "S3_ACCESS_KEY_ID"):
                self.assertIn(needle, message)

    def run_with_settings(self, **settings):
        with patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "api_urlopen", side_effect=self.api_responses()), \
                patch.dict(os.environ, settings):
            return main.run({})

    def test_retention_settings_are_passed_to_apply_retention(self):
        with patch.object(main, "apply_retention", return_value=(1, 0)) as retention:
            self.run_with_settings(RETENTION_DAYS="3", MIN_BACKUPS="2")
        self.assertEqual(retention.call_args.args[3:], (3, 2))
        with patch.object(main, "apply_retention", return_value=(1, 0)) as retention:
            self.run_with_settings(RETENTION_DAYS="", MIN_BACKUPS="")
        self.assertEqual(retention.call_args.args[3:], (30, 7))

    def test_invalid_retention_settings_name_the_setting(self):
        for name, value in (("RETENTION_DAYS", "abc"), ("RETENTION_DAYS", "0"), ("MIN_BACKUPS", "-1"),
                            ("MIN_BACKUPS", "1.5")):
            with self.assertRaises(main.BackupError) as raised:
                self.run_with_settings(**{name: value})
            self.assertIn(name, str(raised.exception))

    def test_main_emails_the_failure_and_skips_without_a_key(self):
        with patch.object(main, "run", side_effect=main.BackupError("boom")),                 patch.object(main, "notify_failure") as notify,                 patch("sys.stdin", io.StringIO("{}")):
            self.assertEqual(main.main(), 1)
        notify.assert_called_once_with("boom")
        with patch.dict(os.environ, {"APP_AUTOMATON_API_KEY": ""}), patch.object(main, "api_urlopen") as open_url:
            main.notify_failure("x")
        open_url.assert_not_called()

    def put_copy(self, age_hours):
        created = datetime.now(timezone.utc) - timedelta(hours=age_hours)
        key = f"automaton/automaton.test/app-one/automaton-{created:%Y%m%dT%H%M%SZ}.tar.age"
        self.s3.put_object(Bucket="automaton-backups", Key=key, Body=b"x")

    def stale_run(self, **env):
        sent = []
        with patch.dict(os.environ, env), patch.object(main, "make_s3_client", return_value=self.s3), \
                patch.object(main, "notify_failure", side_effect=lambda *a: sent.append(a)):
            try:
                result = main.check_stale()
            except main.StaleError as error:
                result = str(error)
        return result, sent

    def test_fresh_copy_is_not_stale(self):
        self.put_copy(3)
        result, sent = self.stale_run()
        self.assertFalse(result["stale"])
        self.assertEqual(sent, [])

    def test_old_copy_alerts_once_a_day_and_fails_the_run(self):
        self.put_copy(30)
        result, sent = self.stale_run()
        self.assertIn("older than the 26 hours", result)
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0][1], "Off-site backup is stale")
        result, sent = self.stale_run()
        self.assertIn("older than", result)
        self.assertEqual(sent, [])  # same day: no second alert

    def test_stale_hours_is_a_setting_and_no_copy_is_stale(self):
        self.put_copy(30)
        self.assertFalse(self.stale_run(STALE_HOURS="48")[0]["stale"])
        with self.assertRaises(main.BackupError):
            self.stale_run(STALE_HOURS="0")
        for key in [o["Key"] for o in self.s3.list_objects_v2(Bucket="automaton-backups").get("Contents", [])]:
            self.s3.delete_object(Bucket="automaton-backups", Key=key)
        result, sent = self.stale_run()
        self.assertIn("no off-site copy", result.lower())
        self.assertEqual(len(sent), 1)

    def test_main_runs_the_stale_check_and_does_not_email_twice(self):
        with patch.object(main, "check_stale", side_effect=main.StaleError("old")), \
                patch.object(main, "notify_failure") as notify, patch("sys.stdin", io.StringIO('{"check":"stale"}')):
            self.assertEqual(main.main(), 1)
        notify.assert_not_called()

    def test_s3_error_in_the_stale_check_does_not_alert_again(self):
        from botocore.exceptions import ClientError
        error = ClientError({"Error": {"Code": "InvalidAccessKeyId"}}, "ListObjectsV2")
        with patch.object(main, "make_s3_client", return_value=self.s3), patch.object(main, "list_copies", side_effect=error), \
                patch.object(main, "notify_failure") as notify, \
                patch("sys.stdin", io.StringIO('{"check":"stale"}')):
            self.assertEqual(main.main(), 1)
        notify.assert_not_called()

    def test_webhook_gets_the_failure_without_the_server(self):
        calls = []
        with patch.dict(os.environ, {"WEBHOOK_URL": "https://hooks.example.test/T/secret", "APP_AUTOMATON_API_KEY": ""}), \
                patch.object(main, "api_urlopen", side_effect=lambda r, timeout: calls.append(r) or io.BytesIO(b"")):
            main.notify_failure("Bucket missing")
        self.assertEqual(len(calls), 1)
        body = json.loads(calls[0].data)
        self.assertIn("Bucket missing", body["text"])
        self.assertEqual(body["text"], body["content"])

    def test_webhook_must_be_https_and_never_raises_or_prints_the_url(self):
        with patch.dict(os.environ, {"WEBHOOK_URL": "http://hooks.example.test/secret-token"}), \
                patch.object(main, "api_urlopen") as open_url, patch("sys.stderr", new_callable=io.StringIO) as err:
            main.notify_webhook("s", "r")
        open_url.assert_not_called()
        with patch.dict(os.environ, {"WEBHOOK_URL": "https://hooks.example.test/secret-token"}), \
                patch.object(main, "api_urlopen", side_effect=OSError("secret-token")), \
                patch("sys.stderr", new_callable=io.StringIO) as err2:
            main.notify_webhook("s", "r")
        self.assertNotIn("secret-token", err.getvalue() + err2.getvalue())


if __name__ == "__main__":
    unittest.main()
