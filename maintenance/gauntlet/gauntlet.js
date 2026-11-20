const $ = id => document.getElementById(id);
const esc = AutomatonUI.escapeHtml;
let token = sessionStorage.getItem('gauntlet-token') || '';
let open = null;
const time = t => t ? new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';
const took = (a, b) => b ? Math.round(b - a) + ' s' : '';
const pill = s => `<span class="a-pill a-pill--${s === 'passed' ? 'ok' : s === 'running' ? 'warning' : 'critical'}">${esc(s === 'refused' ? 'refused' : s)}</span>`;

// Outside Automaton the server answers 401 with mode "token": ask for the ADMIN_TOKEN once per tab.
async function api(method, path, body, retry = true) {
  const headers = {'X-Gauntlet': '1'};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (response.status === 401) {
    const info = await response.json().catch(() => ({}));
    if (info.mode === 'token' && retry) {
      const asked = prompt('Admin token');
      if (asked) { token = asked; sessionStorage.setItem('gauntlet-token', token); return api(method, path, body, false); }
    }
    throw new Error(info.error || 'Sign in first');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed (' + response.status + ')');
  return data;
}
function fail(error) { const m = $('message'); m.textContent = error.message; m.hidden = false; }

async function load() {
  try {
    const state = await api('GET', '/api/state');
    $('message').hidden = true;
    $('plans').innerHTML = state.plans.map(p => `<tr><td><strong>${esc(p.title)}</strong><div class="plan-meta">${esc(p.description)}</div></td>
      <td>${esc(p.target || '-')}</td><td>${esc(p.schedule)}</td>
      <td>${p.last ? pill(p.last.status) + ' <span class="plan-meta">' + time(p.last.started) + '</span>' : '<span class="plan-meta">No run yet</span>'}</td>
      <td>${p.problem ? '<span class="plan-meta">' + esc(p.problem) + '</span>' : `<button class="a-btn" data-run="${esc(p.name)}" ${state.running ? 'disabled' : ''}>Run now</button>`}</td></tr>`).join('');
    $('runs').innerHTML = state.runs.length ? state.runs.map(r => `<tr><td><a href="#run-${r.id}" data-open="${r.id}">#${r.id}</a></td><td>${esc(r.plan)} on ${esc(r.target || '-')}</td>
      <td>${pill(r.status)}</td><td>${time(r.started)}</td><td>${took(r.started, r.finished)}</td></tr>`).join('') : '<tr><td colspan="5"><div class="a-empty">No runs yet.</div></td></tr>';
    $('setup').textContent = (state.targets.length ? '' : 'No machines are set up: add TARGETS in the app settings. ') +
      (state.github ? '' : 'Failures are emailed; set GITHUB_TOKEN and ISSUE_REPOS to get an issue as well. ') + (state.claude ? 'Claude Code diagnoses failures.' : '');
    if (open) await show(open);
  } catch (error) { fail(error); }
}
async function show(id) {
  open = id;
  const run = await api('GET', '/api/runs/' + id);
  $('detail').hidden = false;
  $('detail-title').textContent = 'Run #' + run.id + ': ' + run.plan + ' on ' + (run.target || '-');
  $('steps').innerHTML = (run.error ? `<tr><td colspan="5">${esc(run.error)}</td></tr>` : '') + run.steps.map(s => `<tr><td>${esc(s.name)}</td><td>${pill(s.status)}</td>
    <td>${s.seconds} s</td><td>${esc(s.problem || '')}</td><td><details><summary>Log</summary><pre class="log a-card">${esc(s.output)}</pre></details></td></tr>`).join('');
}
document.addEventListener('click', async event => {
  const run = event.target.closest('[data-run]'), view = event.target.closest('[data-open]');
  try {
    if (run) { const started = await api('POST', '/api/runs', {plan: run.dataset.run}); open = started.id; await load(); }
    if (view) { event.preventDefault(); await show(view.dataset.open); }
  } catch (error) { fail(error); }
});
load();
setInterval(load, 15000);
