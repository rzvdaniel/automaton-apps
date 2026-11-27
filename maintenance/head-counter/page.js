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

let releases = [];

function rows(id, values) {
  const table = $(id);
  table.replaceChildren();
  for (const valuesOfRow of values) {
    const row = table.insertRow();
    for (const value of valuesOfRow) row.insertCell().textContent = value;
  }
}

function updateFiles() {
  const previous = $('file').value;
  const release = releases.find(r => r.version === $('version').value);
  const files = new Set(['install-automaton.sh', 'install.sh', 'automaton-server.tar.gz']);
  for (const file of release?.files || []) files.add(file.file);
  $('file').replaceChildren(...Array.from(files, name => new Option(name, name)));
  if (files.has(previous)) $('file').value = previous;
}

async function refresh() {
  try {
    const data = await api('/api/summary');
    $('server').textContent = data.week?.server_installs ?? '—';
    $('cli').textContent = data.week?.cli_installs ?? '—';
    $('total').textContent = data.since_start?.server_installs ?? '—';
    $('window').textContent = data.week
      ? `${data.week.partial ? 'Partial week. ' : ''}Observed from ${data.week.from} to ${data.week.to} (UTC); snapshot refreshed hourly.`
      : (data.week_error || 'Waiting for the first snapshot.');
    rows('weekly', (data.week?.releases || []).map(r => [r.version, r.server_installs, r.cli_installs]));
    rows('github', data.github.map(r => [r.version, r.server_downloads, r.cli_downloads, r.others_server, r.others_cli]));
    rows('ours', data.ours.map(r => [r.at, r.version, r.file, r.source]));
    const previous = $('version').value;
    releases = data.github;
    $('version').replaceChildren(...releases.map(r => new Option(r.version, r.version)));
    if (data.github.some(r => r.version === previous)) $('version').value = previous;
    updateFiles();
    $('message').textContent = data.error || '';
    $('message').hidden = !data.error;
  } catch (error) {
    $('message').textContent = error.message;
    $('message').hidden = false;
  }
}

$('version').onchange = updateFiles;
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
