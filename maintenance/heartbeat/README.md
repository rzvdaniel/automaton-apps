# Heartbeat

Gives each of your jobs a check-in URL and tells you when a check-in is missed, so a cron job or backup that silently stopped does not stay unnoticed. One missed check-in sends one alert; when the job checks in again you get one recovery message.

## How it works

1. Create a **check** for a job: a name, how often it should check in (**every**, for example `24h`) and how long to wait before alerting (**grace**, for example `1h`).
2. Make the job call the check's URL when it finishes: `curl -fsS https://<your app address>/ping/<token>` (GET, POST or HEAD).
3. If no check-in arrives within *every + grace*, you get one alert by email and, when `WEBHOOK_URL` is set, at the webhook. When the job checks in again, you get one recovery message. Nothing is repeated while the state stays the same.

A check that never checked in is counted from the moment it was created. Durations are written `90` (seconds), `5m`, `24h`, `1h30m` or `2d`; the shortest period is 1 minute.

## Install and set up

Install it from **Apps → Catalog** on your Automaton server, fill in the settings and deploy. The app is private by default: opening it signs you in through Studio, like Website Monitor, and there is no separate password.

| Name | Kind | Meaning |
| --- | --- | --- |
| `WEBHOOK_URL` | secret, optional | Where webhook alerts go (below). |
| `EMAIL_TO` | setting | Who gets alert emails: `administrators` (default), `owner`, `project` or an address an administrator put on the server's allowed list; separate several with commas. |
| `CHECK_INTERVAL_SECONDS` | setting | How often overdue checks are looked for. Default 30. |

Settings and secrets reach the app as environment variables when it starts, so after changing one in Studio, redeploy (restart) the app.

### Email alerts

The app asks for the `notify:email` permission. A system administrator approves it in Studio (the app's page; `automaton permissions status` prints the link) and the server needs its SMTP set up (Admin > Settings). The server sends the mail, so the app never sees SMTP credentials. The subject starts with `[Heartbeat]`; the server allows 10 emails an hour per app. Without the approval the app keeps working and alerts only the webhook (or the log). Only state changes are mailed, never repeats.

### Let your jobs reach the app

Jobs call `/ping/<token>` without signing in to Automaton. The app declares that path open (`openPaths`), so it works on the app's private address (`app-<id>.apps.<domain>`). The rest of that address, including the check list, asks for a Studio sign-in. Test with `curl -fsS <check-in URL>`: `OK` means the check-in was recorded.

Open the app's address, create checks and copy their URLs with the Copy button next to each. The list shows each check as OK, waiting (never checked in) or LATE.

**Upgrading.** After `automaton catalog update` the app keeps its checks and their URLs. An old `ADMIN_TOKEN` secret is ignored and can be deleted.

### Alerts

The alert is a JSON POST to `WEBHOOK_URL` with `text` (Slack, Telegram), `content` (Discord), `event` (`missed` or `recovered`) and `check` (the name):

- Slack: an Incoming Webhook URL.
- Discord: a channel webhook URL.
- Telegram: `https://api.telegram.org/bot<token>/sendMessage?chat_id=<chat id>`.
- Anything else that accepts a JSON POST (n8n, Zapier, your own endpoint).

If every channel fails (for example the webhook is unreachable and email is unavailable) the alert is retried on the next pass; if one channel took it, it is not repeated.

## Security

- Check-in URLs hold a random 192-bit token. Anyone who has a URL can check in for that job, so keep them like passwords; delete the check to invalidate its URL. An unknown token gets 404.
- The list, create and delete need Studio's sign-in: the platform proxy checks it and tells the app who is using it (`X-Automaton-Viewer-Role` and `X-Automaton-Viewer-Token`, the proxy removes any copy a visitor sends, on every route). The app refuses management requests without those headers, and trusts them only when Automaton runs it (`AUTOMATON_APP_ID` is set); see *Run it without Automaton*. Changes also need the `X-Heartbeat: 1` header that the page sets, so another site cannot make your browser change checks.
- **A published Heartbeat cannot be managed.** On a published address (and on `/ping/*`) the proxy strips those headers and does not sign anyone in, so the check list, create and delete answer 401 for everyone. Check-ins still work. To manage checks, keep the app private (the default), or unpublish it first. This needs an Automaton server that includes automaton#1307.
- Logs, and the request log, never contain check-in tokens, the webhook URL or the platform key. The alert text names the check, not its URL.
- Checks and their tokens are stored in the app's data directory (`checks.json`, owner-only), so a restart does not repeat alerts. If that file is damaged the app refuses to start (the log says why) instead of overwriting it.

## API

From the page's address while signed in to Studio (the platform adds the viewer headers), with `Content-Type: application/json` on POST and `X-Heartbeat: 1` on POST and DELETE: `GET /api/checks`, `POST /api/checks` with `{"name": "db-dump", "period": "24h", "grace": "1h"}`, `DELETE /api/checks/<id>`. There is no token for scripts; create checks in the page.

## Run it on its own

The app trusts the viewer headers only when Automaton runs it (the platform sets `AUTOMATON_APP_ID` for every app). Anywhere else anyone could forge those headers, so they are ignored and management needs an `ADMIN_TOKEN` of at least 16 characters. Run this from a copy of this folder (it needs `main.py`, `heartbeat.py`, `index.html`, `heartbeat.css` and `ui/`):

```yaml
services:
  heartbeat:
    image: python:3.12-slim
    user: "1000:1000"
    working_dir: /app
    command: python main.py
    ports: ["8080:8080"]
    environment:
      ADMIN_TOKEN: ${ADMIN_TOKEN}            # required to manage checks, 16+ characters
      AUTOMATON_APP_DATA_DIR: /data
      CHECK_INTERVAL_SECONDS: "30"
      EMAIL_TO: administrators
      # WEBHOOK_URL: https://hooks.example/...
    volumes:
      - ./:/app:ro
      - ./data:/data                          # the checks; make the folder writable for uid 1000
```

Environment variables:

| Variable | What it does |
| --- | --- |
| `ADMIN_TOKEN` | Secret. Signs you in on the page and the API (`Authorization: Bearer <ADMIN_TOKEN>`); at least 16 characters, otherwise management is refused. A wrong token is delayed by half a second. |
| `CHECK_INTERVAL_SECONDS` | How often overdue checks are looked for (5 to 3600 seconds, default 30). |
| `EMAIL_TO` | Who gets alert emails. Only works with Automaton's notify:email permission; on its own use `WEBHOOK_URL`. |
| `WEBHOOK_URL` | Secret, optional. Where alerts are sent: a Slack, Discord or Telegram webhook URL, or any URL that accepts a JSON POST. Empty: alerts only appear in the log. |
| `AUTOMATON_APP_DATA_DIR` | Folder for `checks.json` (default `data`). Mount a volume here so checks survive a restart. |
| `AUTOMATON_PORT` | Port to listen on (default 8080). |

The page asks for the token and forgets it when it is wrong, so you are asked again. Without a valid `ADMIN_TOKEN` the app still receives check-ins and sends alerts but refuses to list, create or delete checks (401). Do not set `AUTOMATON_APP_ID` yourself: it switches the trust in viewer headers back on. Put it behind HTTPS, since the token travels in a header.

## Why it is an app and not an Action

An Action runs in a fresh read-only container with no durable storage and no address of its own. Heartbeat has to receive check-ins at any time and remember them, so it is a small always-on app that also looks for overdue checks.

## Not in version 1

Teams or several users, cron-expression schedules, pausing a check, and a check-in history.

## Tests

```sh
python3 -m unittest discover -p 'test_*.py'
```
