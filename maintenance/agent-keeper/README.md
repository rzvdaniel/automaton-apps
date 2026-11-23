# Agent Keeper

Turns a machine that only has an Automaton Runner into a GitHub Actions agent machine, with no SSH. From one page it installs Claude Code, gh, git, Docker and the build tools, registers the machine as a self-hosted GitHub Actions runner with the `agent` label and runs it as a service.

**It runs commands as root on the machine.** It does that through the platform permission `runner:host-exec` (its only permission), which works only when a system administrator has:

1. turned on host access for the server (Studio, an app's **Admin** tab, setting `HostExec.Enabled`, off by default);
2. made the app's owner a system administrator;
3. approved this app for the machine: `automaton permissions approve <app> runner:host-exec --runner <machine>`.

Anyone who can change this app's code or settings controls that machine. A new deploy or catalog update suspends the approval until an administrator approves again.

## Install and set up

1. Install the Machine Management Runner on the machine (that is the only command you ever run by hand there).
2. Install **Agent Keeper** from **Apps -> Catalog** and fill in the settings below (`RUNNER_ID` is the machine's id in Studio, Runners).
3. A system administrator approves `runner:host-exec` for that machine (above).
4. Open the app's page. In GitHub open the repository's **Settings -> Actions -> Runners -> New self-hosted runner** and copy the registration token. Paste it into **Set up** and press the button. The token is valid for one hour.

| Page action | What it does |
| --- | --- |
| **Set up** | Installs what is missing (tools, user, runner software), registers the runner, installs and starts its service. Run it again safely: it changes nothing that is already done, and it needs no token once the machine is registered. |
| **Remove** | Stops the service, unregisters the runner on GitHub (needs a removal token from the runner's page on GitHub) and removes the service. The tools stay. Set up brings it back. |
| **Update tools** | Upgrades gh, git, Docker (when installed with apt) and Claude Code. |
| **Refresh status** | Reads the runner service (running, idle or busy, current job), the tool versions and the disk. |

An administrator starts every run on the page, because the platform requires the viewer token of the system administrator who starts a host command. For the same reason there are no Actions and no schedule: a timer has no administrator to vouch for it. Press **Update tools** now and then.

## No secrets stored

- The registration or removal token is typed into the page, travels to the script on standard input (never in the script text, arguments or logs of this app), is used once and is never saved. The platform masks any output line that repeats it, and the app removes it from the output it keeps.
- `CLAUDE_CODE_OAUTH_TOKEN` and `AGENT_GH_TOKEN` live only in the repository's GitHub secrets, which you add once under **Settings -> Secrets and variables -> Actions**. This app never reads them.
- The app keeps only the last log of each action and the last status in its data folder.

| Name | Kind | Meaning |
| --- | --- | --- |
| `AUTOMATON_API_URL` | provided by the server | Address of this server's API; nothing to enter. |
| `API_BASE_URL` | setting, optional | Older override, used only when `AUTOMATON_API_URL` is not set. |
| `RUNNER_ID` | setting, required | The machine's id (GUID) from Studio, Runners. |
| `GITHUB_REPO` | setting, required | `owner/repo` (or an organisation name) the runner registers to. |
| `RUNNER_NAME` | setting | The runner's name on GitHub, default `agent-keeper`. |
| `RUNNER_LABELS` | setting | Comma-separated labels, default `agent`. |
| `RUNNER_USER` | setting | The unprivileged user that runs the service, default `agent`; created if it does not exist. |

The runner's state on the page comes from the machine's runner service. GitHub's own view is under the repository's **Settings -> Actions -> Runners**.

## Run it on its own

The page and its scripts work only through an Automaton Runner. Run on its own, the app starts and shows what is missing, but cannot change any machine. Its tests need only Python 3.12:

```sh
cd maintenance/agent-keeper && python -m unittest discover -p 'test_*.py'
```
