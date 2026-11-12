#!/usr/bin/env python3
"""Copy the newest encrypted Automaton backup to S3-compatible storage."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import BinaryIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

import boto3
from botocore.config import Config
from botocore.exceptions import (BotoCoreError, ClientError, ConnectTimeoutError, EndpointConnectionError,
                                 ReadTimeoutError, SSLError)


BACKUP_NAME = re.compile(r"^automaton-[0-9]{8}T[0-9]{6}Z$")
PART_SIZE = 8 * 1024 * 1024
DEFAULT_RETENTION_DAYS = 30
DEFAULT_MINIMUM_BACKUPS = 7


class BackupError(RuntimeError):
    """A safe-to-report failure that does not include credential values."""


class RejectRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def api_urlopen(request, timeout: int):
    return build_opener(RejectRedirectHandler()).open(request, timeout=timeout)


def required_secret(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise BackupError(f"Required app secret {name} is not set.")
    return value


def required_setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise BackupError(f"Required app setting {name} is not set.")
    return value


def positive_int_setting(name: str, default: int, minimum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        value = minimum - 1
    if value < minimum:
        raise BackupError(f"App setting {name} must be a whole number of at least {minimum}.")
    return value


def parse_timestamp(name: str) -> datetime:
    if not isinstance(name, str) or not BACKUP_NAME.fullmatch(name):
        raise BackupError("The backup API returned an invalid backup name.")
    try:
        return datetime.strptime(name.removeprefix("automaton-"), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise BackupError("The backup API returned an invalid backup timestamp.") from error


def api_json(base_url: str, path: str, api_key: str) -> dict:
    request = Request(
        base_url.rstrip("/") + path,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    try:
        with api_urlopen(request, timeout=60) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise BackupError("Could not read backup metadata from the Automaton API.") from error


def download_stream(base_url: str, name: str, api_key: str) -> BinaryIO:
    request = Request(
        base_url.rstrip("/") + f"/api/install/backups/{quote(name, safe='')}/archive",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/octet-stream"},
    )
    try:
        return api_urlopen(request, timeout=120)
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        raise BackupError("Could not download the selected encrypted backup.") from error


def make_s3_client(endpoint: str, region: str, access_key: str, secret_key: str):
    parsed = urlparse(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password \
            or parsed.query or parsed.fragment:
        raise BackupError("S3_ENDPOINT must be an HTTP(S) endpoint URL without query or fragment.")
    return boto3.client(
        "s3",
        endpoint_url=endpoint.rstrip("/"),
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      # Newer boto3 adds CRC32 checksums by default; Backblaze B2 and older MinIO reject them.
                      request_checksum_calculation="when_required", response_checksum_validation="when_required"),
    )


def describe_s3_error(error: Exception) -> str:
    """Say which S3 setting is probably wrong, without echoing any value."""
    if isinstance(error, ClientError):
        code = str(error.response.get("Error", {}).get("Code", ""))
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code == "InvalidAccessKeyId":
            return "The storage does not know the access key. Check the S3_ACCESS_KEY_ID secret and S3_ENDPOINT."
        if code == "SignatureDoesNotMatch":
            return ("The storage rejected the signature. Check the S3_SECRET_ACCESS_KEY secret and S3_REGION "
                    "(use the provider's region; MinIO uses us-east-1).")
        if code == "NoSuchBucket":
            return "The bucket in S3_BUCKET does not exist on this endpoint. Check S3_BUCKET and S3_ENDPOINT."
        if code in ("", "400", "403") and status in (400, 403):
            # HEAD responses have no body, so there is no error code to match; the region is the usual cause.
            return ("The storage rejected the first request without saying why. Check S3_REGION (Cloudflare R2 "
                    "uses auto), S3_ENDPOINT and the S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY secrets "
                    "(the key must be allowed to read, write and delete in S3_BUCKET).")
        if code in ("AccessDenied", "Forbidden", "403") or status == 403:
            return ("The storage refused access. Check the S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY secrets, "
                    "that the key may read, write and delete in S3_BUCKET, and S3_BUCKET and S3_ENDPOINT.")
        if code in ("AuthorizationHeaderMalformed", "IllegalLocationConstraintException", "PermanentRedirect"):
            return "The storage says the region or endpoint is wrong. Check S3_REGION and S3_ENDPOINT."
        return f"The storage returned an error ({code or status or 'unknown'}). Check the S3 settings."
    if isinstance(error, (EndpointConnectionError, ConnectTimeoutError, ReadTimeoutError, SSLError)):
        return ("Could not reach the storage. Check S3_ENDPOINT (the full URL, with https://) and that this server "
                "can connect to it.")
    return f"The S3 settings were not accepted ({type(error).__name__}). Check S3_ENDPOINT, S3_BUCKET and S3_REGION."


def object_key(prefix: str, name: str) -> str:
    return f"{prefix}{name}.tar.age"


def object_has_hash(s3, bucket: str, key: str, digest: str) -> bool:
    try:
        response = s3.head_object(Bucket=bucket, Key=key)
    except ClientError as error:
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        code = error.response.get("Error", {}).get("Code")
        if status == 404 or code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise
    return response.get("Metadata", {}).get("sha256", "").lower() == digest.lower()


def upload_multipart(s3, bucket: str, key: str, response: BinaryIO, expected_size: int, expected_hash: str) -> None:
    upload = s3.create_multipart_upload(Bucket=bucket, Key=key, ContentType="application/octet-stream",
                                        Metadata={"sha256": expected_hash.lower()})
    upload_id = upload["UploadId"]
    parts = []
    digest = hashlib.sha256()
    total = 0
    try:
        part_number = 1
        while block := response.read(PART_SIZE):
            total += len(block)
            digest.update(block)
            result = s3.upload_part(Bucket=bucket, Key=key, UploadId=upload_id,
                                    PartNumber=part_number, Body=block)
            parts.append({"PartNumber": part_number, "ETag": result["ETag"]})
            part_number += 1

        if total != expected_size or digest.hexdigest().lower() != expected_hash.lower():
            raise BackupError("Downloaded backup size or SHA-256 did not match the API metadata.")
        if not parts:
            raise BackupError("The downloaded backup archive was empty.")
        s3.complete_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id,
                                     MultipartUpload={"Parts": parts})
    except Exception:
        try:
            s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
        except Exception:
            pass
        raise


def apply_retention(s3, bucket: str, prefix: str, retention_days: int, minimum_backups: int) -> tuple[int, int]:
    objects = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            name = key[len(prefix):-len(".tar.age")] if key.startswith(prefix) and key.endswith(".tar.age") else ""
            if BACKUP_NAME.fullmatch(name):
                try:
                    objects.append((parse_timestamp(name), key))
                except BackupError:
                    continue  # matches the pattern but is not a real date; leave it alone

    objects.sort(reverse=True)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    keep = {key for index, (created, key) in enumerate(objects) if index < minimum_backups or created >= cutoff}
    stale = [key for _, key in objects if key not in keep]
    for offset in range(0, len(stale), 1000):
        batch = stale[offset:offset + 1000]
        if batch:
            response = s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True})
            if response.get("Errors"):
                raise BackupError("Some expired backup objects could not be deleted.")
    return len(objects) - len(stale), len(stale)


def run(input_data: dict) -> dict:
    base_url = required_setting("API_BASE_URL").rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password \
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise BackupError("API_BASE_URL must be this server's HTTP(S) API base URL.")
    api_key = required_secret("APP_AUTOMATON_API_KEY")
    bucket = required_setting("S3_BUCKET")
    endpoint = required_setting("S3_ENDPOINT")
    access_key = required_secret("S3_ACCESS_KEY_ID")
    secret_key = required_secret("S3_SECRET_ACCESS_KEY")
    region = os.environ.get("S3_REGION", "").strip() or "us-east-1"
    app_id = os.environ.get("AUTOMATON_APP_ID", "").strip()
    if not app_id or "/" in app_id:
        raise BackupError("AUTOMATON_APP_ID is not set; run this Action from an installed app.")
    server_prefix = f"automaton/{parsed.netloc}/"
    default_prefix = f"{server_prefix}{app_id}/"
    requested_prefix = os.environ.get("S3_PREFIX", "").strip()
    if requested_prefix.startswith("/") or ".." in requested_prefix.split("/"):
        raise BackupError("prefix must be relative and cannot contain '..' segments.")
    prefix = requested_prefix.rstrip("/") + "/" if requested_prefix else default_prefix
    if not prefix.startswith(default_prefix):
        raise BackupError("prefix must stay within this install's own folder (automaton/<server host>/<app ID>/).")

    retention_days = positive_int_setting("RETENTION_DAYS", DEFAULT_RETENTION_DAYS, 1)
    minimum_backups = positive_int_setting("MIN_BACKUPS", DEFAULT_MINIMUM_BACKUPS, 1)

    status = api_json(base_url, "/api/install/backups", api_key)
    backups = status.get("backups")
    if not status.get("available") or not isinstance(backups, list):
        raise BackupError("The Automaton server has no available backup status.")
    eligible = []
    for item in backups:
        if not isinstance(item, dict):
            continue
        try:
            parse_timestamp(item.get("name", ""))
        except BackupError:
            continue
        if isinstance(item.get("archiveSizeBytes"), int) and item["archiveSizeBytes"] > 0 \
                and isinstance(item.get("archiveSha256"), str) \
                and re.fullmatch(r"[0-9a-fA-F]{64}", item["archiveSha256"]):
            eligible.append(item)
    eligible.sort(key=lambda item: parse_timestamp(item["name"]), reverse=True)
    if not eligible:
        # Fail loudly and leave the off-site copies untouched: the server may have stopped encrypting backups.
        raise BackupError("No encrypted local backups are available. Check the server's nightly backup.")

    backup = eligible[0]
    name = backup.get("name", "")
    expected_size = backup.get("archiveSizeBytes")
    expected_hash = backup.get("archiveSha256")

    s3 = make_s3_client(endpoint, region, access_key, secret_key)
    key = object_key(prefix, name)
    uploaded = False
    try:
        if not object_has_hash(s3, bucket, key, expected_hash):
            with download_stream(base_url, name, api_key) as archive:
                upload_multipart(s3, bucket, key, archive, expected_size, expected_hash)
            uploaded = True
        retained, deleted = apply_retention(s3, bucket, prefix, retention_days, minimum_backups)
    except (ClientError, BotoCoreError) as error:
        raise BackupError(describe_s3_error(error)) from error
    return {"uploaded": uploaded, "backup": name, "retained": retained, "deleted": deleted}


def notify_failure(reason: str) -> None:
    """Email the failure through the server's notify:email permission. Never raises; skips quietly without it."""
    api_key = os.environ.get("APP_AUTOMATON_API_KEY", "").strip()
    base_url = os.environ.get("API_BASE_URL", "").strip().rstrip("/")
    if not api_key or not base_url.startswith(("http://", "https://")):
        return
    to = os.environ.get("NOTIFY_EMAIL_TO", "").strip() or "administrators"
    body = json.dumps({
        "to": [to],
        "subject": "Off-site backup failed",
        "text": f"The off-site backup did not complete.\n\n{reason}\n\nOpen the app in Studio to see the run log.",
    }).encode()
    request = Request(base_url + "/api/notify/email", data=body, method="POST", headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with api_urlopen(request, timeout=30):
            pass
        print("Failure email sent.", file=sys.stderr)
    except HTTPError as error:
        hint = {400: "check NOTIFY_EMAIL_TO (administrators, owner or project)",
                403: "approve the notify:email permission", 409: "set up the server's SMTP settings",
                429: "the app's limit of 10 emails an hour is used up"}.get(error.code, "see the server's audit events")
        print(f"Failure email not sent (HTTP {error.code}): {hint}.", file=sys.stderr)
    except Exception:
        print("Failure email not sent.", file=sys.stderr)


def main() -> int:
    try:
        data = json.load(sys.stdin)
        if not isinstance(data, dict):
            raise BackupError("Action input must be a JSON object.")
        print(json.dumps(run(data), separators=(",", ":")))
        return 0
    except BackupError as error:
        print(str(error), file=sys.stderr)
        notify_failure(str(error))
        return 1
    except Exception as error:  # Avoid dumping boto3/HTTP exception details that could contain identifiers.
        message = f"Off-site backup failed ({type(error).__name__})."
        print(message, file=sys.stderr)
        notify_failure(message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
