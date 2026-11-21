# Restore drill, step 5: the one-line result and the duration.
set -uo pipefail
result=${DRILL_RESULT_DIR:-/root/.gauntlet/drill-result}
# the clock started before the first wipe (drill-start.sh), outside the folder the wipe deletes: the whole run, not the tail
startfile=${DRILL_START_FILE:-/root/.gauntlet-drill-start}
start=$(cat "$startfile" 2>/dev/null || date +%s); rm -f "$startfile"; total=$(( $(date +%s) - start ))
if [ -f "$result/health-ok" ] && [ -f "$result/restore-seconds" ]; then
  echo "RESTORE DRILL: PASS - $(cat "$result/archive") restored in $(cat "$result/restore-seconds") s, health and sign-in checked, $total s in all"
else
  echo "RESTORE DRILL: FAIL - $(cat "$result/archive" 2>/dev/null || echo 'no backup downloaded'), $total s in all" >&2; exit 1
fi
