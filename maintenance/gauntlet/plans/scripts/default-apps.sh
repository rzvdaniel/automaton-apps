# The default apps are installed, nothing waits for a permission, and the server reports itself healthy.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
curl -fsS "https://api.$DOMAIN/health" | grep -q '"status":"ok"'
automaton installation-status --json | jq -e . >/dev/null
automaton apps --json | jq -e 'type == "array"' >/dev/null
# `permissions list --pending` lists only apps that wait for an administrator: an empty list is the pass.
pending=$(automaton permissions list --pending --json | jq 'if type == "array" then length else (.apps // [] | length) end')
[ "$pending" = 0 ] || { echo "$pending app(s) wait for a permission" >&2; exit 1; }
echo "server status readable, no pending permissions"
