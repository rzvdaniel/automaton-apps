# Removes any Automaton install, its data, backups and key. Safe to run on a clean machine.
set -euo pipefail
dir=$(mktemp -d)
curl -fL https://raw.githubusercontent.com/rzvdaniel/automaton/main/scripts/uninstall-automaton.sh -o "$dir/uninstall-automaton.sh"
# Deleting data needs the installed server's domain (uninstall asks for the word "delete" when no install is left).
confirm=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["domain"])' /etc/automaton/installation.json 2>/dev/null || true)
bash "$dir/uninstall-automaton.sh" --delete-data --yes --no-final-backup --confirm "${confirm:-delete}"
rm -rf "$dir" /root/.gauntlet
test ! -e /opt/automaton-server && test ! -e /etc/automaton && echo "nothing is left of Automaton"
