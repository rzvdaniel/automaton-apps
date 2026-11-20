# Updates the installed server to the newest published server release (a pre-release counts), as the docs' update steps do.
set -euo pipefail
newest=$(curl -fsS "https://api.github.com/repos/rzvdaniel/automaton/releases?per_page=30" |
  jq -r '[.[] | select(.tag_name | startswith("server-v"))][0].tag_name')
[ -n "$newest" ] && [ "$newest" != null ] || { echo "could not find the newest server release" >&2; exit 1; }
before=$(cat /opt/automaton-server/version 2>/dev/null || echo unknown)
bash /opt/automaton-server/update.sh --version "$newest"
echo "updated from $before to $newest"
for _ in $(seq 60); do
  curl -fsS "https://api.$DOMAIN/health" | grep -q '"status":"ok"' && { echo "API healthy after the update"; exit 0; }
  sleep 5
done
echo "the API did not become healthy after the update" >&2; exit 1
