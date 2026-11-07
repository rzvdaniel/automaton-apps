#!/bin/sh
# Fetches the IT-Tools release archive of one pinned upstream version and checks its checksum.
# Upstream builds it in its own release workflow; compiling it here needs more memory than a 4 GB Runner has.
# Nothing in it is modified.
set -eu

VERSION="2024.10.22-7ca5933"
SHA256="eef276d675db6053bdc65cd8482a566785561c70eed5035a0e05b0e627b0989d"
URL="https://github.com/CorentinTh/it-tools/releases/download/v${VERSION}/it-tools-${VERSION}.zip"

work="$(mktemp -d)"
python3 -I -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$URL" "$work/it-tools.zip"
echo "$SHA256  $work/it-tools.zip" | sha256sum -c -
python3 -I -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$work/it-tools.zip" "$work"

rm -rf dist
cp -r "$work/dist" dist
cp LICENSE dist/LICENSE.txt
