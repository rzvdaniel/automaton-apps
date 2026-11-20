# The sample app deployed before an update still answers after it.
set -euo pipefail
code=$(curl -s -o /dev/null -w '%{http_code}' "https://gauntlet-sample.$DOMAIN/" || true)
[ "$code" = 200 ] || { echo "the sample app answered HTTP $code" >&2; exit 1; }
echo "the sample app still answers"
