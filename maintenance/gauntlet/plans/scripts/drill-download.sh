# Restore drill, step 1: downloads the newest backup archive (.tar.age) from the off-site bucket and puts the backup key
# beside it for the restore only (mode 600, never printed). The credentials arrive as DRILL_* variables; they only read.
set -euo pipefail
: "${DRILL_BACKUP_KEY:?DRILL_BACKUP_KEY is not set}" "${DRILL_S3_ACCESS_KEY_ID:?DRILL_S3_ACCESS_KEY_ID is not set}" \
  "${DRILL_S3_SECRET_ACCESS_KEY:?DRILL_S3_SECRET_ACCESS_KEY is not set}" "${DRILL_S3_ENDPOINT:?DRILL_S3_ENDPOINT is not set}" \
  "${DRILL_S3_BUCKET:?DRILL_S3_BUCKET is not set}"
export DRILL_S3_REGION=${DRILL_S3_REGION:-auto}
dir=${DRILL_DIR:-/root/.gauntlet/drill}; result=${DRILL_RESULT_DIR:-/root/.gauntlet/drill-result}
umask 077; mkdir -p "$dir" "$result"; rm -f "$dir"/*.tar.age "$result"/*
date +%s > "$result/start"
python3 -I - "$dir" <<'PY'
import datetime, hashlib, hmac, os, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

dest = sys.argv[1]
endpoint, bucket, region = os.environ["DRILL_S3_ENDPOINT"].rstrip("/"), os.environ["DRILL_S3_BUCKET"], os.environ["DRILL_S3_REGION"]
access, secret = os.environ["DRILL_S3_ACCESS_KEY_ID"], os.environ["DRILL_S3_SECRET_ACCESS_KEY"]
if not endpoint.startswith(("https://", "http://")):
    sys.exit("DRILL_S3_ENDPOINT must start with https://")
host = urllib.parse.urlsplit(endpoint).netloc
NAME = re.compile(r"automaton-([0-9]{8}T[0-9]{6}Z)\.tar\.age$")

def sign(key, text):
    return hmac.new(key, text.encode(), hashlib.sha256).digest()

def request(path, query):
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    canon_path = urllib.parse.quote("/" + bucket + path, safe="/")
    canon_query = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted(query.items()))
    empty = hashlib.sha256(b"").hexdigest()
    headers = f"host:{host}\nx-amz-content-sha256:{empty}\nx-amz-date:{stamp}\n"
    signed = "host;x-amz-content-sha256;x-amz-date"
    canonical = "\n".join(["GET", canon_path, canon_query, headers, signed, empty])
    scope = f"{day}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = sign(sign(sign(sign(("AWS4" + secret).encode(), day), region), "s3"), "aws4_request")
    signature = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(endpoint + canon_path + ("?" + canon_query if canon_query else ""), headers={
        "x-amz-date": stamp, "x-amz-content-sha256": empty,
        "Authorization": f"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={signature}"})
    return urllib.request.urlopen(req, timeout=120)

candidates, token = [], None
while True:
    query = {"list-type": "2", "prefix": "automaton/"}
    if token:
        query["continuation-token"] = token
    try:
        root = ET.fromstring(request("", query).read())
    except Exception as error:
        sys.exit(f"could not list the bucket: {type(error).__name__} {getattr(error, 'code', '')}".strip())
    for element in root.iter():
        if element.tag.endswith("Key") and element.text and NAME.search(element.text):
            candidates.append(element.text)
    more = next((e.text for e in root.iter() if e.tag.endswith("NextContinuationToken")), None)
    if not more:
        break
    token = more
if not candidates:
    sys.exit("no .tar.age backup under automaton/ in the bucket")
newest = max(candidates, key=lambda k: NAME.search(k).group(1))
name = os.path.basename(newest)
try:
    response, size = request("/" + newest, {}), 0
    expected = int(response.headers.get("Content-Length") or -1)
    with open(os.path.join(dest, name), "wb") as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
            size += len(chunk)
except Exception as error:
    sys.exit(f"could not download the newest backup: {type(error).__name__} {getattr(error, 'code', '')}".strip())
if size == 0 or (expected >= 0 and size != expected):
    sys.exit(f"the download is incomplete ({size} of {expected} bytes)")
print(f"downloaded {name} ({size} bytes) from {len(candidates)} backups in the bucket")
PY
printf '%s\n' "$DRILL_BACKUP_KEY" > "$dir/backup-key"; chmod 600 "$dir/backup-key"
unset DRILL_BACKUP_KEY DRILL_S3_ACCESS_KEY_ID DRILL_S3_SECRET_ACCESS_KEY
ls "$dir"/*.tar.age | head -1 | xargs basename > "$result/archive"
echo "backup key placed for the restore"
