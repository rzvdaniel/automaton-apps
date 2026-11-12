/* Server Console page. Built only from the Automaton app UI kit in ui/. */
(function () {
  "use strict";

  var UI = window.AutomatonUI;
  var esc = UI.escapeHtml;
  var view = document.getElementById("view");
  var overall = document.getElementById("overall");
  var subtitle = document.getElementById("subtitle");
  var LABELS = { ok: "OK", warning: "Warning", critical: "Action needed", unknown: "No data" };


  function pill(status, text) {
    var cls = status === "ok" || status === "warning" || status === "critical" ? " a-pill--" + status : "";
    return '<span class="a-pill' + cls + '">' + esc(text || LABELS[status] || LABELS.unknown) + "</span>";
  }

  function card(title, status, body, foot) {
    return '<section class="a-card" id="' + esc(title.toLowerCase()) + '"><div class="a-card__head"><h2 class="a-card__title">' + esc(title) + "</h2>" + pill(status) + "</div>" +
      body + (foot ? '<p class="a-card__foot">' + foot + "</p>" : "") + "</section>";
  }

  function stat(label, value, hint, status) {
    return '<div class="a-stat' + (status === "warning" || status === "critical" || status === "ok" ? " a-stat--" + status : "") + '"><div class="a-stat__label">' +
      esc(label) + '</div><div class="a-stat__value">' + value + "</div>" + (hint ? '<div class="a-stat__hint">' + hint + "</div>" : "") + "</div>";
  }

  function num(value, unit) {
    return typeof value === "number" ? esc(String(value)) + (unit ? " <small>" + unit + "</small>" : "") : "-";
  }

  // Binary units, labelled as such (the UI kit's formatBytes says GB for 1024-based sizes).
  function bytes(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0) return "-";
    var units = ["B", "KiB", "MiB", "GiB", "TiB"], i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return (i === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) + " " + units[i];
  }

  function plural(count, word) { return count + " " + word + (count === 1 ? "" : "s"); }

  // "less than a minute ago", "1 hour ago", "5 minutes ago", "3 days ago".
  function ago(seconds) {
    if (typeof seconds !== "number" || seconds < 0) return "";
    if (seconds < 90) return "less than a minute ago";
    if (seconds < 3570) return plural(Math.round(seconds / 60), "minute") + " ago";
    if (seconds < 48 * 3600) return plural(Math.round(seconds / 3600), "hour") + " ago";
    return plural(Math.round(seconds / 86400), "day") + " ago";
  }

  function pct(value) { return typeof value === "number" ? Math.round(value * 10) / 10 : null; }

  function metric(name, value, status, history, key, mark) {
    var shown = pct(value);
    var series = history.map(function (item) { return item[key]; });
    var cls = (status === "warning" || status === "critical" ? " a-meter--" + status : "") + (mark ? " limit" : "");
    return '<div class="a-metric"><div class="a-metric__row"><span class="a-metric__name">' + esc(name) + '</span><span class="a-metric__value">' +
      (shown === null ? "-" : shown + "%") + '</span></div><div class="a-meter' + cls + '" style="--value:' + (shown === null ? 0 : Math.min(100, shown)) +
      "%" + (mark ? ";--mark:" + mark + "%" : "") + '"><span></span></div><div class="a-metric__spark">' +
      UI.sparkline(series, key === "cpu" ? { min: 0, max: 100, status: status, label: name + ", last 24 hours" } : { status: status, label: name + ", last 24 hours" }) + "</div></div>";
  }

  function when(iso) { return iso ? '<time datetime="' + esc(iso) + '" data-rel></time>' : "never"; }

  function serverCard(h, a) {
    var s = h.server || {};
    var host = h.host || {};
    var update = s.updateAvailable === true ? pill("warning", "Update available") : s.updateAvailable === false ? pill("ok", "Up to date") : pill("unknown", "Unknown");
    var body = '<dl class="a-kv"><dt>Automaton</dt><dd class="a-mono">' + esc(s.version || "-") + (s.updateAvailable === false ? " (latest)" : "") + "</dd>" +
      (s.updateAvailable === true ? '<dt>Latest release</dt><dd class="a-mono">' + esc(s.latestVersion || "unknown") + "</dd>" : "") +
      "<dt>Operating system</dt><dd>" + esc(host.osName || "-") + "</dd><dt>Up for</dt><dd>" +
      (typeof host.uptimeSeconds === "number" ? esc(UI.formatDuration(host.uptimeSeconds)) : "-") + "</dd></dl>";
    return card("Server", a.server, body).replace(pill(a.server), update);
  }

  function runnersCard(h, a, now) {
    var runners = h.runners || [];
    var body = runners.length ? '<ul class="a-list">' + runners.map(function (r) {
      var online = String(r.status || "").toLowerCase() === "online";
      var status = !online ? pill("critical", r.status || "offline") : r.upgradeAvailable ? pill("warning", "Upgrade available") : pill("ok", "Up to date");
      var seen = r.lastHeartbeatAtUtc ? ago(now - Date.parse(r.lastHeartbeatAtUtc) / 1000) : "";
      return "<li><span>" + esc(r.name) + '<br><span class="a-hint a-mono">' + esc(r.version || "-") + "</span>" +
        (seen ? '<br><span class="a-hint">reported ' + esc(seen) + "</span>" : "") + "</span>" + status + "</li>";
    }).join("") + "</ul>" : '<div class="a-empty"><div class="a-empty__title">No Runners</div>No Machine Management Runner is registered.</div>';
    return card("Runners", a.runners, body);
  }

  function updatesCard(h, a, data) {
    var host = h.host || {};
    var restart = host.rebootRequired === true && host.rebootRequiredSinceUtc ? Math.floor((Date.now() - Date.parse(host.rebootRequiredSinceUtc)) / 86400000) : null;
    var security = host.securityUpdates;
    var other = typeof host.updatesPending === "number" ? Math.max(0, host.updatesPending - (typeof security === "number" ? security : 0)) : null;
    var tiles = (host.rebootRequired === true ? stat("Restart needed for", restart === null ? "yes" : num(restart, restart === 1 ? "day" : "days"), "warning after " + esc(String(data.settings.rebootDays)), a.reboot) :
      stat("Restart", host.rebootRequired === false ? "not needed" : "-", "", a.reboot)) +
      stat("Security updates", num(security), a.securityDays !== null && a.securityDays !== undefined ? "waiting " + esc(String(a.securityDays)) + " days" : "", a.security) +
      stat("Other updates", num(other), other ? "no rush" : "", a.pending);
    var foot = host.updatesPending === null || host.updatesPending === undefined ? "Update counts need Ubuntu's update notifier on the server." : "";
    return card("Updates", a.updates, '<div class="a-stats">' + tiles + "</div>", foot);
  }

  function resourcesCard(h, a, history, data) {
    var host = h.host || {};
    var memoryUsed = typeof host.memoryTotalBytes === "number" && host.memoryTotalBytes > 0 ? 100 - 100 * host.memoryAvailableBytes / host.memoryTotalBytes : null;
    var diskUsed = typeof host.diskTotalBytes === "number" && host.diskTotalBytes > 0 ? 100 - 100 * host.diskAvailableBytes / host.diskTotalBytes : null;
    var warnAt = 100 - data.settings.diskFreePercent;
    var rc = data.reclaim || {};
    var load = typeof host.load1 === "number" ? [host.load1, host.load5, host.load15].map(function (v) { return v.toFixed(2); }).join(" \u00b7 ") : "-";
    var cores = host.cpuCount ? " \u00b7 " + plural(host.cpuCount, "core") : "";
    var diskName = "Disk" + (typeof host.diskAvailableBytes === "number" && typeof host.diskTotalBytes === "number" ? " \u00b7 " + bytes(host.diskAvailableBytes) + " free of " + bytes(host.diskTotalBytes) : "");
    var docker = rc.total ? '<dl class="a-kv" style="margin-top:10px"><dt>Docker images</dt><dd>' + esc(bytes(rc.images)) + "</dd><dt>Docker build cache</dt><dd>" + esc(bytes(rc.buildCache)) +
      "</dd><dt>Docker volumes</dt><dd>" + esc(bytes(rc.volumes)) + "</dd><dt>Can be freed</dt><dd><strong>up to " + esc(bytes(rc.freeable)) + "</strong> images and cache</dd></dl>" +
      '<div class="a-note">Automaton frees unused images every night. To free them now: <code class="a-mono">docker image prune -a</code></div>' : "";
    var body = metric("CPU" + cores, host.cpuPercent, a.cpu, history, "cpu") +
      '<div class="a-hint" style="margin:-6px 0 8px">Load ' + esc(load) + " (1, 5, 15 min)</div>" +
      metric("Memory" + (typeof host.memoryTotalBytes === "number" ? " \u00b7 " + bytes(host.memoryTotalBytes) : ""), memoryUsed, a.memory, history, "mem") +
      metric(diskName, diskUsed, a.disk, history, "disk", warnAt) +
      '<div class="a-hint">The mark is the ' + esc(String(warnAt)) + "% warning; past it, administrators get an email.</div>" + docker;
    var stale = a.freshness === "warning" ? '<p class="a-note a-note--warning">The Runner has not reported for a while; these figures are old.</p>' : "";
    var measured = ago(h.hostAgeSeconds);
    var foot = (measured ? "Measured by the Runner " + measured + ". " : "") + "History: the last 24 hours.";
    return card("Resources", a.resources, body + stale, foot);
  }

  function backupsCard(h, a) {
    var b = h.backup || {};
    var body;
    if (!b.available) {
      body = '<div class="a-empty"><div class="a-empty__title">No backup status</div>Run the latest server update to enable nightly backups.</div>';
    } else {
      var hours = b.lastSuccessAgeHours;
      var age = typeof hours !== "number" ? "-" : hours < 0.99 ? num(Math.max(1, Math.round(hours * 60)), Math.round(hours * 60) === 1 ? "minute" : "minutes") : hours < 48 ? num(Math.round(hours), Math.round(hours) === 1 ? "hour" : "hours") : num(Math.round(hours / 24), "days");
      body = '<div class="a-stats">' + stat("Last successful backup", b.lastSuccessAt ? age + " <small>ago</small>" : "never", "", a.backup) + "</div>" +
        (b.lastError ? '<p class="a-note a-note--critical">' + esc(b.lastError) + "</p>" : "");
    }
    return card("Backups", a.backup, body);
  }

  function certificatesCard(h, a) {
    var certs = h.certificates || [];
    var body = certs.length ? '<ul class="a-list">' + certs.map(function (c) {
      var status = c.daysRemaining === null || c.daysRemaining === undefined ? "critical" : c.daysRemaining <= 7 ? "critical" : c.daysRemaining <= 14 ? "warning" : "ok";
      var text = c.daysRemaining === null || c.daysRemaining === undefined ? "Unreadable" : c.daysRemaining + (c.daysRemaining === 1 ? " day" : " days");
      return '<li><span class="a-mono">' + esc(c.host) + "</span>" + pill(status, text) + "</li>";
    }).join("") + "</ul>" : '<div class="a-empty"><div class="a-empty__title">No certificates</div>The server is not using HTTPS host names.</div>';
    return card("Certificates", a.certificates, body, "Days until the certificate of each public host name expires.");
  }

  function banner(data) {
    var stale = data.status === "error" ? '<div class="a-note a-note--warning" style="margin-bottom:16px">The last check failed (' + esc(data.message || "unknown error") + "), so these figures are from the last good check.</div>" : "";
    var items = data.attention || [];
    if (!items.length) return stale;
    var worst = items.some(function (i) { return i.level === "critical"; }) ? "critical" : "warning";
    return stale + '<section class="a-banner a-banner--' + worst + '" aria-label="Needs attention"><div class="a-banner__title">Needs you</div><ul>' + items.map(function (i) {
      return "<li><strong>" + esc(i.title) + "</strong> " + esc(i.detail || "") + (i.command ? ' <code class="a-mono">' + esc(i.command) + "</code>" : "") + "</li>";
    }).join("") + "</ul></section>";
  }

  function tile(href, name, status, text) {
    return '<a href="#' + href + '" class="tile"><span>' + esc(name) + "</span>" + pill(status, text) + "</a>";
  }

  function summary(h, a, data) {
    var host = h.host || {};
    var s = h.server || {};
    var security = host.securityUpdates;
    var updates = host.rebootRequired === true ? "restart" + (security > 0 ? " \u00b7 " + security + " security" : "") : security > 0 ? security + " security" : "up to date";
    var diskUsed = typeof host.diskTotalBytes === "number" && host.diskTotalBytes > 0 ? Math.round(100 - 100 * host.diskAvailableBytes / host.diskTotalBytes) + "% disk" : "";
    var b = h.backup || {};
    var certs = (h.certificates || []).map(function (c) { return c.daysRemaining; }).filter(function (d) { return typeof d === "number"; });
    var runners = h.runners || [];
    var stale = runners.some(function (r) { return r.upgradeAvailable; });
    return '<section class="summary" aria-label="Summary">' +
      tile("server", "Server", a.server, s.updateAvailable === true ? "update available" : "up to date") +
      tile("updates", "Updates", a.updates, updates) +
      tile("resources", "Resources", a.resources, diskUsed || undefined) +
      tile("backups", "Backups", a.backup, b.available && typeof b.lastSuccessAgeHours === "number" ? ago(b.lastSuccessAgeHours * 3600).replace("less than a minute ago", "just now") : undefined) +
      tile("certificates", "Certificates", a.certificates, certs.length ? plural(Math.min.apply(null, certs), "day") : undefined) +
      tile("runners", "Runners", a.runners, runners.length ? (stale ? "upgrade available" : "up to date") : undefined) + "</section>";
  }

  function dashboard(data) {
    var h = data.health, a = data.assessment;
    var history = data.history || [];
    view.innerHTML = banner(data) + summary(h, a, data) + '<div class="a-columns">' + resourcesCard(h, a, history, data) + updatesCard(h, a, data) + serverCard(h, a) +
      backupsCard(h, a) + certificatesCard(h, a) + runnersCard(h, a, data.now) + "</div>";
    overall.hidden = false;
    var count = (data.attention || []).length;
    overall.className = "a-pill a-pill--large" + (a.overall !== "unknown" ? " a-pill--" + a.overall : "");
    overall.textContent = a.overall === "ok" ? "All good" : count ? (count === 1 ? "1 thing needs you" : count + " things need you") : a.overall === "warning" ? "Needs attention" : a.overall === "critical" ? "Action needed" : "No data";
    subtitle.innerHTML = "Checked " + (data.fetchedAt ? '<time datetime="' + new Date(data.fetchedAt * 1000).toISOString() + '" data-rel></time>' : "never");
    UI.updateRelativeTimes(document);
  }

  function waiting(title, lead, steps) {
    overall.hidden = true;
    view.innerHTML = '<section class="a-waiting"><h2 class="a-waiting__title">' + esc(title) + "</h2><p>" + lead + '</p><ol class="a-steps">' +
      steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol></section>";
  }

  function needApproval(status) {
    var revoked = status === "not_approved";
    waiting("Waiting for approval",
      revoked ? "The server refused this app's key. An administrator has not approved the <strong>server:read</strong> permission yet, or it was revoked."
        : "Server Console has no <strong>server:read</strong> key yet. An administrator of your Automaton server must approve it before any figures appear.",
      ["Sign in to Studio as a system administrator.", "Open <strong>Admin</strong>, then <strong>Apps</strong> (filter <em>Waiting for approval</em>) and choose <strong>Review</strong> next to Server Console.",
        "On the <strong>Permissions</strong> tab, select <strong>Approve</strong> for <span class=\"a-mono\">server:read</span>. The app restarts by itself and this page fills in within a few minutes.",
        "App owners can see the same state with <span class=\"a-mono\">automaton permissions status</span>."]);
    subtitle.textContent = "Permission not approved yet";
  }

  function problem(data) {
    var message = data.status === "not_configured" ? "This app does not know the server's address. Update Automaton so it provides one, or set the <span class=\"a-mono\">API_BASE_URL</span> setting, then restart the app."
      : data.status === "unavailable" ? "This server does not offer server health yet. Update Automaton, then reload."
      : data.status === "starting" ? "The first check is still running. This page refreshes by itself."
      : "The server could not be read right now: " + esc(data.message || "unknown error") + ".";
    overall.hidden = true;
    view.innerHTML = '<div class="a-empty"><div class="a-empty__title">No figures yet</div><p>' + message + "</p></div>";
    subtitle.textContent = data.status === "starting" ? "Starting" : "No data";
  }

  function load() {
    fetch("api/state", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status === "no_key" || data.status === "not_approved") return needApproval(data.status);
        if (!data.health) return problem(data);
        dashboard(data);
      });
    }).catch(function () {
      view.innerHTML = '<div class="a-empty"><div class="a-empty__title">Cannot reach the app</div>Retrying shortly.</div>';
    });
  }

  UI.bindThemeToggle();
  load();
  setInterval(load, 30000);
  setInterval(function () { UI.updateRelativeTimes(document); }, 30000);
})();
