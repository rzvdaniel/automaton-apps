# Overseer

Runs and shows the work queue of your coding agents (Claude Code) and its schedules, on any server. It wraps two small scripts you already have on the machine where the agents run, `agent-queue` (one queue, one worker) and `orchestrator.sh` (stall check and morning report), over SSH. It does not reimplement them.

The page shows:

- **Queue**: running, pending and the last finished tasks. Open a task to read its log and see the issue and pull request it mentions. Add a task, cancel one, pause or resume the queue.
- **Schedules**: the jobs (Set up machine is the fifth), when each last ran and what it did, and a **Run now** button. Each job is its own Action (Pick-up, Stall check, Morning report, Lessons; Release check is the fifth) with its own **Run now**, schedule and webhook, and no input. The schedules are ordinary Automaton scheduled actions (the **Schedules** tab of the app in Studio), so you pause or change them there.
- **Latest morning report**.

| Job | Default schedule (UTC) | What it runs |
| --- | --- | --- |
| `stall-check` | every 30 minutes | `orchestrator.sh`: requeues a stalled task, stops one that stalled twice |
| `report` | 06:00 | `orchestrator.sh` with `ORCH_REPORT=1`: queues the task that writes the morning report |
| `lessons` | 03:00 | `agent-queue add lessons-<date>` with `LESSONS_PROMPT` |
| `pick-up` | 22:00 | queues the open issues in the Ready for agents column of each board in `AGENT_BOARDS`, in order |

## Pick-up

Set `AGENT_BOARDS` to the boards Pick-up takes cards from, in run order: comma-separated `owner/number: Column`, for example `rzvdaniel/17: Ready for agents, rzvdaniel/2: Ready for agents`. Add the `GITHUB_TOKEN` secret (a classic token with `read:project`; fine-grained tokens cannot read user-owned boards). With `AGENT_BOARDS` set and no token, or a board or column Pick-up cannot read, the run fails (exit 1, the reason in its log) and a missing token also shows a warning on the page; the run's log lists what it queued. Each run goes through the boards in that order and, per board, reads every card (100 per request) and takes the column's cards top to bottom, and queues each open issue from any repo as one task (`pick-<repo>-<number>`). `PICKUP_MODE` (optional) is `one` by default: Pick-up queues only the top open card, and only when the queue has nothing running or pending (tasks added by hand count, so they go first); the log says so when it queues nothing. In `one` mode it stops reading at the first card it queues, so a later board or column it cannot read, and `needs-shape` cards below that card, show up on a run that reaches them. With the board in order, the next run after a task finishes queues whichever card is then at the top; a card dragged out of the column before its turn never runs. `all` queues every card at once. Either way it skips one that is already waiting or running (it reads the queue listing), never queues one twice, and **checks each card's issue first (the same check as `agent-queue add`): one labelled `needs-shape`, or without a "Done when" section, is not queued.** Pick-up moves its card back to the column it came from (Backlog if that is not known) and comments once on the issue: "Not queued: ... Add a Done when section". It comments again only after the issue's labels or text change and it is moved back again; it is also listed under "Pick-up" in the morning report on the page. Moving and commenting need the `GITHUB_TOKEN` to have the classic `project` and `repo` scopes (without them the run fails and says so, and the card stays). A board or column that does not exist is shown the same way ("Board rzvdaniel/2 has no column 'Ready for agents'") instead of being skipped silently. **Empty `AGENT_BOARDS` queues nothing; Pick-up never picks from the rest of the backlog.** Creating the columns is up to you (GitHub's web view).

**Cards follow their task.** When Pick-up queues a task it moves the card to `RUNNING_COLUMN` (default `Running`). On a later run, once the task is no longer waiting or running, the card moves to `REVIEW_COLUMN` (default `In review`) if a pull request that names the issue was merged since the task was queued; otherwise (failed, cancelled, or no merged pull request) it goes back to the column it came from with one comment on the issue holding the task's last log lines (published as written, after the app's own secrets are removed: the task's own output is not scrubbed). Pick-up does not queue that card again while that comment is the issue's latest; a newer comment (say what was fixed) lets it run again. Any merged pull request that names the issue after the task was queued counts, including one from a person. Both columns must exist on every board in `AGENT_BOARDS` or the run fails, like a missing Ready column; a card that could not be moved is tried again on the next run. Moving to Done, and tasks queued by hand, are not Pick-up's job.

`PAUSE_BETWEEN` (optional, `HH:MM-HH:MM` in UTC, may span midnight, for example `08:00-18:00`) makes Pick-up queue nothing in that window. Both settings are read at each run, so a change applies from the next run.

The schedule is the one in Studio's Schedules tab: `*/15 * * * *` (default) checks every 15 minutes, `0 22 * * *` is once a night, `*/15 18-7 * * *` is outside office hours.

There is no token budget and no daily task limit: when the Claude usage limit is hit the queue waits for the reset and continues. The queue machine needs the current `orchestrator.sh` (older copies still pause at 12 tasks a day). Only `STALL_MINUTES` bounds a task. **Only put issues you trust in the column**, and keep the queue host free of production credentials: tasks run unattended with that machine's access. Every task is told to stop at the merged pull request and never release or deploy.

## Release check

A new server release upgrades the test server and starts its check with nobody starting anything. The **Release check** Action (`actions/release-check`, input `{"version":"0.2.176"}`) calls the app, which runs `automaton server update --version server-v0.2.176 --wait` on the queue machine and then queues the task `release-check-0-2-176` (the agent runs each merged pull request's "Check after release" list, one pass per pull request on Haiku at low effort with no docs walk, labels the issues and appends its table to the release notes). Set `CLI_SERVER`, the secret `CLI_API_KEY` (an administrator API key for that server, made for Overseer; it travels on standard input, never in a command line) and `RELEASE_REPO`; `gh` must be signed in on the queue machine.

Start it from the server-release workflow: in Studio, **Actions**, **Release check**, **Add webhook**, and store the URL and secret as GitHub secrets for the workflow's last step (`curl -X POST -H "Authorization: Bearer $SECRET" -d '{"version":"0.2.176"}' $URL`). A second call for the same version answers "already started" and does nothing. If the upgrade fails, nothing is queued, the error is appended to the release notes and `EMAIL_TO` is emailed (needs `notify:email`); calling again for that version tries again. It never deploys to production.

## Set up machine

The scripts Overseer wraps live in this app's `agent-machine/` folder (`agent-queue`, `claude-task`, `orchestrator.sh`, `agent-cleanup`, the worker's systemd unit and `install.sh`, with an offline `test.sh`). The **Set up machine** Action (`setup-machine`, no input, **Run now** on the page) copies them to the queue machine over the same SSH connection and runs `install.sh --systemd` there:

- installs or updates the scripts in `QUEUE_BIN` (a changed file is saved as `<name>.bak-YYYYMMDD` first);
- runs the worker as the systemd user service `agent-queue-worker` (`Restart=always`) and drops the `@reboot` cron line; it needs `loginctl enable-linger <user>` once, and without a systemd user session it keeps the `@reboot` line and says so;
- sets the cron entries for the stall check, morning report, lessons and cleanup (other crontab lines are kept);
- checks `claude`, `gh` and `git` and reports, for example, `claude: logged in, gh: logged in as rzvdaniel-bot, git: found, worker: running`. A missing tool or sign-in fails the run with that line. It never logs in for you.

Running it again changes nothing. A running task is never killed: the worker is restarted only when no task runs; otherwise a marker is left and the next run restarts it. **Pick-up checks the installed scripts' version** (`~/bin/.agent-machine-version`) before it queues anything and runs the setup first when it differs from the app's copy or a worker restart is waiting, so an Overseer update that changes a script needs no manual step; if that setup fails, Pick-up queues nothing and says why.

## Install on an Automaton server

A fresh machine takes four steps:

1. **Machine**: a Linux user with Claude Code, `gh` and `git` installed and signed in (`claude` once, `gh auth login`), the Claude config in `~/.claude-second` (or set `CLAUDE_CONFIG_DIR` for the worker), `loginctl enable-linger <user>` (as root, once), and your repositories cloned where `claude-task` expects them (`~/automaton`, or `AGENT_WORKDIR`). Make a key for Overseer and allow it: `ssh-keygen -t ed25519 -N '' -f overseer_key`, then add `overseer_key.pub` to that user's `~/.ssh/authorized_keys`. The app must be able to reach the machine's SSH port from the Runner. The first host key it sees is remembered and must match afterwards.
2. **Install Overseer** from the catalog. Fill in `QUEUE_HOST` (`user@address`; `localhost` style addresses work when Overseer runs on that machine), the secret `SSH_KEY` (the private key), a secret `ADMIN_TOKEN` of at least 16 characters (the schedules use it to call the app) and, for Pick-up, the board settings and `GITHUB_TOKEN`. Keep the schedules you want.
3. **Approve** `apps:read-status` as an administrator (it only lets the page show the next scheduled run).
4. **Set up machine**: press **Run now** on the Set up machine job (Actions tab in Studio, or the page) and read the result line; fix what it says is missing and run it again. Then press **Run now** on each other job. If the machine used cron before, the setup replaces the `agent-queue`, `orchestrator.sh` and lessons lines (and the `@reboot` worker line) with its own.

Setting up Claude accounts and keys stays on each server, and Overseer gives agents no access to production.

## Run it on its own

```yaml
services:
  overseer:
    image: python:3.12-slim
    working_dir: /app
    command: sh -c "pip install -q --target lib 'paramiko>=3,<5' && python main.py"
    volumes:
      - ./maintenance/overseer:/app
      - overseer-data:/app/data
    environment:
      AUTOMATON_APP_DATA_DIR: /app/data
      ADMIN_TOKEN: change-me-to-16-or-more-characters
      QUEUE_HOST: agent@192.0.2.10
      SSH_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
    ports: ["8080:8080"]
volumes:
  overseer-data:
```

Without Automaton there are no scheduled actions: call a job from cron or a timer instead, `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8080/api/jobs/report`. The page asks for the `ADMIN_TOKEN`. Inside Automaton only a system administrator signed in to Studio may use it; the token only serves the schedules.

| Variable | Meaning |
| --- | --- |
| `QUEUE_HOST` | `user@address` of the machine with the queue (required) |
| `SSH_KEY` | private key for that user (secret) |
| `ADMIN_TOKEN` | at least 16 characters (secret); wrong tries are delayed |
| `QUEUE_BIN`, `QUEUE_HOME` | where the scripts and the queue's folder are on that machine (default `~/bin`, `~/agent-queue`) |
| `RUNNER` | the command that runs one task (default `claude-task`) |
| `STALL_MINUTES` | minutes without log output before a task counts as stalled (default 120) |
| `ISSUE_REPO` | `owner/name` for linking a task named like `fix-login-344` to its issue |
| `AGENT_BOARDS`, `PAUSE_BETWEEN`, `PICKUP_MODE`, `RUNNING_COLUMN`, `REVIEW_COLUMN`, `GITHUB_TOKEN` | Pick-up (see above) |
| `CLI_SERVER`, `CLI_API_KEY`, `RELEASE_REPO`, `EMAIL_TO` | Release check (see above); `CLI_API_KEY` is a secret |
| `LESSONS_PROMPT` | the lessons job's prompt |
| `AUTOMATON_APP_DATA_DIR` | data folder: the job history and the remembered host key |

The data volume holds `overseer.json` (last result of each job, issues Pick-up queued) and `known_hosts.json`. The queue itself stays on the queue machine.

## Tests

`python -m unittest discover -p 'test_*.py'` here, and the same with `-s actions` and `-s actions/release-check`.

## Upgrading from the single Run job Action

Before this change the four jobs were one `run-job` Action with the input `{"job":"..."}`. An install made earlier keeps four schedules on `run-job`, which no longer exists after the update. Servers with the schedule sync of `automaton catalog update` (automaton#1527) bring the new defaults in; check the app's Schedules tab and do the steps below only for schedules still on `run-job` or missing, so you do not end with duplicates. Delete them and create one schedule per new Action (`DELETE /api/action-schedules/{id}`, then `POST /api/action-schedules` with `applicationId`, `actionKey`, `name`, `scheduleType` `Cron`, `cronExpression`, `timeZone` `Etc/UTC`, `input` `{}`). Pick-up `pick-up` `*/15 * * * *`, Stall check `stall-check` `*/30 * * * *`, Morning report `report` `0 6 * * *`, Lessons `lessons` `0 3 * * *`.
