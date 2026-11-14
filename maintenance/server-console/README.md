# Server Console

A dashboard for your Automaton server: how the machine and its Runners are doing, and the nightly cleanup, without SSH.

- **Machines:** with more than one Machine Management Runner, a picker under the top bar switches the page between machines. Each one shows its own figures, 24 hours of history and needs-you list; an offline Runner shows "offline, last reported ..." instead of old figures. Backups, certificates and Cleanup are the server's and stay the same (read-only; changes are made in Studio). The choice is remembered in the browser. Per-machine figures need an Automaton Server that reports them per Runner; older servers show their one host.
- **Resources:** CPU, memory, disk and load with 24 hours of history, and Docker disk use.
- **Server:** Automaton version, whether a newer release exists, OS name and uptime.
- **Updates:** pending and security OS updates (and how long security updates have been waiting) and whether a restart is required.
- **Runners:** version, online state and whether an upgrade is available.
- **Backups and certificates:** age of the last successful backup and days until the Studio and API certificates expire.
- **Cleanup:** the nightly Docker and journal cleanup of the server: last run and result, space freed, next run, and the last runs, read-only. It warns when the last run failed or is more than two days old, and **Change in Studio** opens Studio's Server page, where administrators change the schedule or run it now. The card appears only after an administrator approves `server:cleanup` (below).
- **Warnings:** one email (through your server's own SMTP) and, if you set one, one webhook message when disk free space drops below a threshold (default 20%, that is a disk more than 80% full), security updates wait longer than 7 days, or a restart has been required for more than 3 days, and one webhook message when it is resolved. Each warning says what to do about it, on the page and in the email.

It asks for the `server:read` and `notify:email` permissions, which cannot change anything on the server (the email goes only to the people you choose below), and `server:cleanup`, which is used only to read the cleanup: the app never changes it. Without the approval (or on a server older than the cleanup API) the card is hidden.

## Install and set up

1. Install it from **Apps -> Catalog** (needs Automaton Server 0.2.92 or newer for email, 0.2.56 for the rest, with a Machine Management Runner that has been upgraded to report host figures).
2. Fill in the settings and secrets below and deploy.
3. An administrator approves both permissions in Studio: **Admin -> Apps -> Review -> Permissions -> Approve** `server:read` and `notify:email`. Until `server:read` is approved the page says **Waiting for approval** and the app gets nothing; until `notify:email` is approved no email is sent (the log says so, and the webhook still works). `automaton permissions status` shows both requests. Email also needs SMTP set up in **Admin -> Settings**.

| Name | Kind | Meaning |
| --- | --- | --- |
| `AUTOMATON_API_URL` | provided by the server | Address of this server's API; nothing to enter. |
| `API_BASE_URL` | setting, optional | Older override, used only when `AUTOMATON_API_URL` is not set. |
| `STUDIO_URL` | setting, optional | Studio's address for the Change in Studio link; empty: taken from the page that frames the app, else the address the server reports. |
| `EMAIL_TO` | setting | Who gets warning emails: `administrators` (default), `owner`, `project` or `off`. |
| `WEBHOOK_URL` | secret | Optional, in addition to the email: a Slack, Discord or Telegram webhook, or any URL that accepts a JSON POST. Empty: no webhook. |
| `CHECK_INTERVAL_SECONDS` | setting | Default 300 (5 minutes), 60 to 3600. |
| `DISK_FREE_WARN_PERCENT` | setting | Default 20 (warn when the disk is more than 80% full). |
| `SECURITY_UPDATE_DAYS` | setting | Default 7. Counted from when the console first saw the updates waiting. |
| `REBOOT_DAYS` | setting | Default 3. |

Settings and secrets reach the app as environment variables when it starts, so redeploy (restart) after changing one.

## Warnings

Each condition sends one email when it starts (subject `[Server Console] Disk space is low` and so on, a short text and what to do), not one per check and not on recovery. The webhook warning is a JSON POST with `text` (Slack, Telegram), `content` (Discord), `event` (`warning` or `recovered`) and `condition` (`disk_low`, `security_overdue` or `reboot_overdue`). Each condition sends one warning when it starts and one message when it ends, not one per check. A channel that failed because of a network or server error is retried (the other is not asked again) on the next check; when email is refused (not approved, no SMTP) it is only logged and shown on the page.

## Where the numbers come from

The app calls `GET /api/server/health` of your server with its `APP_AUTOMATON_API_KEY`. The Machine Management Runner measures the host every 5 minutes, so figures are at most a few minutes old; Docker disk use and update counts come from the host (update counts need Ubuntu's update notifier and show "no data" elsewhere). History (24 hours, one point per check) and warning state are kept in `AUTOMATON_APP_DATA_DIR`.

The app has no password of its own. Automaton asks everyone who opens its private address to sign in: the owner, administrators and the people or projects you share the app with get through, everyone else gets `403`. **Do not publish this app**: publishing makes the page open to anyone. Needs Automaton Server 0.2.63 or newer; older servers left the private address open, which is why earlier versions of this app asked for an `ADMIN_TOKEN`.

The background check runs inside the app rather than as an Automaton Action, because an Action has no access to the app's data directory, where the history has to live.

## Run it without Automaton

```sh
AUTOMATON_API_URL=https://api.example.com APP_AUTOMATON_API_KEY=... python3 main.py --once
```

Prints the page's data as JSON and exits with 1 when no figures could be read. Without `--once`, `python3 main.py` serves the page on `AUTOMATON_PORT` (default 8080), with no sign-in: outside Automaton put your own login in front of it. Run the tests with `python3 -m unittest discover -p 'test_*.py'`.

## The page

Built only from the [Automaton app UI kit](../../design/automaton-app-ui/): `ui/app.css` and `ui/app.js` are copies of the kit (never edit them; change the kit and copy it again).
