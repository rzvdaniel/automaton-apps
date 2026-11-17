#!/bin/sh
# Fetches the VictoriaLogs release archive of one pinned upstream version for the Runner's CPU and checks its checksum.
# The binary is the official, unmodified upstream build (Apache-2.0).
set -eu

VERSION="v1.54.0"
SHA256_AMD64="739e78c82294520b6079bc8a6ae32a1f9fb95a543092929a53a2fe9ab7383016"
SHA256_ARM64="f6c4eb5bc4e2ec5a70c75f670f038122eed907b7e635b66497e80d38956561fa"

case "$(uname -m)" in
	x86_64 | amd64) ARCH="amd64"; SHA256="$SHA256_AMD64" ;;
	aarch64 | arm64) ARCH="arm64"; SHA256="$SHA256_ARM64" ;;
	*) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac
URL="https://github.com/VictoriaMetrics/VictoriaLogs/releases/download/${VERSION}/victoria-logs-linux-${ARCH}-${VERSION}.tar.gz"

work="$(mktemp -d)"
python3 -I -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$URL" "$work/vl.tar.gz"
echo "$SHA256  $work/vl.tar.gz" | sha256sum -c -
python3 -I -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extract("victoria-logs-prod", sys.argv[2])' "$work/vl.tar.gz" "$work"

rm -rf dist
mkdir dist
cp "$work/victoria-logs-prod" dist/victoria-logs-prod
chmod 755 dist/victoria-logs-prod
cp run.sh LICENSE.upstream.txt dist/
