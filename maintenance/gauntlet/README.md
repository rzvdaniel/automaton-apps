# Gauntlet

Installs, uses, uninstalls and reinstalls Automaton on your own test machines on a schedule, and tells you when something breaks, before a release reaches users.

Gauntlet signs in to each machine over SSH and runs **plans**: lists of steps, each with a command, a check and a timeout. Every run and each step's log is kept in the app's own database. The app page is one list of plans: each row shows the machine, schedule, the last 10 runs as bars (dark passed, orange failed, outlined running, light none), the last result and **Run now**. Opening a plan shows its last 5 runs (**Show older runs** for more); opening a run shows each step's result, timing, error and output. Only a plan whose last run failed opens by itself. Studio Home shows a card with the last result of each plan.

## Plans

Plans are JSON files in [`plans/`](plans/). Each step runs a script from [`plans/scripts/`](plans/scripts/) (or a short `command`) as `root`, or as the limited `automaton` user (`"as": "automaton"`). A step passes when the exit status is the expected one (`exit`, default 0) and the output has the text in `contains` and not the text in `not_contains`. A failed step stops the plan unless the step says `"continue": true`.

| Plan | Machine | When | What it does |
| --- | --- | --- | --- |
| `smoke` | `runner-02` | every day 02:30 UTC | Wipes the machine (`uninstall-automaton.sh --delete-data --yes --no-final-backup --confirm <the installed domain>`), installs the latest build, creates the administrator and signs the CLI in, checks the default apps and pending permissions, deploys a sample app and runs a backup, restarts the machine, checks log forwarding, uninstalls and checks nothing is left. |
| `full-cycle` | `nu8` | every Sunday 03:00 UTC | The same, then installs again. Each install also creates a non-root `automaton` user with the limited sudo rules of production (the updater, Backup now and `systemctl status automaton-*`) and checks through that user, so a step that needs more root than production allows fails here first. |
| `upgrade` | `nu8` | every Saturday 03:00 UTC | Installs the latest stable version, adds data, updates to the newest published server release and checks everything still works. |
| `restore-drill` | `runner-02` | every Sunday 05:00 UTC | Proves an off-site backup restores. Wipes the machine and installs the latest build, downloads the newest `.tar.age` under `automaton/` in the bucket, copies the backup key over (mode 600, never printed), restores with `restore.sh`, checks the API, Studio, the restored database and that sign-in is answered, reports the result and duration, deletes the key and wipes the machine again. Needs the `DRILL_*` values below. |

The machine of a plan is the name of an entry in `TARGETS`. To add or change a plan without changing the app, put a JSON file with the same shape in `plans/` inside the app's data folder; a file with the name of a built-in plan replaces it. A plan with `"wipes": true` is refused on any machine that is not marked `disposable`. One run at a time.

## Schedules

Each built-in plan is a platform Action (`actions/<plan>/`) with a default schedule from `automaton.json` (times in UTC; the table above). In Studio, open the app's Actions tab to see, change, pause or run each one: Run there starts the plan, and its report and step logs show in the app's Reports (trigger `schedule`). A release can start **Upgrade**, **Full cycle** and **Smoke** with no one clicking: in each Action's **Add webhook** (Studio, Actions), make a webhook and give its URL and secret to the workflow that calls it (`server-release.yml` for Upgrade and Full cycle, `deploy-production.yml` for Smoke), posting `{"version":"0.2.177"}`. That run shows the trigger `webhook 0.2.177` in Reports; the plans still install the newest published build. The restore drill stays schedule-only, and the schedules stay as the safety net. Pausing the app stops them all. The Action calls the running app with the `ADMIN_TOKEN` secret (at least 16 characters; set it when you install). The app has no clock of its own: a plan you add in the data folder has no schedule and runs only from **Run now**. Anyone who holds the `ADMIN_TOKEN` can use the app's whole API from its public address, not only from the Runner's network; keep it as secret as the SSH key. In Studio, whoever may run the app's Actions can start a plan (it is still refused on a machine that is not `disposable`). The Run now button starts the run in the app directly, so those runs show in Reports but not in Studio's Activity. A `schedule` key left in a plan file of the data folder is ignored. One run at a time: a start while another plan runs is refused and shows as a failed Action run in Studio.

Run on its own (outside Automaton) there are no Actions: start plans with `POST /api/runs` and the `ADMIN_TOKEN` from your own scheduler.

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

## Restore drill

The `restore-drill` plan only runs on a machine marked `disposable` (it wipes it twice) and never touches the server Gauntlet runs on. Enter these after installing Gauntlet; the drill fails with the missing name until they are set:

- Secrets: `DRILL_BACKUP_KEY` (the server's age private key), `DRILL_S3_ACCESS_KEY_ID` and `DRILL_S3_SECRET_ACCESS_KEY` (a separate read-only token for that one bucket, never Backup Warden's key).
- Settings: `DRILL_S3_ENDPOINT`, `DRILL_S3_REGION` (default `auto`) and `DRILL_S3_BUCKET`.

The values travel to the machine on the SSH session's standard input with the step's script, so they are not in a command line. The key is written to `/root/.gauntlet/drill/backup-key` (mode 600) for the restore only and is shredded by its own step even when the restore failed; the last step wipes the machine. Logs are scrubbed of all of them. A failed drill (no backup, a damaged archive, a wrong key, an unhealthy server) fails the run, so it emails and opens a GitHub issue like any other plan. The installed check asks the restored server (`/api/install/status`, the server's own rule, so adopted installs count) and requires a System Administrator in the database. The reported duration covers the whole run (a first step starts the clock outside the folder the wipe deletes). The sign-in check sends a wrong password for a made-up account and expects a refusal, which proves the restored identity store answers without a real credential on the machine. App data is not checked yet (rzvdaniel/automaton#1454).

## When a run fails

1. **Email.** One email per failed run through `notify:email` (`EMAIL_TO`), with the failed steps and the issue link.
2. **Diagnosis.** If `CLAUDE_TARGET` names a machine with Claude Code installed and signed in (its own login), Gauntlet sends it the redacted failure and `CLAUDE_COMMAND` (default `claude -p --allowedTools Read,Grep,Glob`: read-only, it never changes code, merges or touches production) answers with the repository, title and body following the automaton-write-issue skill.
3. **Issue.** Gauntlet opens one GitHub issue with `GITHUB_TOKEN` in a repository from `ISSUE_REPOS` (`owner/name`, comma separated; Claude's choice is used only if it is on the list, then the failing step's `repo`, then the plan's). Without Claude the issue has the failed steps and their logs and says no diagnosis was available. Every issue gets the label `gauntlet` (Gauntlet creates the label once per repository; with a token that cannot, the issue is still opened), so a board's auto-add workflow can filter on `label:gauntlet`. `BOARDS` puts the issue on that repository's project board.
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
| `GITHUB_TOKEN` | Secret, optional. May create issues and comments in `ISSUE_REPOS` and add to the boards. Use a fine-grained token limited to the `ISSUE_REPOS` repositories with only Issues: read and write; for `BOARDS` add Projects: read and write (classic tokens: `repo` or `public_repo`, plus `project`). Nothing else is needed: no contents, actions or admin scopes. |
| `BOARDS` | Optional JSON `{"owner/name": {"owner": "login", "number": 1}}`. |
| `CLAUDE_TARGET`, `CLAUDE_COMMAND` | Machine and command for the diagnosis. |
| `DRILL_BACKUP_KEY`, `DRILL_S3_ACCESS_KEY_ID`, `DRILL_S3_SECRET_ACCESS_KEY`, `DRILL_S3_ENDPOINT`, `DRILL_S3_REGION`, `DRILL_S3_BUCKET` | The restore drill's key, read-only bucket token and bucket (see above). Secrets for the first three. |
| `AUTOMATON_APP_DATA_DIR` | Folder for `gauntlet.db`, `known_hosts.json` and extra plans (default `data`). Mount a volume. History is kept 90 days. |
| `AUTOMATON_PORT` | Port to listen on (default 8080). |

Do not set `AUTOMATON_APP_ID` yourself: it switches the trust in viewer headers back on.

## Tests

```sh
python3 -m unittest discover -p 'test_*.py'
(cd actions/home-card && python3 -m unittest)
```

The SSH layer is the only part the tests do not run: it needs a real machine.
