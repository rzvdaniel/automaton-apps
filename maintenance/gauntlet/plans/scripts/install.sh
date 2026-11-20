# The docs' agent steps: tools, then the installer, then wait for the API to answer.
set -euo pipefail
apt-get update -qq && apt-get install -y -qq jq curl python3 libicu-dev
jq --version
dir=$(mktemp -d)
curl -fL https://raw.githubusercontent.com/rzvdaniel/automaton/main/scripts/install-automaton.sh -o "$dir/install-automaton.sh"
bash "$dir/install-automaton.sh" --domain "$DOMAIN" --email "$EMAIL" --quiet $INSTALL_FLAGS
rm -rf "$dir"
for _ in $(seq 60); do
  curl -fsS "https://api.$DOMAIN/health" | grep -q '"status":"ok"' && { echo "API healthy"; exit 0; }
  sleep 5
done
echo "the API did not become healthy in 5 minutes" >&2; exit 1
