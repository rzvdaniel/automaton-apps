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
    var restart = host.rebootRequired === true && host.rebootRequiredSinceUtc ? Math.floor((data.now * 1000 - Date.parse(host.rebootRequiredSinceUtc)) / 86400000) : null;
    var security = host.securityUpdates;
    var other = typeof host.updatesPending === "number" ? Math.max(0, host.updatesPending - (typeof security === "number" ? security : 0)) : null;
    var tiles = (host.rebootRequired === true ? stat("Restart needed for", restart === null ? "yes" : num(restart, restart === 1 ? "day" : "days"), "warning after " + esc(String(data.settings.rebootDays)), a.reboot) :
      stat("Restart", host.rebootRequired === false ? "not needed" : "-", "", a.reboot)) +
      stat("Security updates", num(security), a.securityDays !== null && a.securityDays !== undefined ? "waiting " + esc(plural(a.securityDays, "day")) : "", a.security) +
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
    return stale + '<section class="a-banner a-banner--' + worst + '" aria-label="Needs attention"><div class="a-banner__title">Needs you <span class="a-hint">(' + items.length + ')</span></div><ul>' + items.map(function (i) {
      return "<li><strong>" + esc(i.title) + "</strong> " + esc(i.detail || "") + (i.command ? ' <code class="a-mono">' + esc(i.command) + "</code>" : "") +
        (i.card ? ' <a class="a-link" href="#' + esc(i.card) + '">' + esc(i.card.charAt(0).toUpperCase() + i.card.slice(1)) + "</a>" : "") + "</li>";
    }).join("") + "</ul></section>";
  }

  function tile(href, name, status, text) {
    return '<a href="#' + href + '" class="tile"><span>' + esc(name) + "</span>" + pill(status, text) + "</a>";
  }

  function summary(h, a, data) {
    var host = h.host || {};
    var s = h.server || {};
    var security = host.securityUpdates;
    var updates = host.rebootRequired === true ? "restart needed" : security > 0 ? security + " security" : "up to date";
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

  // --- Machine picker: one button per Runner; the choice is remembered in this browser. ------------------------------

  var picker = document.getElementById("machines");
  var chosen = null;
  var lastData = null; // the last /api/state answer
  try { chosen = window.localStorage.getItem("server-console-machine"); } catch (e) { /* storage blocked: the default machine */ }

  function paintPicker(data) {
    var list = data.machines || [];
    picker.hidden = list.length < 2;
    if (list.length < 2) return;
    picker.innerHTML = '<span class="picker__label" id="picker-label">Machine</span><div class="picker__list" role="group" aria-labelledby="picker-label">' + list.map(function (m) {
      var on = m.name === data.machine;
      var seen = !m.online && m.lastHeartbeatAtUtc ? ago(data.now - Date.parse(m.lastHeartbeatAtUtc) / 1000) : "";
      return '<button type="button" class="a-btn picker__item' + (on ? " is-on" : "") + '" aria-pressed="' + on + '" data-machine="' + esc(m.name) + '"><span>' + esc(m.name) + "</span>" +
        (m.online ? "" : '<span class="a-hint">offline' + (seen ? ", last reported " + esc(seen) : "") + "</span>") + "</button>";
    }).join("") + "</div>";
  }

  picker.addEventListener("click", function (event) {
    var button = event.target.closest("[data-machine]");
    if (!button) return;
    chosen = button.getAttribute("data-machine");
    try { window.localStorage.setItem("server-console-machine", chosen); } catch (e) { /* ignore */ }
    load();
  });

  function offlineCard(data) {
    var m = (data.machines || []).filter(function (item) { return item.name === data.machine; })[0] || {};
    var seen = m.lastHeartbeatAtUtc ? "last reported " + ago(data.now - Date.parse(m.lastHeartbeatAtUtc) / 1000) : "never reported";
    return card(data.machine, "critical", '<div class="a-empty"><div class="a-empty__title">Offline</div>' + esc(data.machine) + " is offline, " + esc(seen) +
      ". Its figures appear again when the Runner reports.</div>", "").replace(pill("critical"), pill("critical", "Offline"));
  }

  function dashboard(data) {
    var h = data.health, a = data.assessment;
    var history = data.history || [];
    var machine = (data.machines || []).filter(function (item) { return item.name === data.machine; })[0];
    var offline = machine && !machine.online;
    paintPicker(data);
    view.innerHTML = banner(data) + summary(h, a, data) + '<div class="cards">' + "<div class=\"col\">" + (offline ? offlineCard(data) : resourcesCard(h, a, history, data)) + "</div><div class=\"col\">" + (offline ? "" : updatesCard(h, a, data)) + serverCard(h, a) +
      "</div><div class=\"col\">" + certificatesCard(h, a) + runnersCard(h, a, data.now) + backupsCard(h, a) + "</div></div>";
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
    fetch("api/state" + (chosen ? "?machine=" + encodeURIComponent(chosen) : ""), { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status === "no_key" || data.status === "not_approved") return needApproval(data.status);
        if (!data.health) return problem(data);
        lastData = data;
        dashboard(data);
        if (typeof paintMaintenance === "function") paintMaintenance();
      });
    }).catch(function () {
      view.innerHTML = '<div class="a-empty"><div class="a-empty__title">Cannot reach the app</div>Retrying shortly.</div>';
    });
  }

  // --- Cleanup card: shown only when an administrator approved server:cleanup for this app. -----------------------------

  var cleanupBox = document.getElementById("cleanup-box");

  function runLine(run) {
    var result = run.result === "succeeded" ? pill("ok", "Done") : run.result === "failed" ? pill("critical", "Failed") : pill("unknown", run.result === "queued" ? "Queued" : "Running");
    var freed = run.result === "succeeded" ? " \u00b7 freed " + esc(bytes(run.bytesFreed)) : "";
    return "<li><span>" + when(run.startedAtUtc) + freed + '<br><span class="a-hint">' + esc(run.runnerName) + " \u00b7 " + esc(run.trigger) +
      (run.result === "failed" && run.message ? " \u00b7 " + esc(run.message) : "") + "</span></span>" + result + "</li>";
  }

  function cleanupSummary(c) {
    var last = (c.runs || [])[0];
    var status = c.warning ? "warning" : last && last.result === "succeeded" ? "ok" : "unknown";
    var tiles = stat("Last run", last ? when(last.startedAtUtc) : "never", last ? esc(last.result === "succeeded" ? "succeeded" : last.result) : "", last && last.result === "failed" ? "critical" : last ? "ok" : "") +
      stat("Freed", last && last.result === "succeeded" ? esc(bytes(last.bytesFreed)) : "-", last && last.message && last.result === "succeeded" ? esc(last.message) : "") +
      stat("Next run", when(c.nextRunAtUtc), esc(c.settings.timeUtc) + " UTC");
    return { status: status, html: (c.warning ? '<p class="a-note a-note--warning">' + esc(c.warning) + "</p>" : "") + '<div class="a-stats">' + tiles + "</div>" +
      ((c.runs || []).length ? '<ul class="a-list spaced">' + c.runs.slice(0, 5).map(runLine).join("") + "</ul>" : "") };
  }

  function studioLink(c) {
    // Framed in Studio, the page's parent is Studio itself; otherwise use the address the server worked out.
    var origin = window.location.ancestorOrigins && window.location.ancestorOrigins[0];
    var url = origin && /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") + "/server" : c.studioUrl;
    return url ? '<p class="spaced"><a class="a-btn" id="cleanup-studio" target="_blank" rel="noopener" href="' + esc(url) + '">Change in Studio</a></p>' : '<p class="a-hint spaced">Change it in Studio, on the Server page.</p>';
  }

  function paintCleanup(c) {
    var summary = cleanupSummary(c);
    cleanupBox.hidden = false;
    cleanupBox.innerHTML = card("Cleanup", summary.status, '<div id="cleanup-summary">' + summary.html + studioLink(c) + "</div>",
      "Reads an app's recent logs, restarts an app or reads Docker's disk use on this one machine, and frees Docker images no container uses and build cache older than the keep days, and old journal files above the limit. Never volumes, apps in use or backups.");
    cleanupBox.firstChild.classList.add("spaced");
    UI.updateRelativeTimes(cleanupBox);
  }

  function loadCleanup() {
    fetch("api/cleanup", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status !== "ok") { cleanupBox.hidden = true; return; }
        paintCleanup(data.cleanup);
      });
    }).catch(function () { /* keep what is shown */ });
  }

  // --- Maintenance card: Docker cleanup now on the chosen machine. Shown only when an administrator approved
  // runner:maintain for this app; the button works only for machines approved for it and for system administrators. ----

  var maintenanceBox = document.getElementById("maintenance-box");
  var machinesMaintained = [];
  var cleanupRun = null; // { runner, runId, state } of the cleanup this page started
  var cleanupTimer = null;
  var appsByRunner = {};   // runnerId -> [{ targetId, name, status }]
  var chosenApp = {};      // runnerId -> targetId
  var tool = null;         // { runner, kind, busy, text, error } the last logs, restart or disk answer

  function maintainedRunner() {
    return machinesMaintained.filter(function (item) { return item.name === chosenName(); })[0];
  }

  function chosenName() { return lastData ? lastData.machine : null; }

  function maintenanceBody(item) {
    if (!item) return '<p class="a-hint">This machine has no Runner to maintain.</p>';
    var offline = ((lastData && lastData.machines) || []).filter(function (m) { return m.name === item.name && !m.online; }).length > 0;
    var running = cleanupRun && cleanupRun.runner === item.runnerId && (cleanupRun.state === "queued" || cleanupRun.state === "running");
    var result = "";
    if (cleanupRun && cleanupRun.runner === item.runnerId && cleanupRun.run) {
      var run = cleanupRun.run;
      result = run.result === "succeeded" ? '<p class="a-note" id="maintenance-result">Freed ' + esc(bytes(run.bytesFreed)) + " on " + esc(item.name) + "." + (run.message ? " " + esc(run.message) : "") + "</p>"
        : run.result === "failed" ? '<p class="a-note a-note--warning" id="maintenance-result">The cleanup failed: ' + esc(run.message || "unknown error") + "</p>" : "";
    }
    if (cleanupRun && cleanupRun.runner === item.runnerId && cleanupRun.error) result = '<p class="a-note a-note--warning" id="maintenance-result">' + esc(cleanupRun.error) + "</p>";
    if (!item.approved) return '<p class="a-hint">An administrator has not approved maintenance on ' + esc(item.name) + " for this app yet. Approve it in Studio under Admin, Apps, Permissions.</p>";
    return toolsBody(item, offline) + '<p><button class="a-btn" type="button" id="cleanup-now"' + (running || offline ? " disabled" : "") + ">" + (running ? "Cleaning up..." : "Docker cleanup now") + "</button> " +
      '<span class="a-hint">on ' + esc(item.name) + (offline ? " (offline)" : "") + "</span></p>" + result;
  }

  function toolsBody(item, offline) {
    var apps = appsByRunner[item.runnerId] || [];
    var picked = chosenApp[item.runnerId] || (apps[0] && apps[0].targetId) || "";
    var busy = tool && tool.runner === item.runnerId && tool.busy;
    var options = apps.map(function (a) { return '<option value="' + esc(a.targetId) + '"' + (a.targetId === picked ? " selected" : "") + ">" + esc(a.name) + " (" + esc(a.status) + ")</option>"; }).join("");
    var off = busy || offline ? " disabled" : "";
    var out = "";
    if (tool && tool.runner === item.runnerId && !tool.busy) {
      out = tool.error ? '<p class="a-note a-note--warning" id="tool-result">' + esc(tool.error) + "</p>"
        : '<pre class="a-code" id="tool-result" style="max-height:20rem;overflow:auto;white-space:pre-wrap">' + esc(tool.text) + "</pre>";
    }
    return '<p><select id="app-pick" class="a-input" aria-label="App on this machine"' + (apps.length ? "" : " disabled") + ">" + (options || "<option>No apps on this machine</option>") + "</select> " +
      '<button class="a-btn" type="button" id="app-logs"' + (apps.length ? off : " disabled") + ">Logs</button> " +
      '<button class="a-btn" type="button" id="app-restart"' + (apps.length ? off : " disabled") + ">Restart app</button> " +
      '<button class="a-btn" type="button" id="disk-report"' + off + ">Disk report</button>" + (busy ? ' <span class="a-hint">Working...</span>' : "") + "</p>" + out;
  }

  function loadApps(item) {
    fetch("api/maintenance/apps?runner=" + encodeURIComponent(item.runnerId), { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status === "ok" && Array.isArray(data.data)) { appsByRunner[item.runnerId] = data.data; paintMaintenance(); }
      });
    }).catch(function () { /* keep what is shown */ });
  }

  function runTool(kind) {
    var item = maintainedRunner();
    if (!item) return;
    var picked = (document.getElementById("app-pick") || {}).value || "";
    chosenApp[item.runnerId] = picked;
    if (kind === "restart" && !window.confirm("Restart this app on " + item.name + "? It is unavailable for a short while.")) return;
    tool = { runner: item.runnerId, kind: kind, busy: true };
    paintMaintenance();
    var query = "runner=" + encodeURIComponent(item.runnerId) + (kind === "disk" ? "" : "&target=" + encodeURIComponent(picked)) + (kind === "logs" ? "&lines=100" : "");
    fetch("api/maintenance/" + kind + "?" + query, { method: "POST", headers: { "X-Server-Console": "1" }, cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        tool.busy = false;
        if (data.status !== "ok" || !data.data) {
          tool.error = data.status === "forbidden" || data.status === "not_approved" ? "Only a system administrator can do this, on a machine approved for this app." : data.message || "That did not work.";
        } else if (kind === "logs") tool.text = data.data.running ? (data.data.text || "(no output yet)") : "That app has no running container on this machine.";
        else if (kind === "restart") tool.text = data.data.restarted ? "Restarted. The app is back." : "The app was not restarted.";
        else tool.text = "Images " + bytes(data.data.imagesBytes) + "\nContainers " + bytes(data.data.containersBytes) + "\nVolumes " + bytes(data.data.volumesBytes) +
          "\nBuild cache " + bytes(data.data.buildCacheBytes) + "\nCleanup could free about " + bytes(data.data.reclaimableBytes);
        paintMaintenance();
      });
    }).catch(function () {
      if (kind !== "restart") { tool.busy = false; tool.error = "The app could not be reached."; paintMaintenance(); return; }
      // The Runner resets its connections while it restarts an app, which can drop this answer although the restart worked.
      setTimeout(function () {
        tool.busy = false;
        tool.text = "The restart was sent, but the connection dropped while the Runner restarted the app. Check the status above.";
        loadApps(item);
        paintMaintenance();
      }, 8000);
    });
  }

  function paintMaintenance() {
    if (!machinesMaintained.length) { maintenanceBox.hidden = true; return; }
    var item = maintainedRunner();
    maintenanceBox.hidden = false;
    maintenanceBox.innerHTML = card("Maintenance", item && item.approved ? "ok" : "unknown", '<div id="maintenance-body">' + maintenanceBody(item) + "</div>",
      "Frees Docker images no container uses and build cache older than the keep days, and old journal files above the limit, on this one machine. Never volumes, apps in use or backups. Needs a system administrator.");
    maintenanceBox.firstChild.classList.add("spaced");
  }

  function loadMaintenance() {
    fetch("api/maintenance", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        machinesMaintained = data.status === "ok" && Array.isArray(data.data) ? data.data : [];
        paintMaintenance();
        var item = maintainedRunner();
        if (item && item.approved && !appsByRunner[item.runnerId]) loadApps(item);
      });
    }).catch(function () { /* keep what is shown */ });
  }

  function pollCleanup() {
    clearTimeout(cleanupTimer);
    if (!cleanupRun || (cleanupRun.state !== "queued" && cleanupRun.state !== "running")) return;
    fetch("api/maintenance/cleanup?runner=" + encodeURIComponent(cleanupRun.runner) + "&run=" + encodeURIComponent(cleanupRun.runId), { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status === "ok" && data.data) { cleanupRun.run = data.data; cleanupRun.state = data.data.result; }
        else { cleanupRun.state = "failed"; cleanupRun.error = data.message || "The cleanup result could not be read."; }
        paintMaintenance();
        if (cleanupRun.state === "queued" || cleanupRun.state === "running") cleanupTimer = setTimeout(pollCleanup, 3000);
        else load();
      });
    }).catch(function () { cleanupTimer = setTimeout(pollCleanup, 5000); });
  }

  function startCleanup() {
    var item = maintainedRunner();
    if (!item) return;
    cleanupRun = { runner: item.runnerId, state: "queued" };
    paintMaintenance();
    fetch("api/maintenance/cleanup?runner=" + encodeURIComponent(item.runnerId), { method: "POST", headers: { "X-Server-Console": "1" }, cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status !== "ok" || !data.data) {
          cleanupRun.state = "failed";
          cleanupRun.error = data.status === "forbidden" || data.status === "not_approved" ? "Only a system administrator can run the cleanup, on a machine approved for this app." : data.message || "The cleanup could not be started.";
          return paintMaintenance();
        }
        cleanupRun.runId = data.data.id; cleanupRun.state = data.data.result;
        paintMaintenance();
        pollCleanup();
      });
    }).catch(function () { cleanupRun.state = "failed"; cleanupRun.error = "The app could not be reached."; paintMaintenance(); });
  }

  maintenanceBox.addEventListener("click", function (event) {
    if (event.target.id === "cleanup-now") startCleanup();
    else if (event.target.id === "app-logs") runTool("logs");
    else if (event.target.id === "app-restart") runTool("restart");
    else if (event.target.id === "disk-report") runTool("disk");
  });

  UI.bindThemeToggle();
  load();
  loadMaintenance();
  setInterval(loadMaintenance, 60000);
  loadCleanup();
  setInterval(loadCleanup, 30000);
  setInterval(load, 30000);
  setInterval(function () { UI.updateRelativeTimes(document); }, 30000);
})();
