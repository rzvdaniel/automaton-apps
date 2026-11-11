# GoatCounter

[GoatCounter](https://github.com/arp242/goatcounter) by Martin Tournoij: privacy-friendly web analytics. It counts page views without cookies and without tracking visitors, with a small script (`count.js`) or by server logs.

- **Upstream:** https://github.com/arp242/goatcounter
- **License:** EUPL-1.2 with upstream's modifications (the `count.js` script is ISC, bundled components keep their licenses). The upstream license text is in [LICENSE](LICENSE) and is copied next to the binary. Upstream is not modified.
- **Packaged version:** `2.7.0`.

## Configuration

Asked when you install, and applied again on every start (change a value in Studio and restart the app):

- `GC_DOMAIN` (setting, default `stats.example.com`): a placeholder. The platform does not tell an app its own address, and the address (`app-<id>...`, or the public one after you make the app public) only exists after the install, so keep the default. GoatCounter serves its single site at any address, so you can sign in right away. On every start it is written to GoatCounter's own **Domain** setting (Settings → Main), so after the install you can set it to the app's public address, `<name>.apps.<server domain>`, and restart.
- `GC_EMAIL` (setting) and `GC_PASSWORD` (secret): the first administrator. You sign in with the email. The password is applied to the first administrator on every start, so a changed `GC_PASSWORD` takes effect after a restart (a password changed in GoatCounter's account pages is replaced by `GC_PASSWORD` at the next start). The email is used only when the account is created; change it in GoatCounter's account pages.

Statistics (SQLite) are kept in the app data directory, so they survive redeploys and restarts. GoatCounter reserves environment variables that start with `GOATCOUNTER_`, so the settings use the `GC_` prefix.

## Set the domain

Until you do, the script GoatCounter shows names `stats.example.com`. Set `GC_DOMAIN` in Studio to your app's address (the host only, without `https://`; an app is served at `<name>.apps.<server domain>`) and restart. The value is applied on every start, so editing **Domain** in GoatCounter's own settings is overwritten by `GC_DOMAIN` at the next start. The dashboard's setup box and **Settings → Site code** then show your address; the dashboard's setup box and **Settings → Site code** then show your address.

## Track a website

Sign in, open **Settings → Site code** (or the dashboard's setup box) and paste the script on every page you want to count, just before `</body>`. Use your app's address:

```html
<script data-goatcounter="https://YOUR-APP-ADDRESS/count"
        async src="https://YOUR-APP-ADDRESS/count.js"></script>
```

The app's public access must stay on so visitors' browsers can load the script and send page views.

## Platform notes (Automaton server 0.2.55 or later)

The platform passes the visitor's `Host` and form bodies to the app, so sign-in and page counting work at the app address.

- The container runs as uid 1000 (`runtime.user`) so the Runner (also uid 1000) can delete the app's data ([#804](https://github.com/rzvdaniel/automaton/issues/804)).

## How it is sourced (approach B, built from a pinned release)

`build.sh` runs on the Runner at deploy time. It downloads the release source of that one tag from GitHub, checks its SHA-256 against the value pinned in the script, and builds the static binary exactly as upstream's own `Dockerfile` does (`-trimpath`, `-tags osusergo,netgo,sqlite_omit_load_extension`, static linking), with a pinned Go image. The result (the binary, `run.sh`, the license) is the deployed app. On a 2 vCPU / 4 GB Runner the build takes about 90 seconds. To update, change `VERSION` and `SHA256` in `build.sh` and the version here, and check the Go version in `automaton.json` against upstream's `go.mod`.

## Install

Install it from **Apps → Catalog** on your Automaton server, or from Studio's **Install from a Git address** with this folder's address.
