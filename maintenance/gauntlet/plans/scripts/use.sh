# Uses the server: deploys a sample app, opens it, and runs a backup.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
dir=$(mktemp -d); cd "$dir"
automaton new gauntlet-sample >/dev/null
cd gauntlet-sample
automaton deploy --non-interactive
code=$(curl -s -o /dev/null -w '%{http_code}' "https://gauntlet-sample.$DOMAIN/" || true)
[ "$code" = 200 ] || { echo "the sample app answered HTTP $code" >&2; exit 1; }
bash /opt/automaton-server/backup.sh --install-dir /opt/automaton-server
ls /opt/automaton-server/backups | head -3
echo "sample app deployed and a backup ran"
