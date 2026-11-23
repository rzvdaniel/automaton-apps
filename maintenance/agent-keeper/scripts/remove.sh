# Unregisters the runner on GitHub and removes its service. The tools stay. Line 1 of stdin is the removal token.
IFS= read -r AK_TOKEN || AK_TOKEN=""
if [ ! -f "$RUNNER_DIR/.runner" ] && [ -z "$(service_name)" ]; then echo "nothing to remove"; exit 0; fi
if [ -f "$RUNNER_DIR/.runner" ] && [ -z "$AK_TOKEN" ]; then echo "ERROR: enter a runner removal token"; exit 2; fi
log "service"
if [ -n "$(service_name)" ]; then
  (cd "$RUNNER_DIR" && { ./svc.sh stop || true; ./svc.sh uninstall || true; }) >/dev/null 2>&1
fi
log "unregister"
if [ -f "$RUNNER_DIR/.runner" ]; then
  export ACTIONS_RUNNER_INPUT_TOKEN="$AK_TOKEN"
  (cd "$RUNNER_DIR" && runuser -u "$AK_USER" -- env HOME="$AK_HOME" ./config.sh remove --unattended) >/dev/null
  unset ACTIONS_RUNNER_INPUT_TOKEN AK_TOKEN
fi
echo "removed"
