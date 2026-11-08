# Server Console

A read-only dashboard for your Automaton server: how the machine and its Runners are doing, without SSH.

- **Resources:** current CPU, memory, disk and load as tiles, and CPU, memory and disk as charts of the last 24 hours (inline SVG, no external library), plus Docker disk use.
- **Server:** Automaton version, whether a newer release exists, OS name and uptime.
- **Updates:** badges for pending and security OS updates (and how long security updates have been waiting) and whether a restart is required.
- **Runners:** version, online state and whether an upgrade is available.
- **Backups and certificates:** status rows with the age of the last successful backup and days until the Studio and API certificates expire.
- **Warnings:** one webhook message when disk free space drops below a threshold (default 15%), security updates wait longer than 7 days, or a restart has been required for more than 3 days, and one message when it is resolved.

It only asks for the `server:read` permission, so it cannot change anything on the server.

## Install and set up

1. Install it from **Apps -> Catalog** (needs Automaton Server 0.2.56 or newer, with a Machine Management Runner that has been upgraded to report host figures). There is nothing to fill in.
2. An administrator approves `server:read` in Studio: **Admin -> Apps -> Review -> Permissions -> Approve**. Until then the page says **Waiting for approval** and the app gets nothing. `automaton permissions status` shows the request.
3. Optional: turn alerts on later in Studio: the app's **Settings -> Secrets -> Add a secret**, name `WEBHOOK_URL`, a Slack, Discord or Telegram webhook (or any URL that accepts a JSON POST), then redeploy. Without it the **Alerts** card says alerts are off.

The console uses `AUTOMATON_API_URL` when the server provides it. Servers that do not yet provide it leave the console to work the address out from the address you open it at (`app-<id>.apps.example.com` gives `https://api.example.com`) the first time someone opens the page. Until the page has been opened once the app says it does not know the server address. If your server does not follow that naming, set the optional `API_BASE_URL` setting and redeploy.

| Name | Kind | Meaning |
| --- | --- | --- |
| `WEBHOOK_URL` | secret, optional | Where alerts go. Empty: alerts are off. |
| `API_BASE_URL` | setting, optional | Address of this server's API, only if it cannot be worked out. |
| `CHECK_INTERVAL_SECONDS` | setting | Default 300 (5 minutes), 60 to 3600. |
| `DISK_FREE_WARN_PERCENT` | setting | Default 15. |
| `SECURITY_UPDATE_DAYS` | setting | Default 7. Counted from when the console first saw the updates waiting. |
| `REBOOT_DAYS` | setting | Default 3. |

Settings reach the app as environment variables when it starts, so redeploy (restart) after changing one.

## Warnings

The warning is a JSON POST with `text` (Slack, Telegram), `content` (Discord), `event` (`warning` or `recovered`) and `condition` (`disk_low`, `security_overdue` or `reboot_overdue`). Each condition sends one warning when it starts and one message when it ends, not one per check. A warning the webhook did not accept is retried on the next check.

## Where the numbers come from

The app calls `GET /api/server/health` of your server with its `APP_AUTOMATON_API_KEY`. The Machine Management Runner measures the host every 5 minutes, so figures are at most a few minutes old; Docker disk use and update counts come from the host (update counts need Ubuntu's update notifier and show "no data" elsewhere). History (24 hours, one point per check) and warning state are kept in `AUTOMATON_APP_DATA_DIR`.

The app has no password of its own. Automaton asks everyone who opens its private address to sign in: the owner, administrators and the people or projects you share the app with get through, everyone else gets `403`. **Do not publish this app**: publishing makes the page open to anyone. Needs Automaton Server 0.2.63 or newer; older servers left the private address open, which is why earlier versions of this app asked for an `ADMIN_TOKEN`.

The background check runs inside the app rather than as an Automaton Action, because an Action has no access to the app's data directory, where the history has to live.

## Run it without Automaton

```sh
API_BASE_URL=https://api.example.com APP_AUTOMATON_API_KEY=... python3 main.py --once
```

Prints the page's data as JSON and exits with 1 when no figures could be read. Without `--once`, `python3 main.py` serves the page on `AUTOMATON_PORT` (default 8080), with no sign-in: outside Automaton put your own login in front of it. Run the tests with `python3 -m unittest discover -p 'test_*.py'`.

## The page

Built only from the [Automaton app UI kit](../../design/automaton-app-ui/): `ui/app.css` and `ui/app.js` are copies of the kit (never edit them; change the kit and copy it again).
