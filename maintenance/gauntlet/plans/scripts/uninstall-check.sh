# Uninstalls with --delete-data and checks that nothing is left.
set -euo pipefail
dir=$(mktemp -d)
curl -fL https://raw.githubusercontent.com/rzvdaniel/automaton/main/scripts/uninstall-automaton.sh -o "$dir/uninstall-automaton.sh"
bash "$dir/uninstall-automaton.sh" --delete-data --yes
if [ -n "$(docker ps -aq 2>/dev/null)" ]; then echo "containers are left:" >&2; docker ps -a --format '{{.Names}}' >&2; exit 1; fi
if [ -n "$(docker volume ls -q 2>/dev/null)" ]; then echo "volumes are left" >&2; exit 1; fi
test ! -e /opt/automaton-server && test ! -e /etc/automaton || { echo "install folders are left" >&2; exit 1; }
systemctl list-units 'automaton-*' --no-legend | grep -q . && { echo "systemd units are left" >&2; exit 1; }
echo "nothing is left"
