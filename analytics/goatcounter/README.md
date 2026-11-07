# GoatCounter

[GoatCounter](https://github.com/arp242/goatcounter) by Martin Tournoij: privacy-friendly web analytics. It counts page views without cookies and without tracking visitors, with a small script (`count.js`) or by server logs.

- **Upstream:** https://github.com/arp242/goatcounter
- **License:** EUPL-1.2 with upstream's modifications (the `count.js` script is ISC, bundled components keep their licenses). The upstream license text is in [LICENSE](LICENSE) and is copied next to the binary. Upstream is not modified.
- **Packaged version:** `2.7.0`.

## Configuration

Asked when you install, used the first time the database is created:

- `GC_DOMAIN` (setting): the address the site is opened at, without `https://`, for example `stats.example.com`. GoatCounter finds the site by this host name.
- `GC_EMAIL` (setting) and `GC_PASSWORD` (secret): the first administrator. You sign in with the email. Changing them later does not change an existing account; use GoatCounter's own account pages.

Statistics (SQLite) are kept in the app data directory, so they survive redeploys and restarts. GoatCounter reserves environment variables that start with `GOATCOUNTER_`, so the settings use the `GC_` prefix.

## Known limits on the platform (until fixed)

- GoatCounter picks the site from the request's `Host` header, but Automaton passes the address of its own proxy instead of the public host ([#805](https://github.com/rzvdaniel/automaton/issues/805)), and drops the body of web form posts ([#802](https://github.com/rzvdaniel/automaton/issues/802)). Signing in and counting page views through the public address therefore do not work yet.
- The container runs as uid 1000 (`runtime.user`) so the Runner (also uid 1000) can delete the app's data ([#804](https://github.com/rzvdaniel/automaton/issues/804)).

## How it is sourced (approach B, built from a pinned release)

`build.sh` runs on the Runner at deploy time. It downloads the release source of that one tag from GitHub, checks its SHA-256 against the value pinned in the script, and builds the static binary exactly as upstream's own `Dockerfile` does (`-trimpath`, `-tags osusergo,netgo,sqlite_omit_load_extension`, static linking), with a pinned Go image. The result (the binary, `run.sh`, the license) is the deployed app. On a 2 vCPU / 4 GB Runner the build takes about 90 seconds. To update, change `VERSION` and `SHA256` in `build.sh` and the version here, and check the Go version in `automaton.json` against upstream's `go.mod`.

## Install

Install it from **Apps → Catalog** on your Automaton server, or from Studio's **Install from a Git address** with this folder's address.
