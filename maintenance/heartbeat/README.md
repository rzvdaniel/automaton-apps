# Heartbeat

Gives each of your jobs a check-in URL and tells you when a check-in is missed, so a cron job or backup that silently stopped does not stay unnoticed. One missed check-in sends one alert; when the job checks in again you get one recovery message.

## How it works

1. Create a **check** for a job: a name, how often it should check in (**every**, for example `24h`) and how long to wait before alerting (**grace**, for example `1h`).
2. Make the job call the check's URL when it finishes: `curl -fsS https://<your app address>/ping/<token>` (GET, POST or HEAD).
3. If no check-in arrives within *every + grace*, you get one alert by email and, when `WEBHOOK_URL` is set, at the webhook. When the job checks in again, you get one recovery message. Nothing is repeated while the state stays the same.

A check that never checked in is counted from the moment it was created. Durations are written `90` (seconds), `5m`, `24h`, `1h30m` or `2d`; the shortest period is 1 minute.

## Install and set up

Install it from **Apps → Catalog** on your Automaton server, fill in the secrets and deploy.

| Name | Kind | Meaning |
| --- | --- | --- |
| `ADMIN_TOKEN` | secret | Password for the check list: at least 16 random characters, for example `openssl rand -hex 24`. Without it nobody can create or list checks (existing check-in URLs keep working). |
| `WEBHOOK_URL` | secret, optional | Where webhook alerts go (below). |
| `EMAIL_TO` | setting | Who gets alert emails: `administrators` (default), `owner`, `project` or an address an administrator put on the server's allowed list; separate several with commas. |
| `CHECK_INTERVAL_SECONDS` | setting | How often overdue checks are looked for. Default 30. |

Settings and secrets reach the app as environment variables when it starts, so after changing one in Studio, redeploy (restart) the app.

### Email alerts

The app asks for the `notify:email` permission. A system administrator approves it in Studio (the app's page; `automaton permissions status` prints the link) and the server needs its SMTP set up (Admin > Settings). The server sends the mail, so the app never sees SMTP credentials. The subject starts with `[Heartbeat]`; the server allows 10 emails an hour per app. Without the approval the app keeps working and alerts only the webhook (or the log). Only state changes are mailed, never repeats.

### Let your jobs reach the app

Jobs call `/ping/<token>` without signing in to Automaton. The app declares that path open (`openPaths`), so it works on the app's private address (`app-<id>.apps.<domain>`). The rest of that address, including the check list, asks for an Automaton sign-in. To manage checks without it, or to use a short address, publish the app (`automaton publish`); the page still needs the admin token. Test with `curl -fsS <check-in URL>`: `OK` means the check-in was recorded.

Open the app's address, sign in with the admin token, create checks and copy their URLs with the Copy button next to each. The list shows each check as OK, waiting (never checked in) or LATE.

### Alerts

The alert is a JSON POST to `WEBHOOK_URL` with `text` (Slack, Telegram), `content` (Discord), `event` (`missed` or `recovered`) and `check` (the name):

- Slack: an Incoming Webhook URL.
- Discord: a channel webhook URL.
- Telegram: `https://api.telegram.org/bot<token>/sendMessage?chat_id=<chat id>`.
- Anything else that accepts a JSON POST (n8n, Zapier, your own endpoint).

If the webhook is unreachable the alert is retried on the next pass.

## Security

- Check-in URLs hold a random 192-bit token. Anyone who has a URL can check in for that job, so keep them like passwords; delete the check to invalidate its URL. An unknown token gets 404.
- The app's address is public, but the page only offers a sign-in: the list, create and delete need the admin token (sent as a Bearer token). Use a long random one: a wrong token only costs a short delay per attempt.
- Logs, and the request log, never contain check-in tokens, the admin token, the webhook URL or the platform key. The alert text names the check, not its URL.
- Checks and their tokens are stored in the app's data directory (`checks.json`, owner-only), so a restart does not repeat alerts. If that file is damaged the app refuses to start (the log says why) instead of overwriting it.

## API

With `Authorization: Bearer <ADMIN_TOKEN>` and, for POST, `Content-Type: application/json` (without it the request body does not reach the app): `GET /api/checks`, `POST /api/checks` with `{"name": "db-dump", "period": "24h", "grace": "1h"}`, `DELETE /api/checks/<id>`.

## Run it without Automaton

```sh
ADMIN_TOKEN="$(openssl rand -hex 24)" AUTOMATON_PORT=8080 AUTOMATON_APP_DATA_DIR=./data python3 main.py
```

## Why it is an app and not an Action

An Action runs in a fresh read-only container with no durable storage and no address of its own. Heartbeat has to receive check-ins at any time and remember them, so it is a small always-on app that also looks for overdue checks.

## Not in version 1

Teams or several users, cron-expression schedules, pausing a check, and a check-in history.

## Tests

```sh
python3 -m unittest discover -p 'test_*.py'
```
