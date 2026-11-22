const $ = id => document.getElementById(id);
const esc = AutomatonUI.escapeHtml;
let token = sessionStorage.getItem('overseer-token') || '';
let open = null, paused = false;
const time = t => t ? new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';
const pill = (text, tone) => `<span class="a-pill a-pill--${tone}">${esc(text)}</span>`;
const tone = s => s === 'done' ? 'ok' : s === 'running' ? 'warning' : 'critical';

// Outside Automaton the server answers 401 with mode "token": ask for the ADMIN_TOKEN once per tab.
async function api(method, path, body, retry = true) {
  const headers = {'X-Overseer': '1'};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (response.status === 401) {
    const info = await response.json().catch(() => ({}));
    if (info.mode === 'token' && retry) {
      const asked = prompt('Admin token');
      if (asked) { token = asked; sessionStorage.setItem('overseer-token', token); return api(method, path, body, false); }
    }
    throw new Error(info.error || 'Sign in first');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed (' + response.status + ')');
  return data;
}
function fail(error) { const m = $('message'); m.textContent = error.message; m.hidden = false; }
const row = (name, state, tn, extra) => `<tr><td><a href="#task-${esc(name)}" data-open="${esc(name)}">${esc(name)}</a>${extra || ''}</td><td>${pill(state, tn)}</td>
  <td>${state === 'running' || state === 'pending' ? `<button class="a-btn" data-cancel="${esc(name)}" type="button">Cancel</button>` : ''}</td></tr>`;

async function load() {
  try {
    const s = await api('GET', '/api/state');
    $('message').hidden = !s.problem;
    if (s.problem) $('message').textContent = s.problem;
    const q = s.queue;
    if (q) {
      paused = q.paused;
      $('worker').innerHTML = pill('worker ' + q.worker, q.worker === 'running' ? 'ok' : 'critical') + (q.paused ? ' ' + pill('paused', 'warning') : '');
      $('pause').textContent = q.paused ? 'Resume queue' : 'Pause queue';
      const rows = q.running.map(t => row(t.name, 'running', 'warning', `<div class="meta">no output for ${Math.round(t.idle / 60)} min</div>`))
        .concat(q.pending.map(t => row(t.name, 'pending', 'info')), q.finished.map(t => row(t.name, t.state, tone(t.state))));
      $('tasks').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="3"><div class="a-empty">The queue is empty.</div></td></tr>';
    }
    $('jobs').innerHTML = s.jobs.map(j => `<tr><td><strong>${esc(j.name)}</strong><div class="meta">${esc(j.what)}</div></td>
      <td>${j.last ? time(j.last.at) + '<div class="meta">' + esc(j.last.trigger) + '</div>' : '<span class="meta">Not run yet</span>'}</td>
      <td>${j.last ? pill(j.last.ok ? 'ok' : 'failed', j.last.ok ? 'ok' : 'critical') + '<div class="meta">' + esc(j.last.text) + '</div>' : ''}</td>
      <td><button class="a-btn" data-job="${esc(j.name)}" type="button">Run now</button></td></tr>`).join('');
    $('schedule').textContent = (s.schedule && s.schedule.next ? 'Next scheduled run: ' + s.schedule.next.replace('T', ' ').slice(0, 16) + ' UTC. ' : '') +
      'Pause or change a schedule in Studio, on this app\'s Schedules tab. ' +
      (s.pickup.ready ? 'Pick-up pulls from ' + s.pickup.boards + (s.pickup.pause ? ' (paused ' + s.pickup.pause + ' UTC)' : '') + '.' : 'Pick-up is off until AGENT_BOARDS and GITHUB_TOKEN are set.') +
      (s.pickup.warning ? ' Warning: ' + s.pickup.warning : '') +
      (s.pickup.problems.length ? ' ' + s.pickup.problems.join('. ') + '.' : '') +
      (s.pickup.skipped.length ? ' Skipped: ' + s.pickup.skipped.map(x => '#' + x.number).join(', ') + ' (needs shape).' : '');
    $('report').textContent = s.report || 'No morning report yet.';
    if (open) await show(open);
  } catch (error) { fail(error); }
}
async function show(name) {
  open = name;
  const t = await api('GET', '/api/tasks/' + encodeURIComponent(name));
  $('detail').hidden = false;
  $('detail-title').textContent = 'Task ' + t.name;
  const link = u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace('https://github.com/', ''))}</a>`;
  $('detail-links').innerHTML = (t.issues.length ? 'Issue: ' + t.issues.map(link).join(', ') + '. ' : '') + (t.pulls.length ? 'Pull request: ' + t.pulls.map(link).join(', ') : '');
  $('detail-log').textContent = t.log || 'No log yet.';
}
document.addEventListener('click', async event => {
  const cancel = event.target.closest('[data-cancel]'), view = event.target.closest('[data-open]'), job = event.target.closest('[data-job]');
  try {
    if (cancel) { await api('POST', '/api/tasks/' + encodeURIComponent(cancel.dataset.cancel) + '/cancel'); await load(); }
    if (view) { event.preventDefault(); await show(view.dataset.open); }
    if (job) { job.disabled = true; await api('POST', '/api/jobs/' + job.dataset.job).catch(fail); await load(); }
    if (event.target.closest('#pause')) { await api('POST', '/api/queue', {paused: !paused}); await load(); }
  } catch (error) { fail(error); }
});
$('add').addEventListener('submit', async event => {
  event.preventDefault();
  try { await api('POST', '/api/tasks', {name: $('name').value.trim(), prompt: $('prompt').value}); $('name').value = ''; $('prompt').value = ''; await load(); }
  catch (error) { fail(error); }
});
load();
setInterval(load, 15000);
