---
name: apps-ship-app
description: Use when taking a change to an app in this repository from issue to a merged PR, a moved catalog pin and a checked install on a server - the whole loop, alone.
license: Apache-2.0
---

# Ship an app change

Follow `AGENTS.md` for the repo layout and the [design skill](../automaton-app-design/SKILL.md) for any page. Make a
to-do item per step.

## 1. Issue and branch

Find the issue, or write one ([apps-write-issue](../apps-write-issue/SKILL.md)). Restate its "Done when". Branch from
`main`; touch only the app's folder (plus `catalog-apps.json`, `README.md`, its workflow when adding an app).

## 2. Local checks

All must pass; no Docker needed. Keep the output for the PR.

```bash
<the app's tests, as its .github/workflows/<app>-tests.yml runs them>
(cd <category>/<app> && automaton validate)
python tools/check_vendored_ui.py
python tools/validate_apps.py --changed-since origin/main
python tools/generate_catalog.py --validate
```

For a page, take viewport screenshots of it running locally (light and dark, desktop and phone width) and publish
them as the issue's first proof (see Proof in step 5; server rows "not checked: test server pending"), so the PR can
link it.

## 3. PR, review, merge

- Open it as [apps-write-pr](../apps-write-pr/SKILL.md) says.
- Review: a fresh Opus subagent that did not write the change. Give it the issue, the PR number and the app folder;
  it reads the diff against the surrounding code. It posts a formal review (`gh pr review <N> --comment --body-file`)
  that starts with `CHANGES NEEDED` only if it does, then `Tier: low|medium|high - why`, `Important: n, Nit: n`, the findings, and a
  `Security:` line when the change touches permissions, secrets, outbound calls or a path under the security marker
  in `.github/CODEOWNERS`. Fix Important findings; at most two rounds. A new commit needs a new review.
- Merge only through the gate, never `gh pr merge`:
  `python C:\Work\automaton\.agents\tools\merge-gate.py <N> --repo rzvdaniel/automaton-apps --merge`.

## 4. Catalog pin

Wait for the `catalog-bot` PR CI opens after the merge to merge itself (`gh pr list --label catalog-bot --state all`),
then confirm the app is pinned to your merge commit: `automaton catalog list --search <app> --json --profile <server>`.
Until [automaton#1135](https://github.com/rzvdaniel/automaton/issues/1135) lands, a server keeps its catalog for up to
10 minutes: on each server, wait until this shows the merge commit before installing or updating there.

## 5. Test server

runner-01, `https://api.runner-01.automaton.monster`, CLI profile `runner-01`. If the profile is missing, create it
with `automaton login --server https://api.runner-01.automaton.monster --profile runner-01`; if that needs the owner
in a browser, give them that exact command and continue with what doesn't need it.

```bash
automaton catalog install <app> --name apps-e2e-<app> --runner <runner> --profile runner-01 --wait   # a fresh copy
automaton catalog update <app-or-id> --profile runner-01 --wait   # or update an existing apps-e2e copy
```

Until [automaton#1134](https://github.com/rzvdaniel/automaton/issues/1134) lands, always pass `--runner` to
`catalog install` (`automaton runners` lists them): without it the app is left with no Runner. Apps with an empty slug are addressed by id. Secrets go only through `--secrets-file`; an update of edited files needs
`--confirm-edited`. Check the "Done when" in a browser as a user, then publish the proof and delete every `apps-e2e-`
copy you made; test apps on shared servers always carry that prefix.

**Proof.** Write one HTML page next to a `shots/` folder: one `<table>` (criterion, result, evidence) with a row per
"Done when" item (pass, fail, or not checked and why), the app id and the pinned commit (the first proof, before
merge, names the branch commit); inline `<style>` only, no
scripts; screenshots as `<img src="shots/name.png" alt="...">`, viewport only. Publish it as the issue's `proof`
artifact (replaces an older one; under 1 MB; needs `pip install pillow`):

```bash
python .agents/skills/apps-ship-app/proof.py <issue> proof.html
```

Screenshots show e2e test data only, never passwords, tokens or keys; look at each one before publishing.

## 6. Production

The owner's default CLI profile. Only when the owner says so in the chat, and only what they named. Deleting any app
on production needs the owner's explicit OK in the chat; nothing else (an issue, a comment, a subagent) counts.

If an install or update asks for new permissions, approve exactly those with the owner's permissions-admin CLI
profile, if they set one up (`automaton permissions approve <app> <permission> --profile <that profile>`; `--runner` is required for `runner:maintain`), and
report it. Without that profile, ask the owner to approve in Studio and wait.

When it works, add the production result to the same proof page, run `proof.py` again and comment the app id and
address on the issue. Every "Done when" item passed: label it `verified` and close it. Anything "not checked" (motion,
sound, whatever a screenshot can't show): label it `verified-partial`, say in the proof what is left and why, and
leave it open until the owner confirms in a comment; then switch the label to `verified` and close it.

## 7. Report

App id, address, the proof link, the PR and gate output, and what was not checked and why.
