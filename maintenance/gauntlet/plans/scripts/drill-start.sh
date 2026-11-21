# Restore drill, step 0: starts the clock for the whole run. It lives outside /root/.gauntlet because wipe.sh deletes that.
set -euo pipefail
date +%s > "${DRILL_START_FILE:-/root/.gauntlet-drill-start}"
