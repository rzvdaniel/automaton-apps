# Prints name=value lines: the runner service, the tools and the disk. Changes nothing.
d="$RUNNER_DIR"
echo "user=$([ -n "$(id -u "$AK_USER" 2>/dev/null)" ] && echo yes || echo no)"
if [ -f "$d/.runner" ]; then
  echo "registered=yes"
  echo "url=$(tr -d '\357\273\277' < "$d/.runner" | jq -r '.gitHubUrl // empty' 2>/dev/null || true)"
  echo "runner_name=$(tr -d '\357\273\277' < "$d/.runner" | jq -r '.agentName // empty' 2>/dev/null || true)"
else
  echo "registered=no"
fi
svc="$(service_name)"
if [ -n "$svc" ]; then
  echo "service=$(systemctl is-active "$svc" 2>/dev/null || true)"
  recent="$(journalctl -u "$svc" -n 200 --no-pager 2>/dev/null || true)"
  echo "listening=$(printf '%s' "$recent" | grep -c -E 'Listening for Jobs|Running job' || true)"
  echo "job=$(printf '%s' "$recent" | grep -E 'Running job:' | tail -1 | sed 's/.*Running job: //' | cut -c1-120)"
else
  echo "service=none"
fi
echo "busy=$(pgrep -f 'Runner.Worker' >/dev/null 2>&1 && echo yes || echo no)"
echo "tool_claude=$(as_user 'claude --version' 2>/dev/null | head -1 || true)"
echo "tool_gh=$(gh --version 2>/dev/null | head -1 | cut -d' ' -f3 || true)"
echo "tool_git=$(git --version 2>/dev/null | cut -d' ' -f3 || true)"
echo "tool_docker=$(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//' || true)"
echo "tool_runner=$([ -f "$d/bin/Runner.Listener.deps.json" ] && "$d/bin/Runner.Listener" --version 2>/dev/null | head -1 || true)"
df -P / | awk 'NR==2 {print "disk_total=" $2*1024; print "disk_used=" $3*1024}'
