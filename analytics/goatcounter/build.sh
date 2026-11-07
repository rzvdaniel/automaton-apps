#!/bin/sh
# Builds GoatCounter from one pinned upstream release tag, as upstream's own Dockerfile does. Upstream source is not modified.
set -eu

VERSION="2.7.0"
SHA256="c919f9113a10916a46a1a6a180fd43552eff2d3503aa7890f41d03fa640ac471"
URL="https://github.com/arp242/goatcounter/archive/refs/tags/v${VERSION}.tar.gz"

app="$(pwd)"
# Build containers have a tiny /tmp, so work inside the app folder and remove it afterwards.
work="$app/.build"
rm -rf "$work"
mkdir "$work"
trap 'chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT
curl -fsSL "$URL" -o "$work/goatcounter.tar.gz"
echo "$SHA256  $work/goatcounter.tar.gz" | sha256sum -c -
mkdir "$work/src"
tar xzf "$work/goatcounter.tar.gz" -C "$work/src" --strip-components=1

cd "$work/src"
mkdir "$work/tmp"
export HOME="$work/home" GOCACHE="$work/gocache" GOPATH="$work/gopath" GOTMPDIR="$work/tmp" TMPDIR="$work/tmp" GOTOOLCHAIN=local CGO_ENABLED=1
go build -trimpath -ldflags='-s -w -extldflags=-static' \
	-tags='osusergo,netgo,sqlite_omit_load_extension' \
	-o "$work/goatcounter" ./cmd/goatcounter

rm -rf "$app/dist"
mkdir "$app/dist"
cp "$work/goatcounter" "$app/dist/goatcounter"
cp LICENSE "$app/dist/LICENSE"
cp "$app/run.sh" "$app/dist/run.sh"
