# Gate Keeper

Shows who fail2ban has banned on your server, and why: for each jail the addresses banned right now, when each was banned and until when (or permanently), and how many new bans came in the last hour and 24 hours. **It is read-only**: it cannot unban, allow-list or change anything (unban and allowlist are planned for a later version). Access level: inside Automaton, Automaton's own sign-in is in front of the page; on its own, an `ADMIN_TOKEN`.

- **Page:** three headline numbers (banned now, last hour, last 24 hours) and one card per jail with its banned addresses, ban time and expiry. A banner says so when fail2ban is not running.
- **Home card:** Studio Home shows the counts and the busiest jails, never the addresses (the people who see Home are not all administrators). The platform asks for it every 15 minutes through the `home-card` Action (`actions/home-card`), which reads it from the running app.
- **Not in v1:** which paths were probed, an attempts chart and an alert email. fail2ban's database holds the address, jail and ban time, not the probed paths.

## Install and set up

1. Install it from **Apps -> Catalog** and deploy it. It needs an Automaton Server that has the `security:read` permission and a Machine Management Runner that has reported fail2ban (reports arrive every 5 minutes).
2. An administrator approves it: **Admin -> Apps -> Review -> Permissions -> Approve** `security:read`. Until then the page and the card say **Waiting for approval**.

`security:read` gives the app the bans fail2ban recorded and nothing else: no socket, firewall or shell access, and no way to change a ban. The server reads fail2ban's database through a short-lived, read-only helper on the Runner.

| Name | Kind | Meaning |
| --- | --- | --- |
| `AUTOMATON_API_URL` | provided by the server | Address of this server's API; nothing to enter. |
| `API_BASE_URL` | setting, optional | Older override, used only when `AUTOMATON_API_URL` is not set. |

**Do not publish this app**: publishing makes the page open to anyone, and it lists IP addresses.

## Where the numbers come from

`GET /api/server/security/fail2ban` with the app's `APP_AUTOMATON_API_KEY`. A ban counts as current until its recorded expiry, so a manual unban on the server shows until the ban would have expired. "Last hour" and "Last 24 hours" count new bans as the server reports them; standalone, the app counts distinct addresses per jail from the database, so a repeat offender can count differently between the two. Answers are cached for 20 seconds; the Runner's own report is at most a few minutes old.

## Run it on its own

Without Automaton the app reads fail2ban's SQLite database directly, mounted read-only, and asks for an `ADMIN_TOKEN` (at least 16 characters; a wrong token is slowed down; without one nothing is shown). Automaton's headers are ignored there.

```yaml
services:
  gate-keeper:
    build: .            # this folder; python:3.12-slim, run: python main.py
    ports: ["8080:8080"]
    user: "0:0"         # fail2ban's database is readable by root only
    read_only: true
    cap_drop: [ALL]
    environment:
      ADMIN_TOKEN: ${GATE_KEEPER_TOKEN}   # at least 16 characters
    volumes:
      - /var/lib/fail2ban/fail2ban.sqlite3:/host/fail2ban.sqlite3:ro
      - /run/fail2ban/fail2ban.pid:/host/fail2ban.pid:ro
```

| Name | Meaning |
| --- | --- |
| `ADMIN_TOKEN` | Required to open the page: at least 16 characters, sent as a Bearer token (the page asks for it). |
| `FAIL2BAN_DB` | Path of the mounted database, default `/host/fail2ban.sqlite3`. |
| `FAIL2BAN_PID` | Path of the mounted pid file, default `/host/fail2ban.pid`; "running" means it exists. |
| `AUTOMATON_PORT` | Port to listen on, default 8080. |

The app keeps no data of its own, so there is no data volume. It opens the database with `mode=ro`; if the database was not shut down cleanly and needs recovery on a read-only mount, the page says it could not read it. Put your own TLS in front of it. Without Automaton there is no Home card (nothing calls it), though `/api/home-card` still answers.

```sh
FAIL2BAN_DB=/var/lib/fail2ban/fail2ban.sqlite3 python3 main.py --once
```

Prints the figures as JSON and exits with 1 when they could not be read. Run the tests with `python3 -m unittest discover -p 'test_*.py'`.
