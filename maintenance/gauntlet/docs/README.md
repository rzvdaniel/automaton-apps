# Gauntlet

Gauntlet installs, uses, uninstalls and reinstalls Automaton on your own test machines and tells you when something breaks, before a release reaches users. It signs in over SSH and runs **plans**: lists of steps, each with a command, a check and a timeout.

## When it runs

Each plan is an Action with a schedule (UTC). Change, pause or run them in Studio, in the app's **Actions** tab, or press **Run now** on the app page.

| Plan | Default schedule | What it checks |
| --- | --- | --- |
| Smoke (`smoke`) | every day 02:30 | Wipes the machine, installs the latest build, checks the default apps, deploys a sample app, runs a backup, restarts, checks log forwarding, uninstalls and checks nothing is left. |
| Full cycle (`full-cycle`) | Sunday 03:00 | The same, then installs again, and checks as the limited `automaton` user with production's sudo rules. |
| Upgrade (`upgrade`) | Saturday 03:00 | Installs the latest stable version, adds data, updates to the newest release and checks everything still works. |
| Restore drill (`restore-drill`) | Sunday 05:00 | Restores the newest off-site backup on a disposable machine and checks the API, Studio, the database and that sign-in answers. |

**Webhooks.** A release can start Upgrade and Full cycle, and a deploy can start Smoke. In the Action's **Add webhook**, make a webhook and give its URL and secret to the workflow, posting `{"version":"0.2.177"}`. The run shows the trigger `webhook 0.2.177` in Reports. The restore drill is schedule-only.

## Settings

| Name | What it is |
| --- | --- |
| `TARGETS` | The machines, a JSON list of `name`, `host`, `domain`, `email`, `disposable`. Plans that wipe run only where `disposable` is true. Never list production. |
| `SSH_KEY` (secret) | Private key, no passphrase, that may sign in to every target. |
| `ADMIN_TOKEN` (secret) | At least 16 characters. The schedules use it to call the app. |
| `EMAIL_TO` | Who gets failure emails. |
| `ISSUE_REPOS`, `GITHUB_TOKEN` (secret), `BOARDS` | Where a failure opens a GitHub issue. Empty: email only. |
| `CLAUDE_TARGET`, `CLAUDE_COMMAND` | Machine and command for a read-only Claude diagnosis. |
| `DRILL_*` | The restore drill's backup key, read-only bucket token, endpoint, region and bucket. |

## Read a failed run

1. Open the app's page. A plan whose last run failed opens by itself; the bars show the last 10 runs (dark passed, orange failed).
2. Open the failed run. Each step shows its result, time, error and output.
3. The first red step is the cause: a failed step stops the plan, and the steps after it did not run.
4. A step fails when its exit status is not the expected one or its output lacks the expected text. Read the output for the real error.
5. A failure also sends one email and opens one GitHub issue labelled `gauntlet` (a board auto-add can filter on `label:gauntlet`) with the failed steps and logs. The same plan failing at the same step comments "Failed again" on the open issue; a later pass comments "Passing again".

Logs are scrubbed of keys, tokens and passwords. More detail is in the app's `README.md`.
