# Upgrades gh, git and Docker (only the ones installed with apt) and Claude Code. Changes no runner setting.
log "packages"
apt-get update -qq
for p in gh git docker.io; do
  if dpkg -s "$p" >/dev/null 2>&1; then apt-get install -y -qq --only-upgrade "$p"; fi
done
log "Claude Code"
if [ -x "$AK_HOME/.local/bin/claude" ]; then as_user 'claude update' 2>&1 | tail -3 || true; else echo "not installed (run setup)"; fi
echo "done"
