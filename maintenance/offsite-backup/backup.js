(function () {
  var ui = window.AutomatonUI;
  var card = document.getElementById('card');
  var busy = false;
  var notice = '';

  function when(value) {
    return value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never';
  }

  function render(body) {
    var data = body.data;
    var html = '<div class="a-card__head"><h2 class="a-card__title">Newest server backup</h2></div>';
    if (body.status !== 'ok' || !data) {
      html += '<div class="a-waiting"><p>' + ui.escapeHtml(body.message || 'The backups could not be read.') + '</p>' +
        '<p>An administrator approves backups:read and backups:run on this app\'s page in Studio.</p></div>';
    } else {
      html += '<dl class="a-kv"><dt>Last backup</dt><dd>' + ui.escapeHtml(when(data.lastSuccessAt)) + '</dd>' +
        '<dt>Newest copy</dt><dd>' + (data.newest ? ui.escapeHtml(data.newest.name) + ', ' + ui.escapeHtml(ui.formatBytes(data.newest.sizeBytes || 0)) : 'none yet') + '</dd>' +
        '<dt>Kept on the server</dt><dd>' + data.count + '</dd></dl>';
      if (data.lastError) html += '<p class="a-note a-note--warning">' + ui.escapeHtml(data.lastError) + '</p>';
    }
    if (notice) html += '<p class="a-note" role="status">' + ui.escapeHtml(notice) + '</p>';
    if (body.administrator) {
      html += '<div class="a-card__foot"><button class="a-btn a-btn--primary" type="button" id="run"' + (busy ? ' disabled' : '') + '>Back up now and send off-site</button></div>';
    } else {
      html += '<p class="a-hint">Only a system administrator can start a backup.</p>';
    }
    card.innerHTML = html;
    var button = document.getElementById('run');
    if (button) button.addEventListener('click', start);
  }

  function load() {
    return fetch('api/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(render)
      .catch(function () { card.innerHTML = '<p class="a-note a-note--critical">The page could not reach the app.</p>'; });
  }

  function start() {
    busy = true;
    notice = '';
    fetch('api/backup', { method: 'POST', headers: { 'X-Offsite-Backup': '1' } })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        notice = body.status === 'ok'
          ? 'Backup requested. The new copy appears here in a few minutes and is uploaded within 15 minutes.'
          : (body.message || 'The backup could not be started.');
      })
      .catch(function () { notice = 'The backup could not be started.'; })
      .then(function () { busy = false; return load(); });
  }

  ui.bindThemeToggle();
  load();
  setInterval(load, 60000);
})();
