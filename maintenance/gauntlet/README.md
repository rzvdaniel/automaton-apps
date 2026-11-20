# Gauntlet

Installs, uses, uninstalls and reinstalls Automaton on your own test machines on a schedule, and tells you when something breaks, before a release reaches users.

Gauntlet signs in to each machine over SSH and runs **plans**: lists of steps, each with a command, a check and a timeout. Every run and each step's log is kept in the app's own database. The **Reports** page shows history, each step's pass or fail, its timing and its log, and a **Run now** button starts a plan. Studio Home shows a card with the last result of each scheduled plan.

## Plans

Plans are JSON files in [`plans/`](plans/). Each step runs a script from [`plans/scripts/`](plans/scripts/) (or a short `command`) as `root`, or as the limited `automaton` user (`"as": "automaton"`). A step passes when the exit status is the expected one (`exit`, default 0) and the output has the text in `contains` and not the text in `not_contains`. A failed step stops the plan unless the step says `"continue": true`.

| Plan | Machine | When | What it does |
| --- | --- | --- | --- |
| `smoke` | `runner-02` | every day 02:30 UTC | Wipes the machine (`uninstall-automaton.sh --delete-data --yes`), installs the latest build, creates the administrator and signs the CLI in, checks the default apps and pending permissions, deploys a sample app and runs a backup, restarts the machine, checks log forwarding, uninstalls and checks nothing is left. |
| `full-cycle` | `nu8` | every Sunday 03:00 UTC | The same, then installs again. Each install also creates a non-root `automaton` user with the limited sudo rules of production (the updater, Backup now and `systemctl status automaton-*`) and checks through that user, so a step that needs more root than production allows fails here first. |
| `upgrade` | `nu8` | every Saturday 03:00 UTC | Installs the latest stable version, adds data, updates to the newest published server release and checks everything still works. |
| `docs-walk` | `runner-02` | every Wednesday 04:00 UTC | Claude Code follows the install docs as a new user (it changes nothing) and reports anything unclear or wrong. |

The machine of a plan is the name of an entry in `TARGETS`. To add or change a plan without changing the app, put a JSON file with the same shape in `plans/` inside the app's data folder; a file with the name of a built-in plan replaces it. A plan's `schedule` is `daily HH:MM`, `weekly mon HH:MM` (UTC) or `manual`; a plan with `"wipes": true` is refused on any machine that is not marked `disposable`. A scheduled plan runs once per slot and never for a slot before the app was first started. One run at a time.

The target's facts reach each script as environment variables: `DOMAIN`, `ADDRESS`, `EMAIL` (certificate email) and `INSTALL_FLAGS` (the target's optional `install_flags`, for example `--tls-mode http`).

## Machines

Set `TARGETS` (settings) to a JSON list and put a private key that may sign in to them in the `SSH_KEY` secret (a key made for Gauntlet, no passphrase):

```json
[
  {"name": "runner-02", "host": "root@203.0.113.9", "domain": "r2.example.com", "email": "you@example.com", "disposable": true},
  {"name": "nu8", "host": "root@203.0.113.7", "domain": "nu8.example.com", "disposable": true}
]
```

- `disposable: true` says the machine may be wiped. Without it, plans that wipe are refused before any command runs. **Never list a production server and never use the production key.**
- The first host key Gauntlet sees for an address is remembered in the data folder and must match afterwards.
- Plans that install Automaton need the domain's `domain` and `*.domain` DNS records to point at the machine.
- The `automaton` user of the `full-cycle` plan is created by the plan on the machine; Gauntlet itself only needs root over SSH.
- Installing every night uses real Let's Encrypt certificates, which are limited to a few a week for the same names. The installer has no staging option yet, so give a nightly machine `install_flags` that avoids new certificates (for example `--tls-mode cloudflare`), or schedule the plan weekly.

## When a run fails

1. **Email.** One email per failed run through `notify:email` (`EMAIL_TO`), with the failed steps and the issue link.
2. **Diagnosis.** If `CLAUDE_TARGET` names a machine with Claude Code installed and signed in (its own login), Gauntlet sends it the redacted failure and `CLAUDE_COMMAND` (default `claude -p --allowedTools Read,Grep,Glob`: read-only, it never changes code, merges or touches production) answers with the repository, title and body following the automaton-write-issue skill.
3. **Issue.** Gauntlet opens one GitHub issue with `GITHUB_TOKEN` in a repository from `ISSUE_REPOS` (`owner/name`, comma separated; Claude's choice is used only if it is on the list, then the failing step's `repo`, then the plan's). Without Claude the issue has the failed steps and their logs and says no diagnosis was available. `BOARDS` puts the issue on that repository's project board.
4. **Repeats.** The same plan failing at the same step on the same machine comments "Failed again" on the open issue instead of opening a new one. After a later pass Gauntlet comments "Passing again" once. It never closes an issue. If someone closed the issue, the next failure opens a new one.

Logs are scrubbed of the SSH key, tokens, passwords and private keys before they are stored, emailed or posted. Without `GITHUB_TOKEN` or `ISSUE_REPOS` only the email goes.

## Access

Run by Automaton, Automaton's own sign-in is in front: anyone who may open the app can read reports, and only a system administrator can start a run (a run can wipe a machine). The Home card holds no host names or logs.

## Run it on its own

Anywhere else the viewer headers are ignored (anyone could forge them) and the app needs an `ADMIN_TOKEN` of at least 16 characters; without one it refuses to show or start anything. Install the SSH library once into the folder (`pip install --target lib paramiko`), then run it from a copy of this folder (`main.py`, `gauntlet.py`, `failures.py`, `index.html`, `gauntlet.js`, `gauntlet.css`, `plans/`, `ui/` and `lib/`):

```yaml
services:
  gauntlet:
    image: python:3.12-slim
    user: "1000:1000"
    working_dir: /app
    command: python main.py
    ports: ["8080:8080"]
    environment:
      ADMIN_TOKEN: ${ADMIN_TOKEN}
      AUTOMATON_APP_DATA_DIR: /data
      TARGETS: '[{"name":"nu8","host":"root@203.0.113.7","domain":"nu8.example.com","disposable":true}]'
      SSH_KEY: ${SSH_KEY}
      # GITHUB_TOKEN: ${GITHUB_TOKEN}
      # ISSUE_REPOS: owner/repo
    volumes:
      - ./:/app:ro
      - ./data:/data        # history, remembered host keys and your own plans; make it writable for uid 1000
```

| Variable | What it does |
| --- | --- |
| `ADMIN_TOKEN` | Secret. `Authorization: Bearer <token>` for the page and API; at least 16 characters. A wrong token is delayed by half a second. |
| `TARGETS` | The machines, as above. Required. |
| `SSH_KEY` | Secret. The private key for every target. A key with newlines written as `\n` also works. |
| `EMAIL_TO` | Who gets failure emails. Needs Automaton's `notify:email`; on its own there is no email and the page and log show failures. |
| `ISSUE_REPOS` | Repositories a failure may open an issue in (`owner/name`, comma separated). |
| `GITHUB_TOKEN` | Secret, optional. May create issues and comments in `ISSUE_REPOS` and add to the boards. |
| `BOARDS` | Optional JSON `{"owner/name": {"owner": "login", "number": 1}}`. |
| `CLAUDE_TARGET`, `CLAUDE_COMMAND` | Machine and command for the diagnosis. |
| `AUTOMATON_APP_DATA_DIR` | Folder for `gauntlet.db`, `known_hosts.json` and extra plans (default `data`). Mount a volume. History is kept 90 days. |
| `AUTOMATON_PORT` | Port to listen on (default 8080). |

Do not set `AUTOMATON_APP_ID` yourself: it switches the trust in viewer headers back on.

## Tests

```sh
python3 -m unittest discover -p 'test_*.py'
(cd actions/home-card && python3 -m unittest)
```

The SSH layer is the only part the tests do not run: it needs a real machine.
