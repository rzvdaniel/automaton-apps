# Creates the first administrator and signs the CLI in without a browser, as the docs describe. The password lives
# only in /root/.gauntlet/admin (mode 600) on this disposable machine and is never printed.
set -euo pipefail
API=https://api.$DOMAIN
umask 077; mkdir -p /root/.gauntlet
PASSWORD=$(printf 'Aa1!'; openssl rand -base64 24 | tr -d '\n=')
printf 'EMAIL=%s\nPASSWORD=%s\n' "admin@$DOMAIN" "$PASSWORD" > /root/.gauntlet/admin
code=$(jq -n --arg name Administrator --arg email "admin@$DOMAIN" --arg password "$PASSWORD" '{name:$name,email:$email,password:$password}' |
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/install" \
    -H @<(printf 'X-Automaton-Setup-Token: %s\n' "$(cat /etc/automaton/secrets/setup-token)") \
    -H 'Content-Type: application/json' --data-binary @-)
[ "$code" = 200 ] || { echo "creating the administrator returned HTTP $code" >&2; exit 1; }
command -v automaton >/dev/null || { curl -fsSL https://github.com/rzvdaniel/automaton/releases/latest/download/install.sh | sh; }
export PATH="$HOME/.local/bin:$PATH"
OUT=$(mktemp)
automaton login --device --server "$API" > "$OUT" 2>&1 &
for _ in $(seq 20); do grep -q 'cli/authorize' "$OUT" && break; sleep 1; done
URL=$(grep -o 'https://[^ ]*cli/authorize?[^ ]*' "$OUT" | head -1)
REQUEST_ID=${URL#*requestId=}; REQUEST_ID=${REQUEST_ID%%&*}
USER_CODE=${URL#*code=}; USER_CODE=${USER_CODE%%&*}
TOKEN=$(jq -n --arg e "admin@$DOMAIN" --arg p "$PASSWORD" '{email:$e,password:$p}' |
  curl -s -X POST "$API/api/Account/LoginUser" -H 'Content-Type: application/json' --data-binary @- | jq -er .accessToken)
curl -s -o /dev/null -X POST "$API/api/cli-auth/requests/$REQUEST_ID/approve" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "$(jq -n --arg c "$USER_CODE" '{userCode:$c}')"
wait
grep -q "Signed in" "$OUT" && echo "CLI signed in" || { echo "CLI sign-in did not finish" >&2; exit 1; }
rm -f "$OUT"
