---
name: apps-write-issue
description: Use whenever you create a GitHub issue in rzvdaniel/automaton-apps - a new app, a feature or bug in an app, or a gap found while testing - so every issue has the same short shape, a "Done when" a user could check on a server, and its place on the board.
license: Apache-2.0
---

# Writing an apps issue

Title: what should be true, in plain words, starting with the app: "Harbour: sharks swim without shaking", not
"Fix shark bug".

Feature:

```markdown
**Goal**
As a <role>, I want <capability>, so that <benefit>.

**Example**
A concrete case: who does what in the app, and what they see.

**Suggestion**
The simplest approach, and what is out of scope.

**Done when**
What a user sees with the app installed on a server.
```

Bug:

```markdown
**Problem**
What goes wrong and who it affects.

**Steps**
1. …

**Result**
What happens, with the exact error.

**Expected**
What should happen instead.

**Done when**
What a user sees with the app installed on a server.
```

"Done when" describes the installed app, not the tests: "the page shows X in light and dark", "the nightly schedule
runs and its log says Y", "the alert email arrives within a minute". Say so when only a test can cover it.

Keep it short; link issues and PRs by number. No credentials, server addresses or customer data.

## UI changes: attach the mock

Agents cannot open private claude.ai artifacts. For any issue that changes a screen, commit the mock to the repo and
link it from **Example**: the HTML under `design/mocks/<slug>.html` and a screenshot of each main state next to it
(`<slug>-<state>.png`). The issue text still describes every state, so it stands without the mock.

## Board

Add it to the App catalog board (project 2) and, if one fits, under a parent issue:

```bash
gh project item-add 2 --owner rzvdaniel --url <issue url>
gh api -X POST repos/rzvdaniel/automaton-apps/issues/<parent>/sub_issues -F sub_issue_id=<issue id>
```
