# Restore drill, step 2: restores the downloaded archive with restore.sh onto the freshly installed server and times it.
set -euo pipefail
dir=${DRILL_DIR:-/root/.gauntlet/drill}; result=${DRILL_RESULT_DIR:-/root/.gauntlet/drill-result}
archive="$dir/$(cat "$result/archive")"
[ -f "$archive" ] && [ -f "$dir/backup-key" ] || { echo "no downloaded backup or key to restore" >&2; exit 1; }
started=$(date +%s)
bash /opt/automaton-server/restore.sh --archive "$archive" --key "$dir/backup-key" --confirm "$DOMAIN" 2>&1 | sed -E 's/AGE-SECRET-KEY-[A-Z0-9]+/[hidden key]/g'
seconds=$(( $(date +%s) - started ))
echo "$seconds" > "$result/restore-seconds"
echo "restore.sh took $seconds s"
