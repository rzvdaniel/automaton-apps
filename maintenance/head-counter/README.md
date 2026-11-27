# Head Counter

Tracks public GitHub release asset downloads, excluding our own reports, without contacting installed servers or changing the installer. **These numbers cannot measure server installs or updates:** `install.sh` installs the Automaton CLI, not the server, and the normal server updater may pull a GHCR image instead of the release bundle. They count downloads, not distinct people.

## Install and set up

Install Head Counter from **Apps → Catalog** and set the `HEAD_COUNTER_TOKEN` secret to a random value of at least 16 characters. Keep the app private. Automaton's sign-in protects the page and its management API; only `/ours` and `/summary.json` are open through the proxy, and both require the bearer token. Do not publish the app: published routes do not provide trusted viewer headers for management.

Configure the senders from [automaton#1802](https://github.com/rzvdaniel/automaton/issues/1802) with the app URL and the same token (the repository secret `HEAD_COUNTER_TOKEN`). Report **each actual asset download**; a check that downloads both files needs two reports. On the page choose the release and file and press **+1 ours** for a missed manual report. The sender issue's assumption that server installs download `install.sh` needs verification.

```sh
curl -fsS https://<app-address>/ours \
  --oauth2-bearer "$HEAD_COUNTER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"file":"install.sh","version":"0.2.197","source":"manual-check"}'
curl -fsS https://<app-address>/summary.json \
  --oauth2-bearer "$HEAD_COUNTER_TOKEN"
```

`file` is exactly `install.sh` or `automaton-server.tar.gz`; `version` accepts `0.2.197`, `v0.2.197`, or the GitHub tag `server-v0.2.197`. `source` is a short identifying label, not a secret. The latest 100 reports appear on the page and in the summary; all are retained for the calculation. Do not report retries unless the file was actually downloaded again. The API does not deduplicate reports.

## How counting works

The app reads all pages of the public GitHub releases API on startup and hourly, storing the latest successful snapshot for each UTC day. A failed refresh keeps the last snapshot and shows a warning. Only `server-v*` releases and the two named assets are counted; checksums, other binaries and other installer scripts are not included. GitHub sees the Head Counter server's IP address; installed servers do not contact Head Counter unless they are our own senders.

For each release and file, others are GitHub downloads minus our reports, clamped to zero. The requested install proxy is the `install.sh` count; the requested update proxy is the bundle count minus that installer count, clamped to zero. The API retains the names `installs` and `updates` for these proxies, **not actual server installs and updates**. GitHub counts are cumulative, reports may arrive late or before GitHub updates its counters, and assets can be replaced. GitHub totals on the page are lifetime asset counts, not daily downloads.

The first successful snapshot starts the observation window: **since start** counts changes from that baseline, not earlier GitHub downloads. The week is UTC Monday through Sunday, using the last Sunday snapshot as its baseline; if the first observation is this week, the week is marked partial. If no Sunday snapshot or current-week snapshot is available, weekly counts are unavailable rather than including earlier weeks. Because snapshots are not guaranteed at midnight, the displayed start and end times show the actual window. Reports after the baseline are subtracted immediately, even before GitHub's next refresh. Delayed reports for older downloads can therefore distort the window. Keep the data volume to preserve the baseline and reports.

`GET /summary.json` returns JSON with `observed_from`, `updated_at`, `error`, `week_error`, `github` (raw lifetime totals, ours and proxies per release), `week`, `since_start` (window, proxy values and per-release rows), and `ours` (latest reports). A null since-start means no successful snapshot; a null week also means the boundary snapshot is missing or stale. All timestamps are UTC.

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
