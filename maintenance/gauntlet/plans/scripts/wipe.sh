# Removes any Automaton install, its data, backups and key. Safe to run on a clean machine.
set -euo pipefail
dir=$(mktemp -d)
curl -fL https://raw.githubusercontent.com/rzvdaniel/automaton/main/scripts/uninstall-automaton.sh -o "$dir/uninstall-automaton.sh"
bash "$dir/uninstall-automaton.sh" --delete-data --yes
rm -rf "$dir" /root/.gauntlet
test ! -e /opt/automaton-server && test ! -e /etc/automaton && echo "nothing is left of Automaton"
