---
name: apps-write-pr
description: Use whenever you open a pull request in rzvdaniel/automaton-apps, so every PR says what changed for the app's users, how it was verified and how to revert it, in the shape the merge gate checks.
license: Apache-2.0
---

# Writing an apps pull request

Title: what the change does for the app's users, imperative, app first: "Harbour: let sharks turn smoothly (#12)".

Write the body to a file and pass it with `gh pr create --body-file`. The merge gate needs the `How verified:`,
`Risk:` and `How to revert:` lines.

```markdown
Refs #N

**What changes for users**
One to three sentences per app touched.

**New settings, secrets or permissions:** none / list them and why the app needs each.

**How verified:** the commands run and what came back (app tests, `automaton validate`, the repo checks).
For a page: screenshots, light and dark, desktop and phone (push them to the `pr-screenshots` branch and link them).

**Risk:** low / medium / high, and why.

**How to revert:** revert this PR; the catalog bot moves the pin back on the next run.

After merge the catalog bot regenerates `catalog.json` and moves the app's pinned commit; installed copies then show Update.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Use `Refs #N`, never `Closes`/`Fixes`: the issue closes when the app works on a server. No session links.
