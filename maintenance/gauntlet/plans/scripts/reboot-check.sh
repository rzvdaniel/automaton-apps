# Restarts the machine and waits until the API answers again.
set -euo pipefail
systemd-run --on-active=3 systemctl reboot >/dev/null
echo "reboot scheduled"
