# Run as the limited user: it may read the status and nothing else.
set -euo pipefail
sudo -n systemctl status 'automaton-*' >/dev/null || true
if sudo -n true 2>/dev/null; then echo "the automaton user has more sudo than production allows" >&2; exit 1; fi
sudo -n -l | grep -q 'update.sh' || { echo "the updater is not allowed for the automaton user" >&2; exit 1; }
echo "limited sudo rules match production"
