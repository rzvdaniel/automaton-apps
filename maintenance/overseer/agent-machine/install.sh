#!/usr/bin/env bash
# Install the agent-machine scripts into a bin directory (default ~/bin; first argument overrides).
#   install.sh [dir] [--cron] [--systemd] [--check]
# Copies agent-queue, claude-task, orchestrator.sh and agent-cleanup (an existing different file is first saved as
# <name>.bak-YYYYMMDD). Files are replaced by a new inode, so a running worker is not disturbed. A file that is already
# the same is left alone, so running it again changes nothing.
# --cron     sets the crontab entries (lines marked "# agent-queue" are replaced, other lines are kept).
# --systemd  like --cron, and runs the worker as the systemd user service agent-queue-worker (Restart=always) instead of
#            an @reboot cron line. It restarts the worker only when no task is running; otherwise it leaves a marker
#            (~/agent-queue/RESTART_WORKER) and the next run restarts it. Without a usable systemd user session it
#            keeps the @reboot line and says so.
# --check    prints whether claude, gh and git are there and signed in. It never signs in.
# The last line printed is "setup: <what changed>; claude: ..., gh: ..., git: ..., worker: ...".
# <dir>/.agent-machine-version holds the hash of the installed files (the app compares it with its own copy).
set -euo pipefail
dest=$HOME/bin; cron=0; sd=0; check=0
for a in "$@"; do case $a in --cron) cron=1;; --systemd) cron=1; sd=1;; --check) check=1;; *) dest=$a;; esac; done
src=$(dirname "$(readlink -f "$0")")
Q=${AGENT_QUEUE_HOME:-$HOME/agent-queue}
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
files=(agent-queue claude-task orchestrator.sh agent-cleanup)
changed=()
version() { (cd "$1" && cat "${files[@]}" agent-queue-worker.service | sha256sum | cut -c1-16); }

report() {
  local claude gh_ git_ worker
  if ! PATH=$HOME/.local/bin:$PATH command -v claude >/dev/null; then claude="missing"
  elif CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude-second} PATH=$HOME/.local/bin:$PATH claude auth status >/dev/null 2>&1; then claude="logged in"
  else claude="not logged in"; fi
  if ! command -v gh >/dev/null; then gh_="missing"
  elif gh auth status >/dev/null 2>&1; then gh_="logged in as $(gh api user -q .login 2>/dev/null || echo '?')"
  else gh_="not logged in"; fi
  if command -v git >/dev/null; then git_="found"; else git_="missing"; fi
  if [[ $(AGENT_QUEUE_HOME=$Q "$dest/agent-queue" status 2>/dev/null | sed -n 's/^worker: *//p') == running ]]; then worker=running; else worker="not running"; fi
  echo "claude: $claude, gh: $gh_, git: $git_, worker: $worker"
}
if (( check )); then report; exit 0; fi

mkdir -p "$dest" "$Q" "$HOME/claude-tasks"
for f in "${files[@]}"; do
  cmp -s "$dest/$f" "$src/$f" 2>/dev/null && continue
  [[ -e $dest/$f ]] && cp -p "$dest/$f" "$dest/$f.bak-$(date +%Y%m%d)"
  install -m 0755 "$src/$f" "$dest/$f"; changed+=("$f")
done

use_unit=0
if (( cron )); then
  env_="env PATH=$dest:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin AGENT_QUEUE_RUNNER=$dest/claude-task"
  orch="$env_ ORCH_STALL_MINUTES=120"
  out=">> $HOME/claude-tasks"
  if (( sd )) && systemctl --user show-environment >/dev/null 2>&1; then use_unit=1; fi
  reboot=""; (( use_unit )) || reboot="@reboot $env_ nohup $dest/agent-queue worker $out/worker.out 2>&1 & # agent-queue"
  new=$(cat <<C
${reboot}
*/30 * * * * $orch $dest/orchestrator.sh $out/orchestrator.out 2>&1 # agent-queue
0 6 * * * $orch ORCH_REPORT=1 $dest/orchestrator.sh $out/orchestrator.out 2>&1 # agent-queue
30 4 * * * $env_ $dest/agent-cleanup worktrees $out/cleanup.out 2>&1 # agent-queue
0 5 * * 0 $env_ $dest/agent-cleanup caches $out/cleanup.out 2>&1 # agent-queue
0 3 * * * $env_ /bin/sh -c 'echo "Follow .agents/skills/automaton-lessons-learned/SKILL.md end to end on the lessons inbox (the open issue labelled lessons). Reply on the inbox." | $dest/agent-queue add lessons-\$(date +\%Y\%m\%d)' $out/lessons-cron.out 2>&1 # agent-queue
C
)
  new=$(sed '/^$/d' <<<"$new")
  old=$(crontab -l 2>/dev/null || true)
  mine=$(grep '# agent-queue$' <<<"$old" || true)
  other=$(grep -v '# agent-queue$' <<<"$old" | grep -E 'agent-queue worker|orchestrator\.sh|agent-queue add lessons' || true)
  if [[ $mine != "$new" || -n $other ]]; then
    { grep -v '# agent-queue$' <<<"$old" | grep -vE 'agent-queue worker|orchestrator\.sh|agent-queue add lessons' || true; echo "$new"; } | crontab -
    changed+=(crontab)
  fi
fi

restart=""
if (( use_unit )); then
  unitdir=$HOME/.config/systemd/user; mkdir -p "$unitdir"
  unit=$(sed "s#%h/bin#$dest#g" "$src/agent-queue-worker.service")
  if [[ $(cat "$unitdir/agent-queue-worker.service" 2>/dev/null || true) != "$unit" ]]; then
    echo "$unit" > "$unitdir/agent-queue-worker.service"; changed+=(unit); systemctl --user daemon-reload
  fi
  if ! systemctl --user is-enabled agent-queue-worker >/dev/null 2>&1; then systemctl --user enable agent-queue-worker >/dev/null 2>&1; changed+=(enabled); fi
  busy=$(AGENT_QUEUE_HOME=$Q "$dest/agent-queue" status 2>/dev/null | sed -n '/^running:/,/^pending:/p' | grep -c 'log idle' || true)
  if ! systemctl --user is-active agent-queue-worker >/dev/null 2>&1; then
    if (( busy )); then touch "$Q/RESTART_WORKER"; restart="the service starts when the running task ends (next setup run)"
    else pkill -f "$dest/agent-queue worker" 2>/dev/null || true; systemctl --user start agent-queue-worker; changed+=(worker-started); rm -f "$Q/RESTART_WORKER"; fi
  elif (( ${#changed[@]} )) || [[ -e $Q/RESTART_WORKER ]]; then
    if (( busy )); then touch "$Q/RESTART_WORKER"; restart="worker restarts when idle (next setup run)"
    else systemctl --user restart agent-queue-worker; changed+=(worker-restarted); rm -f "$Q/RESTART_WORKER"; fi
  fi
elif (( sd )); then restart="no systemd user session (run: loginctl enable-linger $(id -un)); kept the @reboot line"
fi
# Written last: until then the app sees an older version and runs the setup again.
newver=$(version "$src")
[[ $(cat "$dest/.agent-machine-version" 2>/dev/null || true) == "$newver" ]] || { echo "$newver" > "$dest/.agent-machine-version.new"; mv -f "$dest/.agent-machine-version.new" "$dest/.agent-machine-version"; }
echo "installed to $dest"
echo "setup: $( ((${#changed[@]})) && echo "changed ${changed[*]}" || echo "nothing changed")${restart:+; $restart}; $(report)"
