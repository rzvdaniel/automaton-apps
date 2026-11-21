"""Lists this install's off-site copies for the Backup Warden restore page. Standard library only: a signed
ListObjectsV2 request, the same folder and file names the upload Action writes."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

BACKUP_NAME = re.compile(r"^automaton-[0-9]{8}T[0-9]{6}Z$")
MAX_LISTING = 200


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Config:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        get = lambda name: env.get(name, "").strip()  # noqa: E731
        self.endpoint, self.bucket, self.region = get("S3_ENDPOINT").rstrip("/"), get("S3_BUCKET"), get("S3_REGION") or "us-east-1"
        self.access_key, self.secret_key = get("S3_ACCESS_KEY_ID"), get("S3_SECRET_ACCESS_KEY")
        host = urlsplit(get("API_BASE_URL")).netloc
        app_id = get("AUTOMATON_APP_ID")
        default = f"automaton/{host}/{app_id}/"
        requested = get("S3_PREFIX")
        self.prefix = requested.rstrip("/") + "/" if requested else default
        self.problem = ""
        if not (self.endpoint.startswith(("http://", "https://")) and self.bucket and self.access_key and self.secret_key):
            self.problem = "The off-site storage settings (S3_ENDPOINT, S3_BUCKET and the S3 secrets) are not set."
        elif not host or not app_id or "/" in app_id:
            self.problem = "The server address or app ID is not set."
        elif not re.fullmatch(r"[A-Za-z0-9._/:@-]+", self.endpoint + self.bucket + self.prefix):
            self.problem = "S3_ENDPOINT, S3_BUCKET or S3_PREFIX has a character the restore command cannot show safely."
        elif requested.startswith("/") or ".." in requested.split("/") or not self.prefix.startswith(default):
            self.problem = "S3_PREFIX must stay inside this install's own folder."


def _sign(key: bytes, text: str) -> bytes:
    return hmac.new(key, text.encode(), hashlib.sha256).digest()


def _signed_get(config: Config, key: str, query: dict, now: datetime, opener, limit: int = 5_000_000) -> bytes:
    canonical_query = "&".join(f"{quote(k, safe='')}={quote(v, safe='')}" for k, v in sorted(query.items()))
    parts = urlsplit(config.endpoint)
    path = parts.path.rstrip("/") + "/" + quote(config.bucket, safe="") + ("/" + quote(key, safe="/") if key else "")
    stamp, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    empty = hashlib.sha256(b"").hexdigest()
    headers = {"host": parts.netloc, "x-amz-content-sha256": empty, "x-amz-date": stamp}
    signed = ";".join(sorted(headers))
    canonical = "\n".join(["GET", path, canonical_query, "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), signed, empty])
    scope = f"{day}/{config.region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    signing = _sign(_sign(_sign(_sign(("AWS4" + config.secret_key).encode(), day), config.region), "s3"), "aws4_request")
    signature = hmac.new(signing, to_sign.encode(), hashlib.sha256).hexdigest()
    authorization = f"AWS4-HMAC-SHA256 Credential={config.access_key}/{scope}, SignedHeaders={signed}, Signature={signature}"
    request = Request(f"{parts.scheme}://{parts.netloc}{path}" + (f"?{canonical_query}" if canonical_query else ""), headers={
        "x-amz-date": stamp, "x-amz-content-sha256": empty, "Authorization": authorization, "User-Agent": "Automaton-Offsite-Backup"})
    with (opener or build_opener(_NoRedirect())).open(request, timeout=20) as response:
        return response.read(limit)


def _list_page(config: Config, token: str | None, now: datetime, opener) -> ET.Element:
    query = {"list-type": "2", "prefix": config.prefix}
    if token:
        query["continuation-token"] = token
    return ET.fromstring(_signed_get(config, "", query, now, opener))


def last_checkin(config: Config, now: datetime | None = None, opener=None) -> dict | None:
    """The outcome the upload Action stored after its last check-in call: {at, ok, message}, or None when there is none."""
    if config.problem:
        return None
    try:
        data = json.loads(_signed_get(config, config.prefix + ".last-checkin", {}, now or datetime.now(timezone.utc), opener, 10_000))
        return {"at": str(data["at"]), "ok": bool(data["ok"]), "message": str(data.get("message", ""))[:200]}
    except (HTTPError, URLError, OSError, ValueError, KeyError, TypeError):
        return None


def restore_command(config: Config, key: str) -> str:
    """Download the copy with the AWS CLI (the administrator's own credentials), then restore it on the server."""
    file = key.rsplit("/", 1)[-1]
    return (f"aws s3 cp --endpoint-url '{config.endpoint}' 's3://{config.bucket}/{key}' ./{file}\n"
            f"sudo bash /opt/automaton-server/restore.sh --archive ./{file} --key /path/to/backup-key")


def list_copies(config: Config, now: datetime | None = None, opener=None):
    """Returns (status, copies, message); copies are newest first: name, key, createdAt, sizeBytes, command."""
    if config.problem:
        return "not_configured", None, config.problem
    now = now or datetime.now(timezone.utc)
    found, token = [], None
    try:
        for _ in range(20):
            root = _list_page(config, token, now, opener)
            ns = root.tag[:root.tag.index("}") + 1] if root.tag.startswith("{") else ""
            for item in root.findall(f"{ns}Contents"):
                key = item.findtext(f"{ns}Key") or ""
                name = key[len(config.prefix):-len(".tar.age")] if key.startswith(config.prefix) and key.endswith(".tar.age") else ""
                if BACKUP_NAME.fullmatch(name):
                    try:
                        created = datetime.strptime(name.removeprefix("automaton-"), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                    found.append((created, key, int(item.findtext(f"{ns}Size") or 0)))
            token = root.findtext(f"{ns}NextContinuationToken") if root.findtext(f"{ns}IsTruncated") == "true" else None
            if not token:
                break
    except HTTPError as error:
        return "error", None, f"The storage answered HTTP {error.code}. Check the S3 settings (the Off-site backup run names the one to fix)."
    except (URLError, OSError, ET.ParseError):
        return "error", None, "The storage could not be read. Check S3_ENDPOINT and that this server can reach it."
    found.sort(reverse=True)
    return "ok", [{"name": key.rsplit("/", 1)[-1], "createdAt": created.isoformat(), "sizeBytes": size,
                   "command": restore_command(config, key)} for created, key, size in found[:MAX_LISTING]], None
