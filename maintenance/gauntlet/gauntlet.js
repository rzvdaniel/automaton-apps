const $ = id => document.getElementById(id);
const esc = AutomatonUI.escapeHtml;
let token = sessionStorage.getItem('gauntlet-token') || '';
const time = t => t ? new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';
const took = (a, b) => b ? Math.round(b - a) + ' s' : '';


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

const MORE = 5;
const state = {data: null, openPlans: new Set(), openRuns: new Set(), older: new Set(), seen: new Set(), extra: {}, steps: {}};

function pill(s) {
  const cls = s === 'passed' ? '' : s === 'running' ? ' a-pill--running' : ' a-pill--critical';
  return `<span class="a-pill${cls}">${esc(s)}</span>`;
}
const bar = r => r ? `<button class="bar bar--${r.status === 'passed' ? 'passed' : r.status === 'running' ? 'running' : 'failed'}" type="button" data-bar="${r.id}" title="Run #${r.id}: ${esc(r.status)}, ${time(r.started)}" aria-label="Run #${r.id}: ${esc(r.status)}"></button>` : '<span class="bar bar--none" aria-hidden="true"></span>';
function bars(p) {
  const runs = p.runs.slice(0, 10).reverse();
  if (!runs.length) return '<span class="bars"><span class="bar bar--none"></span></span>';
  return `<span class="bars">${runs.map(bar).join('')}</span>`;
}
function last(p) {
  const r = p.last;
  if (!r) return '<span class="plan-meta">No run yet</span>';
  if (r.status === 'running') return `${pill('running')} <span class="plan-meta">Running… step ${r.step || 1} of ${p.steps}</span>`;
  return `${pill(r.status)} <span class="plan-meta">${time(r.started)}${r.failed_step ? ' · failed: ' + esc(r.failed_step) : ''}</span>`;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function cron(text) {  // "30 2 * * * UTC" -> "daily 02:30 UTC"; anything else is shown as written
  const m = /^(\d+) (\d+) \* \* (\*|\d) UTC$/.exec(text || '');
  if (!m) return text || '';
  const at = m[2].padStart(2, '0') + ':' + m[1].padStart(2, '0') + ' UTC';
  return m[3] === '*' ? 'daily ' + at : 'weekly ' + DAYS[+m[3] % 7] + ' ' + at;
}
function schedule(p, managed) {
  if (managed) return `<span class="plan-meta">${esc(cron(p.schedule) || 'No schedule')}</span><div class="plan-meta">Change in Studio, Actions</div>`;
  return `<span class="plan-meta">${esc(cron(p.schedule) || 'Run now only')}</span>`;
}
function runRow(p, r) {
  const open = state.openRuns.has(r.id);
  const steps = state.steps[r.id];
  const body = !open ? '' : !steps ? '<p class="plan-meta">Loading…</p>' :
    (steps.error ? `<p class="step-error">${esc(steps.error)}</p>` : '') + steps.steps.map(s => `<div class="step"><div class="step-line">${pill(s.status)} <strong>${esc(s.name)}</strong> <span class="plan-meta">${s.seconds} s</span></div>
      ${s.problem ? `<div class="step-error">${esc(s.problem)}</div>` : ''}${s.output ? `<details><summary class="plan-meta">Output</summary><pre class="log a-card">${esc(s.output)}</pre></details>` : ''}</div>`).join('');
  return `<div class="run${open ? ' is-open' : ''}${r.status === 'passed' || r.status === 'running' ? '' : ' is-failed'}" id="run-${r.id}">
    <button class="run-head" type="button" data-run-open="${r.id}" aria-expanded="${open}">${pill(r.status)} <strong>#${r.id}</strong> <span>${time(r.started)}</span> <span class="plan-meta">${took(r.started, r.finished)}${r.trigger ? ' · ' + esc(r.trigger) : ''}${r.failed_step ? ' · failed: ' + esc(r.failed_step) : ''}</span></button>
    <div class="run-steps">${body}</div></div>`;
}
function planRow(p, s) {
  const open = state.openPlans.has(p.name);
  const all = state.extra[p.name] || p.runs;
  const shown = state.older.has(p.name) ? all : all.slice(0, MORE);
  const canMore = !state.older.has(p.name) && (all.length > MORE || p.runs.length >= 10);
  const busy = s.running ? ' disabled' : '';
  const runBtn = p.problem ? `<span class="plan-meta">${esc(p.problem)}</span>` : `<button class="a-btn" type="button" data-run="${esc(p.name)}"${busy}>Run now</button>`;
  return `<li class="plan${open ? ' is-open' : ''}" id="plan-${esc(p.name)}">
    <div class="plan-row"><div><button class="plan-name" type="button" data-plan="${esc(p.name)}" aria-expanded="${open}">${esc(p.title)}</button><div class="plan-meta">${esc(p.target || '-')}</div></div>
      <div class="hide-narrow">${schedule(p, s.managed)}</div><div class="hide-narrow">${bars(p)}</div><div class="hide-narrow">${last(p)}</div><div>${runBtn}</div></div>
    <div class="plan-body"><div class="only-narrow plan-meta">${schedule(p, s.managed)}<div>${bars(p)}</div><div>${last(p)}</div></div>
      ${open ? shown.map(r => runRow(p, r)).join('') || '<div class="a-empty">No runs yet.</div>' : ''}
      ${open && canMore ? `<button class="a-btn more" type="button" data-older="${esc(p.name)}">Show older runs</button>` : ''}</div></li>`;
}
function render() {
  const s = state.data;
  $('mode').innerHTML = s.managed ? '<strong>Schedules live in Automaton.</strong> Change, pause or run them in Studio, Gauntlet, Actions.' :
    '<strong>Gauntlet runs on its own.</strong> It has no clock here: start plans with Run now or from your own scheduler.';
  $('machines').innerHTML = s.targets.length ? s.targets.map(t => `<span class="chip">${esc(t.name)}${t.disposable ? ' <small>disposable</small>' : ''}</span>`).join('') : '';
  $('plans').innerHTML = s.plans.map(p => planRow(p, s)).join('');
  $('setup').textContent = (s.targets.length ? '' : 'No machines are set up: add TARGETS in the app settings. ') +
    (s.github ? '' : 'Failures are emailed; set GITHUB_TOKEN and ISSUE_REPOS to get an issue as well. ') + (s.claude ? 'Claude Code diagnoses failures.' : '');
}
async function loadSteps(id) {
  try { state.steps[id] = await api('GET', '/api/runs/' + id); } catch (error) { fail(error); }
  render();
}
async function load() {
  try {
    const data = await api('GET', '/api/state');
    $('message').hidden = true;
    state.data = data;
    for (const p of data.plans) {  // first sight: only a plan whose last run failed opens, with that run
      if (state.seen.has(p.name)) continue;
      state.seen.add(p.name);
      if (p.last && p.last.status !== 'passed' && p.last.status !== 'running') { state.openPlans.add(p.name); state.openRuns.add(p.last.id); }
    }
    for (const id of state.openRuns) if (!state.steps[id] || [...data.plans].some(p => p.last && p.last.id === id && p.last.status === 'running')) state.steps[id] = await api('GET', '/api/runs/' + id).catch(() => state.steps[id]);
    render();
  } catch (error) { fail(error); }
}
document.addEventListener('click', async event => {
  const t = event.target, pick = k => t.closest('[' + k + ']');
  try {
    if (pick('data-run')) { await api('POST', '/api/runs', {plan: pick('data-run').dataset.run}); await load(); }
    else if (pick('data-plan')) { const n = pick('data-plan').dataset.plan; state.openPlans.has(n) ? state.openPlans.delete(n) : state.openPlans.add(n); render(); }
    else if (pick('data-run-open')) { const id = +pick('data-run-open').dataset.runOpen; if (state.openRuns.has(id)) { state.openRuns.delete(id); render(); } else { state.openRuns.add(id); render(); await loadSteps(id); } }
    else if (pick('data-bar')) {
      const id = +pick('data-bar').dataset.bar, plan = state.data.plans.find(p => p.runs.some(r => r.id === id));
      state.openPlans.add(plan.name); state.openRuns.add(id); render(); await loadSteps(id);
      const el = document.getElementById('run-' + id); if (el) el.scrollIntoView({block: 'nearest'});
    }
    else if (pick('data-older')) {
      const n = pick('data-older').dataset.older;
      state.extra[n] = await api('GET', '/api/runs?plan=' + encodeURIComponent(n)); state.older.add(n); render();
    }
  } catch (error) { fail(error); }
});
load();
setInterval(load, 15000);
