# Restore drill, step 3: the restored server answers, the restored database says it is installed, and sign-in is handled
# by the restored identity store (a wrong password is refused with 401/400, not a server error).
set -euo pipefail
result=${DRILL_RESULT_DIR:-/root/.gauntlet/drill-result}
for _ in $(seq 60); do
  curl -fsS "https://api.$DOMAIN/health" 2>/dev/null | grep -q '"status":"ok"' && break
  sleep 5
done
curl -fsS "https://api.$DOMAIN/health" | grep -q '"status":"ok"' || { echo "the API is not healthy after the restore" >&2; exit 1; }
echo "API healthy"
curl -fsS -o /dev/null "https://studio.$DOMAIN/api/install/status" || { echo "Studio does not answer after the restore" >&2; exit 1; }
echo "Studio answers"
cd /opt/automaton-server
compose=(docker compose --project-directory . --env-file release.env --env-file .env -f compose.yaml)
[ -f compose.override.yaml ] && compose+=(-f compose.override.yaml)
marker=$("${compose[@]}" exec -T postgres psql -U automaton -d automaton -At -c "SELECT COUNT(*) FROM \"Settings\" WHERE \"Key\" = 'Installation.Complete'" < /dev/null)
[ "$marker" = 1 ] || { echo "the restored database has no installation marker" >&2; exit 1; }
echo "restored database is installed"
code=$(jq -n '{email:"restore-drill@invalid.example",password:"Not-A-Real-Password-1!"}' |
  curl -s -o /dev/null -w '%{http_code}' -X POST "https://api.$DOMAIN/api/Account/LoginUser" -H 'Content-Type: application/json' --data-binary @-)
case "$code" in 400|401|403) echo "sign-in is handled (a wrong password got HTTP $code)";; *) echo "sign-in returned HTTP $code, expected a refusal" >&2; exit 1;; esac
touch "$result/health-ok"
