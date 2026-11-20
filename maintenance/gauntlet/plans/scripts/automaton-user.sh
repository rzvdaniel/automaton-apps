# Creates the non-root 'automaton' user with the same limited sudo rules as production: the updater, Backup now and
# `systemctl status automaton-*`. Steps that run "as": "automaton" then fail here when they need more root than that.
set -euo pipefail
id automaton >/dev/null 2>&1 || useradd --create-home --shell /bin/bash automaton
cat > /etc/sudoers.d/automaton <<'RULES'
automaton ALL=(root) NOPASSWD: /opt/automaton-server/update.sh *
automaton ALL=(root) NOPASSWD: /opt/automaton-server/backup.sh *
automaton ALL=(root) NOPASSWD: /usr/bin/systemctl status automaton-*
RULES
chmod 440 /etc/sudoers.d/automaton
visudo -cf /etc/sudoers.d/automaton
echo "automaton user ready"
