# Watchtower

Watches your Automaton server and emails you when something needs attention. One engine, several watchers: this version ships the engine and a **dummy watcher** to prove it; the real watchers (backups, disks, apps, attacks) come in later releases ([#217](https://github.com/rzvdaniel/automaton-apps/issues/217)).

## How it works

1. Each watcher runs on its own schedule (default every 30 s for the dummy) and returns findings, each with a stable key. Detection is rules only, no AI.
2. A finding with a new key becomes an **alert** and one email is sent. While the watcher keeps reporting the key nothing is repeated.
3. When the watcher stops reporting it, the alert is resolved and moves to the history. If it comes back later, it is a new alert and a new email.
4. Every email carries a **Mute 24h** link. A muted alert is not emailed, and stays muted for the period; you can also mute and unmute from the page. An alert that was muted before its first email is sent once when the mute ends, if the condition still holds.

The page lists active alerts, the watchers (turn each on or off) and the history. It is built from the Automaton app UI kit.

## Install and set up

Install from **Apps → Catalog**, fill in the secret and deploy.

| Name | Kind | Meaning |
| --- | --- | --- |
| `ADMIN_TOKEN` | secret | Password for the page: at least 16 random characters, for example `openssl rand -hex 24`. |
| `EMAIL_TO` | setting | Who gets alert emails: `administrators` (default), `owner`, `project` or an address an administrator put on the server's allowed list; separate several with commas. |
| `PUBLIC_URL` | setting | The address you open the app at, for the Mute link in emails. Empty: emails have no link. |
| `CHECK_INTERVAL_SECONDS` | setting | How often due watchers are looked for. Default 10. |

Redeploy after changing a setting. The app asks for `notify:email`; a system administrator approves it in Studio and the server needs SMTP (Admin > Settings). The server allows 10 emails an hour per app. Without the approval alerts still show on the page and in the log.

## Try it

Open the page, sign in with the admin token and press **Trigger test condition**: one alert appears and one email goes out. Pressing it again does nothing new; **Clear test condition** resolves the alert.

## Security

- The page and API need the admin token (Bearer). A wrong token costs a short delay.
- The Mute link holds a random 192-bit token and is the only open path (`/mute/*`). Opening it shows a page; only pressing its button mutes, so mail scanners that open links change nothing. Anyone with the link can mute that alert for 24 hours, nothing else.
- State is stored in the app's data directory (`state.json`, owner-only). If it is damaged the app refuses to start instead of overwriting it.

## API

With `Authorization: Bearer <ADMIN_TOKEN>`: `GET /api/state`, `PUT /api/rules/<watcher>` with `{"enabled": true, "interval": 60}`, `POST /api/alerts/<id>/mute` with `{"hours": 24}`, `DELETE /api/alerts/<id>/mute`, `POST /api/dummy` with `{"on": true}`, `POST /api/run`.

## Run it without Automaton

```sh
ADMIN_TOKEN=$(openssl rand -hex 24) python main.py
python -m unittest discover -p 'test_*.py'
```

## Adding a watcher

Write a function `run(state) -> list[finding]` in `watchtower.py` (`finding(key, title, detail, severity)`) and add it to `WATCHERS` with its label and default interval. The engine does the rest.
