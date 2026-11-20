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
| `night-shift` | 22:00 | queues the open issues in one board column, in order |

## Night shift

Set `NIGHT_BOARD` (`owner/number` of a GitHub project), `NIGHT_COLUMN` (a Status value, for example `Ready for night`) and the `GITHUB_TOKEN` secret (read access to the project and its issues). Each run queues every open issue in that column, one task each (`night-<repo>-<number>`), skips one that is already waiting or running in the queue (it reads the queue listing) and never queues one twice. **An empty column queues nothing; it never picks from the rest of the backlog.** Issues run in the column's card order, top to bottom as the board shows it. There is no token budget and no daily task limit: the night shift runs everything in the column, and when the Claude usage limit is hit the queue waits for the reset and continues. The queue machine needs the current `orchestrator.sh` (older copies still pause at 12 tasks a day). Only `STALL_MINUTES` bounds a task, so one stuck task cannot block the night. **Only put issues you trust in the night column**, and keep the queue host free of production credentials: night tasks run unattended with that machine's access. Every night task is told to stop at the merged pull request and never release or deploy.

## Install on an Automaton server

1. On the machine where the agents run (a Linux user with `agent-queue`, `orchestrator.sh` and `claude-task` in `~/bin`, Claude Code signed in), make a key for Overseer and allow it: `ssh-keygen -t ed25519 -N '' -f overseer_key`, then add `overseer_key.pub` to that user's `~/.ssh/authorized_keys`. The app must be able to reach the machine's SSH port from the Runner. The first host key it sees is remembered and must match afterwards.
2. Install Overseer from the catalog. Fill in `QUEUE_HOST` (`user@address`), the secret `SSH_KEY` (the private key), a secret `ADMIN_TOKEN` of at least 16 characters (the schedules use it to call the app) and, for the night shift, the board settings and `GITHUB_TOKEN`. Keep the schedules you want.
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
| `NIGHT_BOARD`, `NIGHT_COLUMN`, `GITHUB_TOKEN` | the night shift (see above) |
| `LESSONS_PROMPT` | the lessons job's prompt |
| `AUTOMATON_APP_DATA_DIR` | data folder: the job history and the remembered host key |

The data volume holds `overseer.json` (last result of each job, issues the night shift queued) and `known_hosts.json`. The queue itself stays on the queue machine.

## Tests

`python -m unittest discover -p 'test_*.py'` here, and the same with `-s actions/run-job`.
