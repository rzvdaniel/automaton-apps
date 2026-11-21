# Overseer

Runs and shows the work queue of your coding agents (Claude Code) and its schedules, on any server. It wraps two small scripts you already have on the machine where the agents run, `agent-queue` (one queue, one worker) and `orchestrator.sh` (stall check and morning report), over SSH. It does not reimplement them.

The page shows:

- **Queue**: running, pending and the last finished tasks. Open a task to read its log and see the issue and pull request it mentions. Add a task, cancel one, pause or resume the queue.
- **Schedules**: the four jobs, when each last ran and what it did, and a **Run now** button. The schedules themselves are ordinary Automaton scheduled actions (the **Schedules** tab of the app in Studio), so you pause or change them there.
- **Latest morning report**.

| Job | Default schedule (UTC) | What it runs |
| --- | --- | --- |
| `stall-check` | every 30 minutes | `orchestrator.sh`: requeues a stalled task, stops one that stalled twice |
| `report` | 06:00 | `orchestrator.sh` with `ORCH_REPORT=1`: queues the task that writes the morning report |
| `lessons` | 03:00 | `agent-queue add lessons-<date>` with `LESSONS_PROMPT` |
| `pick-up` | 22:00 | queues the open issues in the Ready for agents column of each board in `AGENT_BOARDS`, in order |

## Token usage and cost

`claude-task` (on the queue machine) runs `claude -p --output-format json` and saves each finished task's usage (input, cache read and write, output tokens, cost, duration, models; subagents are included in the per-model figures) to `~/agent-queue/usage/<task>.json`, still writing the readable answer to the task's log. Overseer reads those files over SSH (needs `jq` on the queue machine): the queue shows each finished task's tokens and cost, **Usage per day** shows the total per day and runner (UTC), and the jobs that start Claude (`report`, `lessons`, `pick-up`) are marked. No new service; a task finished before `claude-task` was changed has no figures.

## Pick-up

Set `AGENT_BOARDS` to the boards Pick-up takes cards from, in run order: comma-separated `owner/number: Column`, for example `rzvdaniel/17: Ready for agents, rzvdaniel/2: Ready for agents`. Add the `GITHUB_TOKEN` secret (read access to those boards and their repos' issues). Each run goes through the boards in that order and, per board, the column's cards top to bottom, and queues each open issue from any repo as one task (`pick-<repo>-<number>`). It skips one that is already waiting or running (it reads the queue listing), never queues one twice, and **skips issues labelled `needs-shape`**; they are listed under "Pick-up" in the morning report on the page, with the issue check's last comment as the reason. A board or column that does not exist is shown the same way ("Board rzvdaniel/2 has no column 'Ready for agents'") instead of being skipped silently. **Empty `AGENT_BOARDS` queues nothing; Pick-up never picks from the rest of the backlog.** Creating the columns is up to you (GitHub's web view).

`PAUSE_BETWEEN` (optional, `HH:MM-HH:MM` in UTC, may span midnight, for example `08:00-18:00`) makes Pick-up queue nothing in that window. Both settings are read at each run, so a change applies from the next run.

The schedule is the one in Studio's Schedules tab: `0 22 * * *` (default) is once a night, `*/15 * * * *` is continuous (a card dropped in the column is queued within 15 minutes), `*/15 18-7 * * *` is outside office hours.

There is no token budget and no daily task limit: when the Claude usage limit is hit the queue waits for the reset and continues. The queue machine needs the current `orchestrator.sh` (older copies still pause at 12 tasks a day). Only `STALL_MINUTES` bounds a task. **Only put issues you trust in the column**, and keep the queue host free of production credentials: tasks run unattended with that machine's access. Every task is told to stop at the merged pull request and never release or deploy.

## Release check

A new server release upgrades the test server and starts its check with nobody starting anything. The **Release check** Action (`actions/release-check`, input `{"version":"0.2.176"}`) calls the app, which runs `automaton server update --version server-v0.2.176 --wait` on the queue machine and then queues the task `release-check-0-2-176` (the agent runs each merged pull request's "Check after release" list, one pass per pull request on Haiku at low effort with no docs walk, labels the issues and appends its table to the release notes). Set `CLI_SERVER`, the secret `CLI_API_KEY` (an administrator API key for that server, made for Overseer; it travels on standard input, never in a command line) and `RELEASE_REPO`; `gh` must be signed in on the queue machine.

Start it from the server-release workflow: in Studio, **Actions**, **Release check**, **Add webhook**, and store the URL and secret as GitHub secrets for the workflow's last step (`curl -X POST -H "Authorization: Bearer $SECRET" -d '{"version":"0.2.176"}' $URL`). A second call for the same version answers "already started" and does nothing. If the upgrade fails, nothing is queued, the error is appended to the release notes and `EMAIL_TO` is emailed (needs `notify:email`); calling again for that version tries again. It never deploys to production.

## Install on an Automaton server

1. On the machine where the agents run (a Linux user with `agent-queue`, `orchestrator.sh` and `claude-task` in `~/bin`, Claude Code signed in), make a key for Overseer and allow it: `ssh-keygen -t ed25519 -N '' -f overseer_key`, then add `overseer_key.pub` to that user's `~/.ssh/authorized_keys`. The app must be able to reach the machine's SSH port from the Runner. The first host key it sees is remembered and must match afterwards.
2. Install Overseer from the catalog. Fill in `QUEUE_HOST` (`user@address`), the secret `SSH_KEY` (the private key), a secret `ADMIN_TOKEN` of at least 16 characters (the schedules use it to call the app) and, for Pick-up, the board settings and `GITHUB_TOKEN`. Keep the schedules you want.
3. An administrator approves `apps:read-status` (it only lets the page show the next scheduled run).
4. Switch over from cron: look at the app's page, press **Run now** on each job, and when the schedules have run once, remove the `agent-queue`, `orchestrator.sh` and lessons lines from that user's crontab. Keep the `@reboot agent-queue worker` line: the worker is the long-running process and stays on the machine.

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
| `AGENT_BOARDS`, `PAUSE_BETWEEN`, `GITHUB_TOKEN` | Pick-up (see above) |
| `CLI_SERVER`, `CLI_API_KEY`, `RELEASE_REPO`, `EMAIL_TO` | Release check (see above); `CLI_API_KEY` is a secret |
| `LESSONS_PROMPT` | the lessons job's prompt |
| `AUTOMATON_APP_DATA_DIR` | data folder: the job history and the remembered host key |

The data volume holds `overseer.json` (last result of each job, issues Pick-up queued) and `known_hosts.json`. The queue itself stays on the queue machine.

## Tests

`python -m unittest discover -p 'test_*.py'` here, and the same with `-s actions/run-job`.
