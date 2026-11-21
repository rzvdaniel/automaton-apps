---
name: automaton-app-design
description: Use before building or changing the user interface of any app in this repository, so every catalog app looks the same and uses the Automaton UI kit.
license: Apache-2.0
---

# Automaton app design

Every app page is built from `design/automaton-app-ui/` and nothing else: no other CSS framework, no CDN, no web fonts. Read `design/automaton-app-ui/README.md` for the component list.

## Rules

1. **Vendor, do not link.** An app is installed from its own folder, so copy `app.css` and `app.js` from the kit into the app's `ui/` folder, unchanged, and serve them from the app.
2. **Never edit a vendored copy.** To change the look, change the kit (bump its version in both header comments), then copy it again into every app that uses it. `python tools/check_vendored_ui.py` fails when a copy differs.
3. **Use the existing component for the job:** cards for topics, pills for status (`ok`, `warning`, `critical`, always with words), stat tiles for headline numbers, meters and `AutomatonUI.sparkline` for trends, `a-table` for tables, `a-list` for name and value rows, `a-waiting` for "needs setup or approval" states, `a-empty` when there is nothing yet, `a-form` for inputs. If nothing fits, add a component to the kit first. App-specific CSS goes in the app's own file and may only use the kit's custom properties.
4. **Colours** come from the tokens; never hard-code a colour in an app. Status uses the kit pills (`a-pill--ok`, `--warning`, `--critical`, `--running`, plain `a-pill` for unknown), which follow "Status colours and history" below.
5. **Escape** every dynamic value before it goes into `innerHTML` (`AutomatonUI.escapeHtml`).

## Status colours and history (owner, 2026-11-21)

The Studio Home language. It applies to the system look (`data-look="system"`); default-look apps follow the same rules with their own `--accent` in place of orange; games are exempt.

| State | Look |
|---|---|
| Normal (passed, ok, running fine) | quiet: ink or grey, a dark bar like Home's meters. **No green.** |
| Needs attention (failed, needs you, waiting for approval) | the accent orange: orange pill with words, orange bar |
| In progress | orange outline, not a fill |
| No data yet | the light line colour |
| Destructive (delete, data loss) | the only place for red |

- Status is always a pill or bar **with words**, never colour alone.
- **History belongs to its item.** Runs, checks or deployments of one plan, site or job sit under that item, newest
  first (the last 10, then "Show older"). Never one list that mixes items. The last 10 also show as small bars in the
  item's row; clicking a bar opens that run.
- Details open in place (expandable rows), not in a side panel, so several can be open at once.
- References: the Studio Home mosaic (`https://claude.ai/artifact/K7rrcK35wWQoimNfPazJvH`) and the Gauntlet page
  (`https://claude.ai/artifact/6CNziUipLBEQVRWSxuMWBx`), both private; their rules are the ones above.

## Checks

- Before the pull request: `python tools/check_vendored_ui.py` and the app's tests pass.
- On the test server, in a real browser (no headless browser): light and dark both look right, and at 390 px wide
  nothing scrolls sideways or is cut off. The screenshots go in the issue's proof.
