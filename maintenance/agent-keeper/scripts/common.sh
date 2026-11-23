# Shared by every script: the settings the app puts in front (AK_USER, AK_URL, AK_NAME, AK_LABELS) and small helpers.
# Never print the token or turn on shell tracing.
set -eu
export DEBIAN_FRONTEND=noninteractive
AK_HOME="$(getent passwd "$AK_USER" | cut -d: -f6 || true)"
[ -n "$AK_HOME" ] || AK_HOME="/home/$AK_USER"
RUNNER_DIR="$AK_HOME/actions-runner"
log() { printf '== %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
as_user() { runuser -l "$AK_USER" -c "$1"; }
service_name() { [ -f "$RUNNER_DIR/.service" ] && tr -d '\r\n' < "$RUNNER_DIR/.service" || true; }
