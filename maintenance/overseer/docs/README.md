# Overseer

Overseer runs and shows the work queue of your coding agents (Claude Code) on any server. It wraps `agent-queue` and `orchestrator.sh` on the machine where the agents run, over SSH.

## When it runs

The app page shows the **Queue** (running, pending, finished; add, cancel, pause), the four **Schedules** and the latest morning report. The schedules are ordinary scheduled actions: change or pause them in Studio, in the app's **Schedules** tab, or press **Run now**.

| Job | Default (UTC) | What it does |
| --- | --- | --- |
| `stall-check` | every 30 minutes | Requeues a stalled task and stops one that stalled twice. |
| `report` | 06:00 | Queues the task that writes the morning report. |
| `lessons` | 03:00 | Queues a lessons task with `LESSONS_PROMPT`. |
| `pick-up` | 22:00 | Queues the open issues in the Ready for agents column of each board in `AGENT_BOARDS`, skipping `needs-shape`. |

**Release check** is an Action, started by a webhook from the server-release workflow with `{"version":"0.2.176"}`. It updates the test server, then queues the task that runs each merged pull request's "Check after release" list. A second call for the same version does nothing.

## Settings

| Name | What it is |
| --- | --- |
| `QUEUE_HOST` | `user@address` of the queue machine (required). |
| `SSH_KEY` (secret) | Private key for that user. |
| `ADMIN_TOKEN` (secret) | At least 16 characters; the schedules use it. |
| `AGENT_BOARDS`, `PAUSE_BETWEEN`, `GITHUB_TOKEN` (secret) | Pick-up: boards and columns, a UTC window with no queuing, read access. Empty `AGENT_BOARDS` queues nothing. |
| `CLI_SERVER`, `CLI_API_KEY` (secret), `RELEASE_REPO`, `EMAIL_TO` | Release check. |
| `STALL_MINUTES`, `ISSUE_REPO`, `LESSONS_PROMPT`, `QUEUE_BIN`, `QUEUE_HOME`, `RUNNER` | Stall limit (default 120), issue links, lessons prompt, script locations, task command. |

## Read a failed run

1. On the page, a job that failed shows its failed label and the error text in its row under **Schedules**.
2. SSH errors (host unreachable, key refused, host key changed) mean Overseer cannot reach `QUEUE_HOST`: check the key and the machine.
3. For a task, open it in the **Queue** to read its log and the issue and pull request it mentions. A task that stalled twice was stopped by `stall-check`.
4. Pick-up lists skipped issues and missing boards or columns in the morning report, with the reason.
5. A failed Release check appends the error to the release notes and emails `EMAIL_TO`; call it again for that version to retry.

More detail is in the app's `README.md`.
