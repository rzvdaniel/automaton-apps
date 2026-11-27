# Head Counter

Tracks public GitHub release asset downloads, excluding our own reports, without contacting installed servers or changing the installer. Downloads are not confirmed running servers or distinct people.

## Install and set up

Install Head Counter from **Apps → Catalog** and set the `HEAD_COUNTER_TOKEN` secret to a random value of at least 16 characters. Keep the app private. Automaton's sign-in protects the page and its management API; only `/ours` and `/summary.json` are open through the proxy, and both require the bearer token. Do not publish the app: published routes do not provide trusted viewer headers for management.

Configure the senders from [automaton#1802](https://github.com/rzvdaniel/automaton/issues/1802) with the app URL and the same token (the repository secret `HEAD_COUNTER_TOKEN`). Report **each actual release asset download** separately. On the page choose the release and file and press **+1 ours** for a missed manual report.

```sh
curl -fsS https://<app-address>/ours \
  --oauth2-bearer "$HEAD_COUNTER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"file":"install-automaton.sh","version":"0.2.197","source":"manual-check"}'
curl -fsS https://<app-address>/summary.json \
  --oauth2-bearer "$HEAD_COUNTER_TOKEN"
```

`file` is `install-automaton.sh`, `install.sh`, `automaton-server.tar.gz`, or a CLI binary such as `automaton-linux-x64` or `automaton-win-x64.exe`. CLI binary names follow `automaton-{linux|osx|win}-{architecture}`, optionally ending in `.exe`; checksums are excluded. `version` accepts `0.2.197`, `v0.2.197`, or the GitHub tag `server-v0.2.197`. `source` is a short identifying label, not a secret. The latest 100 reports appear on the page and in the summary; all are retained for the calculation. Do not report retries unless the file was actually downloaded again. The API does not deduplicate reports.

## How counting works

The app reads all pages of the public GitHub releases API on startup and hourly, storing the latest successful snapshot for each UTC day. A failed refresh keeps the last snapshot and shows a warning. Only `server-v*` releases and the assets described above are tracked; checksums and other installer scripts are not included. GitHub sees the Head Counter server's IP address; installed servers do not contact Head Counter unless they are our own senders.

For each release and file, others are GitHub downloads minus our reports, clamped to zero. **Server installs** are downloads of `install-automaton.sh`; **CLI installs** are the sum of `install.sh` and CLI binary downloads. A CLI install that downloads both the script and a binary contributes twice. The server bundle is accepted and recorded, but is not part of either measure. Updates are not measured: they mostly pull from GHCR, which has no per-download count. GitHub counts are cumulative, reports may arrive late or before GitHub updates its counters, and assets can be replaced. GitHub totals on the page are lifetime asset counts, not daily downloads.

The first successful snapshot starts the observation window: **since start** counts changes from that baseline, not earlier GitHub downloads. When upgrading from the earlier two-asset version, a fresh baseline is taken for the expanded asset set; old snapshots and reports remain stored. The week is UTC Monday through Sunday, using the last Sunday snapshot as its baseline; if the first observation is this week, the week is marked partial. If no Sunday snapshot or current-week snapshot is available, weekly counts are unavailable rather than including earlier weeks. Because snapshots are not guaranteed at midnight, the displayed start and end times show the actual window. Reports after the baseline are subtracted immediately, even before GitHub's next refresh. Delayed reports for older downloads can therefore distort the window. Keep the data volume to preserve the baseline and reports.

`GET /summary.json` returns JSON with `observed_from`, `updated_at`, `error`, `week_error`, `github` (raw lifetime totals, per-file reports and counts of others per release), `week`, `since_start` (`server_installs`, `cli_installs` and per-release rows), and `ours` (latest reports). A null since-start means no successful snapshot; a null week also means the boundary snapshot is missing or stale. All timestamps are UTC.

## Run it on its own

Run from a copy of this folder. Create `./data` writable by uid 1000 and use HTTPS in front of the app.

```yaml
services:
  head-counter:
    image: python:3.12-slim
    user: "1000:1000"
    working_dir: /app
    command: python main.py
    ports: ["8080:8080"]
    environment:
      ADMIN_TOKEN: ${ADMIN_TOKEN}
      HEAD_COUNTER_TOKEN: ${HEAD_COUNTER_TOKEN}
      AUTOMATON_APP_DATA_DIR: /data
    volumes:
      - ./:/app:ro
      - ./data:/data
```

| Variable | Meaning |
| --- | --- |
| `ADMIN_TOKEN` | Standalone page/API token, at least 16 characters; the page asks for it. |
| `HEAD_COUNTER_TOKEN` | Separate bearer token for `/ours` and `/summary.json`, at least 16 characters. |
| `AUTOMATON_APP_DATA_DIR` | Persistent database directory; defaults to `data`. |
| `AUTOMATON_PORT` | Listen port, default `8080`. |

Wrong tokens are delayed by half a second. Viewer headers are ignored outside Automaton. Do not set `AUTOMATON_APP_ID` yourself; Automaton sets it and sanitizes viewer headers at its proxy. The page token is kept in browser session storage for the tab. Neither token is written to the database or request log.

## Tests

Run `./test.sh` from this folder. It runs the Python unit and HTTP tests and the packaged-app smoke build.
