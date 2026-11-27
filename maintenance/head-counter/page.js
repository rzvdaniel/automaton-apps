const $ = id => document.getElementById(id);

async function api(path, method = 'GET', body = null, retry = true) {
  const headers = { 'X-Head-Counter': '1', 'Content-Type': 'application/json' };
  const saved = sessionStorage.getItem('head-counter-admin');
  if (saved) headers.Authorization = 'Bearer ' + saved;
  const response = await fetch(path, { method, headers, body: body && JSON.stringify(body) });
  if (response.status === 401 && saved) sessionStorage.removeItem('head-counter-admin');
  if (response.status === 401 && retry && (await response.clone().json()).mode === 'token') {
    const entered = prompt('Admin token (ADMIN_TOKEN)');
    if (entered) {
      sessionStorage.setItem('head-counter-admin', entered.trim());
      return api(path, method, body, false);
    }
  }
  if (!response.ok) throw new Error((await response.json()).error || 'Request failed');
  return response.json();
}

function rows(id, values) {
  const table = $(id);
  table.replaceChildren();
  for (const valuesOfRow of values) {
    const row = table.insertRow();
    for (const value of valuesOfRow) row.insertCell().textContent = value;
  }
}

async function refresh() {
  try {
    const data = await api('/api/summary');
    $('installs').textContent = data.week?.installs ?? '—';
    $('updates').textContent = data.week?.updates ?? '—';
    $('total').textContent = data.since_start?.installs ?? '—';
    $('window').textContent = data.week
      ? `Observed from ${data.week.from} to ${data.week.to} (UTC); snapshot refreshed hourly.`
      : 'Waiting for the first snapshot.';
    rows('weekly', (data.week?.releases || []).map(r => [r.version, r.installs, r.updates]));
    rows('github', data.github.map(r => [r.version, r.install, r.bundle, r.others_install, r.others_updates]));
    rows('ours', data.ours.map(r => [r.at, r.version, r.file, r.source]));
    const previous = $('version').value;
    $('version').replaceChildren(...data.github.map(r => new Option(r.version, r.version)));
    if (data.github.some(r => r.version === previous)) $('version').value = previous;
    $('message').textContent = data.error || '';
    $('message').hidden = !data.error;
  } catch (error) {
    $('message').textContent = error.message;
    $('message').hidden = false;
  }
}

$('manual').onsubmit = async event => {
  event.preventDefault();
  try {
    await api('/api/manual', 'POST', { version: $('version').value, file: $('file').value });
    await refresh();
  } catch (error) {
    $('message').textContent = error.message;
    $('message').hidden = false;
  }
};
AutomatonUI.bindThemeToggle();
refresh();
setInterval(refresh, 30000);
