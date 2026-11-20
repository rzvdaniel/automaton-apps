# Waits (up to 10 minutes) until the API answers and the default apps are running.
set -euo pipefail
for _ in $(seq 120); do
  curl -fsS "https://api.$DOMAIN/health" 2>/dev/null | grep -q '"status":"ok"' && { echo "API healthy"; exit 0; }
  sleep 5
done
echo "the API did not come back in 10 minutes" >&2; exit 1
