# Claude Code follows the install docs as a new user would, without running them, and reports anything unclear or wrong.
set -euo pipefail
cd "$(mktemp -d)"
claude -p --allowedTools "Read,Grep,Glob,WebFetch" <<'PROMPT'
You are a new Automaton user. Read https://automaton.monster/docs/install-server and https://automaton.monster/docs/install-with-ai and follow them
in your head, step by step, as someone who has never seen Automaton. Do not run installs and do not change anything.
List every step that is unclear, wrong, missing or contradicts another page, each with the page and the exact sentence.
Finish with exactly one line: DOCS-WALK RESULT: PASS (nothing found) or DOCS-WALK RESULT: FAIL (something found).
PROMPT
