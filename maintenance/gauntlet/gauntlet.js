const $ = id => document.getElementById(id);
const esc = AutomatonUI.escapeHtml;
let token = sessionStorage.getItem('gauntlet-token') || '';
const time = t => t ? new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';


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

const PILL = {passed: ['p-ok', 'passed'], running: ['p-run', 'running']};
const pill = (s, word) => `<span class="pill ${(PILL[s] || ['p-bad'])[0]}">${esc(word || s)}</span>`;
const stepPill = s => pill(s, s === 'passed' ? 'ok' : s);
const mins = sec => sec < 90 ? Math.round(sec) + ' s' : Math.round(sec / 60) + ' min';
const dur = (a, b) => b ? mins(b - a) : '';
const cls = r => r.status === 'passed' ? 'o' : r.status === 'running' ? 'r' : 'x';
function bars(p) {
  const runs = p.runs.slice(0, 10).reverse();
  const none = Array.from({length: 10 - runs.length}, () => '<i></i>').join('');
  return `<div class="hist" title="Last 10 runs, newest right">${none}${runs.map(r => `<button class="bar ${cls(r)}" type="button" data-bar="${r.id}" title="Run #${r.id}: ${esc(r.status)}, ${time(r.started)}" aria-label="Run #${r.id}: ${esc(r.status)}"></button>`).join('')}</div>`;
}
function last(p) {
  const r = p.last;
  if (!r) return '<span class="lr">' + pill('none', 'no run yet').replace('p-bad', 'p-wait') + '</span>';
  if (r.status === 'running') return `<span class="lr">${pill('running')}<small>step ${r.step || 1} of ${p.steps}</small></span>`;
  const issue = r.issue ? ` · <a href="${esc(r.issue.url)}" rel="noopener" target="_blank">issue #${+r.issue.number}</a>` : '';
  const why = r.status === 'passed' ? time(r.started) : (r.failed_step ? esc(r.failed_step) : time(r.started));
  return `<span class="lr">${pill(r.status)}<small>${why}${issue}</small></span>`;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function cron(text) {  // "30 2 * * * UTC" -> "Daily 02:30 UTC", "0 5 * * 0 UTC" -> "Sun 05:00 UTC"; anything else is shown as written
  const m = /^(\d+) (\d+) \* \* (\*|\d) UTC$/.exec(text || '');
  if (!m) return text || '';
  const at = m[2].padStart(2, '0') + ':' + m[1].padStart(2, '0') + ' UTC';
  return m[3] === '*' ? 'Daily ' + at : DAYS[+m[3] % 7] + ' ' + at;
}
function schedule(p, managed) {
  const when = cron(p.schedule);
  if (managed) return `<span class="sched"><span class="${when ? '' : 'muted'}">${esc(when || 'No schedule')}</span><small class="studio">Change in Studio ↗</small></span>`;
  return `<span class="sched"><span class="${when ? '' : 'muted'}">${esc(when || 'Manual only')}</span><small>from the plan file</small></span>`;
}
function runRow(p, r) {
  const open = state.openRuns.has(r.id);
  const steps = state.steps[r.id];
  const drill = steps && r.plan === 'restore-drill' ? (steps.steps.map(x => /^RESTORE DRILL:.*$/m.exec(x.output || '')).find(Boolean) || [])[0] : '';
  const meta = [r.status === 'passed' && steps ? steps.steps.length + ' steps passed' : '', r.trigger ? 'started by ' + esc(r.trigger) : ''].filter(Boolean).join(' · ');
  const body = !open ? '' : !steps ? '<p class="muted meta">Loading…</p>' :
    (steps.error ? `<p class="meta"><b>${esc(steps.error)}</b></p>` : '') + (drill ? `<p class="muted meta">${esc(drill)}</p>` : '') + (meta ? `<p class="muted meta">${meta}</p>` : '') +
    `<div class="steps">${steps.steps.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(s.name)}${s.problem ? `<pre>${esc(s.problem)}</pre>` : ''}${s.output ? `<details><summary class="muted">Output</summary><pre>${esc(s.output)}</pre></details>` : ''}</span>${stepPill(s.status)}<span class="mono muted">${mins(s.seconds)}</span></div>`).join('')}</div>`;
  return `<details class="run" id="run-${r.id}" data-run-id="${r.id}"${open ? ' open' : ''}><summary><span class="mono">#${r.id}</span>${pill(r.status)}<span class="muted">${time(r.started)} · ${esc(r.target || '-')}</span><span class="mono muted">${dur(r.started, r.finished)}</span></summary>${body}</details>`;
}
function planRow(p, s) {
  const open = state.openPlans.has(p.name);
  const all = state.extra[p.name] || p.runs;
  const shown = state.older.has(p.name) ? all : all.slice(0, MORE);
  const canMore = !state.older.has(p.name) && (all.length > MORE || p.runs.length >= 10);
  const running = p.last && p.last.status === 'running';
  const runBtn = p.problem ? `<span class="muted" title="${esc(p.problem)}">Can't run</span>` :
    `<button class="btn" type="button" data-run="${esc(p.name)}"${s.running ? ' disabled' : ''}>${running ? 'Running…' : 'Run now'}</button>`;
  const narrow = `<div class="only-narrow">${schedule(p, s.managed)}${bars(p)}${last(p)}${p.problem ? `<span class="muted">${esc(p.problem)}</span>` : ''}</div>`;
  return `<details class="plan" id="plan-${esc(p.name)}" data-plan="${esc(p.name)}"${open ? ' open' : ''}><summary><span class="chev" aria-hidden="true"></span><span class="pn"><b>${esc(p.title)}</b><small>${esc(p.target || '-')}</small></span>${schedule(p, s.managed)}${bars(p)}${last(p)}${runBtn}</summary>
    <div class="planruns">${narrow}${open ? shown.map(r => runRow(p, r)).join('') || '<p class="muted more-t">No runs yet.</p>' : ''}${open && canMore ? `<button class="btn more" type="button" data-older="${esc(p.name)}">Show older runs</button>` : ''}</div></details>`;
}
function render() {
  const s = state.data;
  $('mode').innerHTML = s.managed ? '<b>Schedules live in Automaton.</b> Each plan is an Action of this app; change, pause or run it in Studio → Gauntlet → Actions. Run now here starts the same Action.' :
    '<b>Standalone.</b> No Automaton here, so Gauntlet keeps its own clock. Schedules come from each plan\'s <span class="mono">schedule</span> field.';
  $('machines').innerHTML = s.targets.length ? '<span class="muted">Machines</span>' + s.targets.map(t => `<span class="chip"><b>${esc(t.name)}</b>${t.reachable === null || t.reachable === undefined ? '' : pill(t.reachable ? 'passed' : 'failed', t.reachable ? 'reachable' : 'unreachable')}${t.disposable ? '<span class="muted">disposable</span>' : ''}</span>`).join('') : '';
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
    for (const n of Object.keys(state.extra)) state.extra[n] = await api('GET', '/api/runs?plan=' + encodeURIComponent(n)).catch(() => state.extra[n]);
    render();
  } catch (error) { fail(error); }
}
document.addEventListener('toggle', event => {  // details toggles do not bubble: capture them to remember what is open
  const d = event.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  const set = d.dataset.plan ? state.openPlans : d.dataset.runId ? state.openRuns : null;
  if (!set) return;
  const key = d.dataset.plan || +d.dataset.runId;
  if (d.open === set.has(key)) return;
  d.open ? set.add(key) : set.delete(key);
  if (d.open && d.dataset.runId && !state.steps[key]) { render(); loadSteps(key); } else render();
}, true);
document.addEventListener('click', async event => {
  const t = event.target, pick = k => t.closest('[' + k + ']');
  try {
    if (pick('data-run')) { event.preventDefault(); await api('POST', '/api/runs', {plan: pick('data-run').dataset.run}); await load(); }
    else if (pick('data-bar')) {
      event.preventDefault();
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
