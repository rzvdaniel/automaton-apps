# The release docs walk (rzvdaniel/automaton .agents/skills/automaton-verify-release, "Docs walk"): Claude on Haiku at low effort
# plays the user pages changed since the previous server release plus two rotating requests, reading only the docs of the release
# tag, and changes nothing. The last line is "DOCS-WALK RESULT: PASS|FAIL <version> - <note>"; Gauntlet records it in the release notes.
set -euo pipefail
api=https://api.github.com/repos/rzvdaniel/automaton
tags=$(curl -fsS "$api/releases?per_page=30" | jq -r '[.[] | select(.tag_name | test("^server-v[0-9]+\\.[0-9]+\\.[0-9]+$"))] | .[0:2][].tag_name')
tag=$(echo "$tags" | sed -n 1p); previous=$(echo "$tags" | sed -n 2p)
[ -n "$tag" ] || { echo "could not find the newest server release" >&2; exit 1; }
version=${tag#server-v}
work=$(mktemp -d); cd "$work"
git clone --quiet --filter=blob:none --no-checkout https://github.com/rzvdaniel/automaton.git repo
cd repo; git checkout --quiet "$tag"
pages=$([ -n "$previous" ] && git diff --name-only "$previous" "$tag" -- src/automaton-vue/docs || true)
# two requests per release, rotating with the release's patch number (14 requests in the list)
rows=$(grep -E '^\| [0-9]+ \|' docs/maintainers/docs-walk-requests.md)
count=$(echo "$rows" | wc -l); first=$(( (${version##*.} * 2) % count ))
requests=$(echo "$rows" | sed -n "$((first + 1))p;$(( (first + 1) % count + 1 ))p")
claude -p --model haiku --effort low --allowedTools "Read,Grep,Glob" <<PROMPT
You are a new Automaton user with an AI agent. Read only the documentation of release $version: this folder's src/automaton-vue/docs
(never the website). Do not run anything and do not change anything. Play each request below as someone who has never seen Automaton,
starting from its start page, and walk every page changed in this release in the same way.
Changed pages:
${pages:-none}
Requests (table rows from docs/maintainers/docs-walk-requests.md):
$requests
List every step where the docs were wrong, missing or unclear, every guess you had to make, and any input they do not tell you to ask for.
Then list the changed pages you covered. Finish with exactly one line:
DOCS-WALK RESULT: PASS $version - <pages covered>   (nothing found)
or DOCS-WALK RESULT: FAIL $version - <what was found>   (something found)
PROMPT
