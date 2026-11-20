# Log forwarding: the default logs app has received lines from the server's containers.
set -euo pipefail
sleep 30
export PATH="$HOME/.local/bin:$PATH"
export HOME=${HOME:-/root}
for name in $(docker ps --format '{{.Names}}' | grep -i victoria | head -1); do
  docker exec "$name" wget -qO- 'http://127.0.0.1:9428/select/logsql/query?query=*&limit=1' | grep -q . && { echo "log forwarding works"; exit 0; }
done
echo "no log lines were found in the logs app (is it installed?)" >&2; exit 1
