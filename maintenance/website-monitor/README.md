# Website Monitor

Checks your websites (hosted anywhere, not only on this Automaton server) every few minutes and sends an alert when one is down or its TLS certificate is about to expire. One outage sends one alert and one recovery message, not one every five minutes.

## What it checks

For each site, on every run:

- **Status:** the final HTTP status (redirects are followed) must be below 400, or equal the expected status you give.
- **Keyword:** optionally, the first MiB of the page must contain a word or phrase (matched as UTF-8 text, so HTML entities and other encodings do not match).
- **Response time:** shown on the status page.
- **Certificate:** days left on the HTTPS certificate. A warning is sent once when it falls to `CERT_WARN_DAYS` or fewer, a note when it is renewed, and a site whose certificate has expired counts as down.

A failed check is retried once after 3 seconds before it counts, so one dropped request does not wake you up.

## Install and set up

Install it from **Apps → Catalog** on your Automaton server and deploy. It needs no settings: it starts empty, and you add your sites on the app's own page (**Add a site**: address, optional expected status, optional keyword; each row has Edit and Remove). The list is stored in the app's data directory and a new site is checked right away.

**Upgrading from a version with a `SITES` setting:** the first start after the upgrade imports the old `SITES` value into the list once (invalid or duplicate lines are skipped). After that, the page is the only place sites are managed and the old value is ignored.

| Name | Kind | Meaning |
| --- | --- | --- |
| `CHECK_INTERVAL_SECONDS` | setting | Default 300, minimum 60. |
| `CERT_WARN_DAYS` | setting | Default 14. |
| `TIMEOUT_SECONDS` | setting | Default 10. |
| `WEBHOOK_URL` | secret, optional | Where webhook alerts go (below). |
| `EMAIL_TO` | setting | Who gets alert emails: `administrators` (default), `owner`, `project` or an address an administrator put on the server's allowed list; separate several with commas. |
| `HEARTBEAT_URL` | secret, optional | Pinged with GET after every successful run (below). Leave empty to skip. |

At most 50 sites. Settings and secrets reach the app as environment variables when it starts, so after changing one in Studio, redeploy (restart) the app.

### Email alerts

The app asks for the `notify:email` permission. A system administrator approves it in Studio (the app's page; `automaton permissions status` prints the link) and the server needs its SMTP set up (Admin > Settings). The server sends the mail, so the app never sees SMTP credentials. The subject starts with `[Website Monitor]`; the server allows 10 emails an hour per app. Without the approval the app keeps working and alerts only the webhook (or the log). Only state changes are mailed, never repeats.

### Webhook alerts

The alert is a JSON POST to `WEBHOOK_URL` with `text` (Slack, Telegram), `content` (Discord), `event` (`down`, `recovered`, `cert_warning` or `cert_ok`) and `site`:

- Slack: an Incoming Webhook URL.
- Discord: a channel webhook URL.
- Telegram: `https://api.telegram.org/bot<token>/sendMessage?chat_id=<chat id>`.
- Anything else that accepts a JSON POST (n8n, Zapier, your own endpoint).

If every channel fails (for example the webhook is unreachable and email is unavailable) the alert is retried on the next run; if one channel took it, it is not repeated. Alerts show the site URL without credentials or query string.

### Heartbeat: also notice when this server is down

Create a free check at an outside service such as healthchecks.io, set its URL as `HEARTBEAT_URL`, and give the check a period of a few intervals. The app pings it after every run that completed (all sites checked, state saved) and does not ping after a run that failed, for example because a setting such as `CHECK_INTERVAL_SECONDS` is invalid. When the pings stop, the outside service alerts you, which also covers the whole Automaton server being down.

## Status page

**Upgrading an app you published:** the page can now add and remove sites, and the app fetches the addresses you give it, so anyone with the link could do the same. Republish it with `automaton publish --private` (Automaton sign-in required) before upgrading.

Keep the app private (the default): the page asks for your Automaton sign-in, and that sign-in is what protects adding and removing sites. Forms are only accepted from the page itself. If you publish the app, anyone with the link can change the list, so don't. The public-safe parts are what `/status.json` returns: each site's address (no query string), status, response time and certificate days; a failed keyword check names the keyword in its detail. If the last run failed, the page says why. `/health` answers `ok`.

State (the last result per site, and what you were already told) is stored in the app's data directory, so a restart does not repeat alerts. Logs contain the alert texts and errors, never the webhook or heartbeat URLs.

## Watching your Automaton server itself

This app cannot report its own server going down. To watch an Automaton server, install Website Monitor on a *second, separate* Automaton server (not a Runner of the same one), add the first server's address, and preferably set a `WEBHOOK_URL` so the alert does not depend on the server that is down.

## Run it without Automaton

```sh
AUTOMATON_APP_DATA_DIR=./data SITES="https://example.com|200" python3 main.py --once
```

`SITES` (one `url|status|keyword` per line) is read only to seed an empty `data/sites.json`. Prints one line per site and exits with 1 if a site is down. Without `--once`, `python3 main.py` runs the status page and the check loop (port from `AUTOMATON_PORT`, state under `AUTOMATON_APP_DATA_DIR`, default `data`).

## Why it is an app and not an Action

An Action runs in a fresh read-only container with no durable storage, so it cannot remember the last result per site. A small always-on app keeps that state, which is what makes one outage one alert.

## Not in version 1

Per-site intervals, and a public status page with history.

## Tests

```sh
python3 -m unittest discover -p 'test_*.py'
```
