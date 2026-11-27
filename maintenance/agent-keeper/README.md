# Agent Keeper

Starts the next agent issue itself and shows the queue. The **Pick up** Action runs every 10 minutes (turn it on, off or run it from Studio's **Actions** tab, like any Action): it does nothing while an `agent:go` issue is open, skips cards labelled `agent:failed`, sends cards with `needs-shape` or no **Done when** back to Inbox, dispatches `agent-issue.yml` for repositories other than automaton, labels the issue `agent:go` and moves the card to **Running**. It moves a card whose run opened a pull request to **Verify**, whatever the repository, and skips while no runner labelled `agent` is registered. It also moves an Inbox card labelled `queue-when-unblocked` to the bottom of **Ready for agents** once every issue blocking it (GitHub's issue dependencies, any repository) is closed as completed: it comments "Unblocked by …; queued." and removes the label. A blocker closed as not planned gets one comment and the card stays in Inbox. It needs no host access, only GitHub (the secret `AGENT_GH_TOKEN`).

The page has three tabs: **Queue** (needs-you banner, tiles, Running now with its steps, Needs you with **Read run** and **Run again**, Next up in board order, Recent runs), **Machine** (runner, the main disk and Docker's data root as separate rows when they differ, tools with installed and latest version; refreshed every 5 minutes while the page is open) and **Setup**.

**Runs at once** (`AGENT_PARALLEL`, 1 or 2, default 1): with 2, Set up also registers a second runner service (`actions-runner-2`, its own work folder) and Pick up starts a second card only when the running one is in another area (an `area:<name>` label; cards in other repositories are their own area; a card with no known area never runs beside another). The test-server lock between runs and re-requesting reviews on PRs the merge gate blocks are workflow-side and not part of this app.

Turns a machine that only has an Automaton Runner into a GitHub Actions agent machine, with no SSH. From one page it installs Claude Code, gh, git, Docker and the build tools, registers the machine as a self-hosted GitHub Actions runner with the `agent` label and runs it as a service.

**It runs commands as root on the machine.** It does that through the platform permission `runner:host-exec` (its only permission), which works only when a system administrator has:

1. turned on host access for the server (Studio, an app's **Admin** tab, setting `HostExec.Enabled`, off by default);
2. made the app's owner a system administrator;
3. approved this app for the machine: `automaton permissions approve <app> runner:host-exec --runner <machine>`.

Anyone who can change this app's code or settings controls that machine. A new deploy or catalog update suspends the approval until an administrator approves again.

## Install and set up

1. Install the Machine Management Runner on the machine (that is the only command you ever run by hand there).
2. Install **Agent Keeper** from **Apps -> Catalog** and fill in the settings below (`AGENT_MACHINE_ID` is the machine's id in Studio, Runners).
3. A system administrator approves `runner:host-exec` for that machine (above).
4. Open the app's page. In GitHub open the repository's **Settings -> Actions -> Runners -> New self-hosted runner** and copy the registration token. Paste it into **Set up** and press the button. The token is valid for one hour.

| Page action | What it does |
| --- | --- |
| **Set up** | Installs what is missing (tools, user, runner software), registers the runner, installs and starts its service. Run it again safely: it changes nothing that is already done, and it needs no token once the machine is registered. |
| **Remove** | Stops the service, unregisters the runner on GitHub (needs a removal token from the runner's page on GitHub) and removes the service. The tools stay. Set up brings it back. |
| **Update tools** | Upgrades gh, git, Docker (when installed with apt) and Claude Code. |
| **Refresh status** | Reads the runner service (running, idle or busy, current job), the tool versions and the disk. |

An administrator starts every host run on the page, because the platform requires the viewer token of the system administrator who starts a host command. For the same reason the machine status refreshes only while an administrator has the page open, and the only Action is Pick up, which uses GitHub and no host. Press **Update tools** now and then. **Run again** also needs an administrator.

## What to know before you use it

- **Pinned downloads.** Set up installs a runner version and Claude Code version pinned in `scripts/setup.sh`, with the runner's SHA-256 pinned per CPU type (x64, arm64), so a changed release on GitHub is not installed unnoticed. Newer versions are a pull request that changes those lines. Claude Code's installer script itself is still fetched from claude.ai over TLS and verifies the pinned version's own checksum. The runner updates itself later as GitHub requires.
- **`--replace`.** Set up registers with `--replace`, so it takes over an existing runner with the same name in that repository or organisation. Use a unique `AGENT_RUNNER_NAME`.
- **What Remove leaves behind.** Remove unregisters the runner (its credentials are deleted) and removes the service. It keeps the runner folder `~<user>/actions-runner`, including `_work` with checked-out code and job leftovers, the user, and the installed tools. Delete those by hand if you want them gone.

## No secrets stored

- The registration or removal token is typed into the page, travels to the script on standard input (never in the script text, arguments or logs of this app), is used once and is never saved. The platform masks any output line that repeats it, and the app removes it from the output it keeps.
- `CLAUDE_CODE_OAUTH_TOKEN` lives only in the repository's GitHub secrets, which you add once under **Settings -> Secrets and variables -> Actions**. This app never reads it.
- `AGENT_GH_TOKEN` is this app's secret (Studio, the app's secrets): it reads and moves cards on the board, labels issues and starts `agent-issue.yml`. It is sent only to api.github.com and never shown or logged.
- The app keeps only the last log of each action and the last status in its data folder. The page shows the most recent of them, collapsed to one status line that opens on click.

| Name | Kind | Meaning |
| --- | --- | --- |
| `AUTOMATON_API_URL` | provided by the server | Address of this server's API; nothing to enter. |
| `API_BASE_URL` | setting, optional | Older override, used only when `AUTOMATON_API_URL` is not set. |
| `AGENT_MACHINE_ID` | setting, required | The machine's id (GUID) from Studio, Runners. |
| `AGENT_REPO` | setting, required | `owner/repo` (or an organisation name) the runner registers to. |
| `AGENT_RUNNER_NAME` | setting | The runner's name on GitHub, default `agent-keeper`. |
| `AGENT_RUNNER_LABELS` | setting | Comma-separated labels, default `agent`. |
| `AGENT_RUNNER_USER` | setting | The unprivileged user that runs the service, default `agent`; created if it does not exist. |
| `AGENT_BOARD` | setting | The project board as `owner/number`, default `rzvdaniel/17`. |
| `AGENT_REPOS` | setting | Repositories whose Ready cards are picked, default `automaton automaton-apps automaton-monster`. |
| `AGENT_PARALLEL` | setting | Runs at once, `1` (default) or `2`. |
| `AGENT_GH_TOKEN` | secret | GitHub token with the project, repo and workflow scopes. |
| `AGENT_DOCKER_ACCESS` | setting | Default `false`. `true` adds the runner user to the `docker` group. **Warning: membership in the docker group is root on the host** (a container can mount `/` and run privileged), and the runner runs jobs from any branch or pull request that targets it. Leave it off unless you accept that; otherwise use rootless Docker. Turning it off later does not remove an existing membership. |

The runner's state on the page comes from the machine's runner service. GitHub's own view is under the repository's **Settings -> Actions -> Runners**.

## Run it on its own

The page and its scripts work only through an Automaton Runner, and the Pick up Action runs only in Automaton. Run on its own, the app starts and shows the queue (give it `AGENT_GH_TOKEN`) but cannot change any machine. Run it with a compose file of the `python:3.12-slim` image running `python main.py` from the built `dist` folder, port 8080, the variables above, and a volume on `/app/data` (`AUTOMATON_APP_DATA_DIR`) for the last results; keep it behind your own login. Its tests need only Python 3.12:

```sh
cd maintenance/agent-keeper && python -m unittest discover -p 'test_*.py' && (cd actions/pick && python -m unittest discover -p 'test_*.py')
```
