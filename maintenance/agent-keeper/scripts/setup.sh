# Installs the tools and registers this machine as a GitHub Actions runner. Safe to run again: it only adds what is missing.
# Line 1 of stdin is the runner registration token; it is needed only while the runner is not registered yet.
IFS= read -r AK_TOKEN || AK_TOKEN=""

log "packages"
missing=""
for p in git curl jq ca-certificates build-essential unzip python3 sudo; do
  dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"
done
if [ -n "$missing" ]; then apt-get update -qq; apt-get install -y -qq $missing >/dev/null; fi
if ! have docker; then apt-get update -qq; apt-get install -y -qq docker.io >/dev/null; fi
if ! have gh; then
  mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -qq
  apt-get install -y -qq gh >/dev/null
fi

log "user $AK_USER"
id -u "$AK_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$AK_USER"
AK_HOME="$(getent passwd "$AK_USER" | cut -d: -f6)"
RUNNER_DIR="$AK_HOME/actions-runner"
if getent group docker >/dev/null 2>&1; then usermod -aG docker "$AK_USER"; fi

log "Claude Code"
if [ ! -x "$AK_HOME/.local/bin/claude" ]; then as_user 'curl -fsSL https://claude.ai/install.sh | bash'; fi

log "runner software"
if [ ! -x "$RUNNER_DIR/config.sh" ]; then
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo "ERROR: unsupported CPU $(uname -m)"; exit 2 ;; esac
  release="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)"
  version="$(printf '%s' "$release" | jq -r .tag_name | sed 's/^v//')"
  sha="$(printf '%s' "$release" | jq -r --arg n "actions-runner-linux-$arch-$version.tar.gz" '.assets[] | select(.name == $n) | .digest // empty' | sed 's/^sha256://')"
  [ -n "$sha" ] || sha="$(printf '%s' "$release" | jq -r .body | sed -n "s/.*BEGIN SHA linux-$arch -->\\([0-9a-f]\\{64\\}\\)<!-- END.*/\\1/p" | head -1)"
  [ -n "$sha" ] || { echo "ERROR: could not read the runner checksum"; exit 2; }
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/runner.tar.gz" "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$arch-$version.tar.gz"
  echo "$sha  $tmp/runner.tar.gz" | sha256sum -c - >/dev/null || { echo "ERROR: runner checksum does not match"; rm -rf "$tmp"; exit 2; }
  mkdir -p "$RUNNER_DIR"
  tar -xzf "$tmp/runner.tar.gz" -C "$RUNNER_DIR"
  rm -rf "$tmp"
  chown -R "$AK_USER:$AK_USER" "$RUNNER_DIR"
  "$RUNNER_DIR/bin/installdependencies.sh" >/dev/null 2>&1 || true
fi

log "register"
if [ -f "$RUNNER_DIR/.runner" ]; then
  echo "already registered"
else
  [ -n "$AK_TOKEN" ] || { echo "ERROR: this machine is not registered yet; enter a runner registration token"; exit 2; }
  export ACTIONS_RUNNER_INPUT_TOKEN="$AK_TOKEN"
  (cd "$RUNNER_DIR" && runuser -u "$AK_USER" -- env HOME="$AK_HOME" ./config.sh --unattended --url "$AK_URL" --name "$AK_NAME" --labels "$AK_LABELS" --replace) >/dev/null
  unset ACTIONS_RUNNER_INPUT_TOKEN AK_TOKEN
  echo "registered"
fi

log "service"
if [ -z "$(service_name)" ]; then (cd "$RUNNER_DIR" && ./svc.sh install "$AK_USER") >/dev/null; fi
svc="$(service_name)"
if systemctl is-active --quiet "$svc"; then echo "running"; else (cd "$RUNNER_DIR" && ./svc.sh start) >/dev/null; echo "started"; fi
echo "done"
