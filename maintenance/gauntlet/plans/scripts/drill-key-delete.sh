# Restore drill, step 4: removes the backup key and the downloaded archive from the machine, whatever happened before.
set -uo pipefail
dir=${DRILL_DIR:-/root/.gauntlet/drill}
[ -f "$dir/backup-key" ] && shred -u "$dir/backup-key"
rm -rf "$dir"
[ ! -e "$dir/backup-key" ] && echo "backup key deleted"
