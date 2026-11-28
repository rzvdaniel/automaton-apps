#!/bin/sh
# Fetches the File Browser release archive of one pinned upstream version for the Runner's CPU and checks its checksum.
# The binary is the official, unmodified upstream build (Apache-2.0).
set -eu

VERSION="v2.63.23"
SHA256_AMD64="b14db2bb8033caa3f80205eb6578b2ed0744ebd9e716b790bc4a9703ce909e88"
SHA256_ARM64="c55b3450b6ac07ef73b5b49f0b2955a8e755100b71af1df73f9e5d25b12fd27a"

case "$(uname -m)" in
	x86_64 | amd64) ARCH="amd64"; SHA256="$SHA256_AMD64" ;;
	aarch64 | arm64) ARCH="arm64"; SHA256="$SHA256_ARM64" ;;
	*) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac
URL="https://github.com/filebrowser/filebrowser/releases/download/${VERSION}/linux-${ARCH}-filebrowser.tar.gz"

work="$PWD/.work"
rm -rf "$work"
mkdir "$work"
trap 'rm -rf "$work"' EXIT
python3 -I -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$URL" "$work/fb.tar.gz"
echo "$SHA256  $work/fb.tar.gz" | sha256sum -c -
python3 -I -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extract("filebrowser", sys.argv[2], filter="data")' "$work/fb.tar.gz" "$work"

rm -rf dist
mkdir dist
cp "$work/filebrowser" dist/filebrowser
chmod 755 dist/filebrowser
cp run.sh LICENSE.upstream.txt dist/
rm -rf "$work"
