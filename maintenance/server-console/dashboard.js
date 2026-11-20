/* Server Keeper page. Built only from the Automaton app UI kit in ui/. */
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
    return '<section class="a-card" id="' + esc(title.toLowerCase().replace(/\s+/g, "-")) + '"><div class="a-card__head"><h2 class="a-card__title">' + esc(title) + "</h2>" + (status ? pill(status) : "") + "</div>" +
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
      "</dd><dt>Docker volumes</dt><dd>" + esc(bytes(rc.volumes)) + "</dd>" +
      (typeof rc.unused === "number" ? "<dt>Unused images</dt><dd>" + esc(bytes(rc.unused)) + "</dd>" : "") + "<dt>Can be freed</dt><dd><strong>up to " + esc(bytes(rc.freeable)) + "</strong> images and cache</dd></dl>" +
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

  // Disk by app: what each app on this machine uses, largest first (the server's per-Runner list; older servers send none).
  function diskByAppCard(data) {
    var apps = data.appDisk || [];
    if (!apps.length) return "";
    var parts = [["imageBytes", "image"], ["containerBytes", "container"], ["dataBytes", "data"], ["logsBytes", "logs"], ["filesBytes", "files"]];
    var rows = apps.map(function (app) {
      var detail = parts.filter(function (p) { return typeof app[p[0]] === "number" && app[p[0]] > 0; })
        .map(function (p) { return p[1] + " " + bytes(app[p[0]]); }).join(", ");
      return '<div class="disk-row"><span>' + esc(app.name) + (detail ? '<br><small class="a-hint">' + esc(detail) + "</small>" : "") + '</span><strong class="disk-size">' + esc(bytes(app.totalBytes)) + "</strong></div>";
    }).join("");
    return card("Disk by app", "", '<div data-testid="disk-by-app">' + rows + "</div>",
      "An image several apps share counts in full for each. \"(unknown app)\" is data left on the machine by an app that no longer exists. Measured by the Runner every few minutes.");
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

  function clock(seconds) {
    var d = new Date(seconds * 1000), two = function (n) { return (n < 10 ? "0" : "") + n; };
    return two(d.getHours()) + ":" + two(d.getMinutes());
  }

  function banner(data) {
    var stale = data.status !== "ok" && data.status !== "starting" ? '<div class="a-note a-note--warning" style="margin-bottom:16px">Last read failed' + (data.failedAt ? " at " + clock(data.failedAt) : "") + ": " + esc(data.message || "no reason was reported (status " + (data.status || "unknown") + ")") +
      ". Showing figures from " + (data.fetchedAt ? clock(data.fetchedAt) : "an earlier check") + ".</div>" : "";
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
    var updates = host.rebootRequired === true ? "restart needed" : security > 0 ? security + " security" : typeof security !== "number" || typeof host.updatesPending !== "number" ? "unknown" : "up to date";
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
    view.innerHTML = banner(data) + summary(h, a, data) + '<div class="cards">' + "<div class=\"col\">" + (offline ? offlineCard(data) : resourcesCard(h, a, history, data) + diskByAppCard(data)) + "</div><div class=\"col\">" + (offline ? "" : updatesCard(h, a, data)) + serverCard(h, a) +
      "</div><div class=\"col\">" + certificatesCard(h, a) + runnersCard(h, a, data.now) + backupsCard(h, a) + "</div></div>";
    overall.hidden = false;
    var count = (data.attention || []).length;
    overall.className = "a-pill a-pill--large" + (a.overall !== "unknown" ? " a-pill--" + a.overall : "");
    overall.textContent = a.overall === "ok" ? "All good" : count ? (count === 1 ? "1 thing needs you" : count + " things need you") : a.overall === "warning" ? "Needs attention" : a.overall === "critical" ? "Action needed" : "Some figures unknown";
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
        : "Server Keeper has no <strong>server:read</strong> key yet. An administrator of your Automaton server must approve it before any figures appear.",
      ["Sign in to Studio as a system administrator.", "Open <strong>Admin</strong>, then <strong>Apps</strong> (filter <em>Waiting for approval</em>) and choose <strong>Review</strong> next to Server Keeper.",
        "On the <strong>Permissions</strong> tab, select <strong>Approve</strong> for <span class=\"a-mono\">server:read</span>. The app restarts by itself and this page fills in within a few minutes.",
        "App owners can see the same state with <span class=\"a-mono\">automaton permissions status</span>."]);
    subtitle.textContent = "Permission not approved yet";
  }

  function problem(data) {
    var message = data.status === "not_configured" ? "This app does not know the server's address. Update Automaton so it provides one, or set the <span class=\"a-mono\">API_BASE_URL</span> setting, then restart the app."
      : data.status === "unavailable" ? "This server does not offer server health yet. Update Automaton, then reload."
      : data.status === "starting" ? "The first check is still running. This page refreshes by itself."
      : "The server could not be read right now: " + esc(data.message || "no reason was reported (status " + (data.status || "unknown") + ")") + ".";
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
        if (typeof paintTasks === "function") paintTasks();
      });
    }).catch(function () {
      view.innerHTML = '<div class="a-empty"><div class="a-empty__title">Cannot reach the app</div>Retrying shortly.</div>';
    });
  }

  // --- Cleanup card: shown only when an administrator approved server:cleanup for this app. -----------------------------

  var cleanupRefusals = 0;
  var cleanupInfo = null; // the nightly cleanup read through server:cleanup, or { needsApproval: true }

  function loadCleanup() {
    fetch("api/cleanup", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        // One refused read (a transient 401) must not turn approved permissions into "Needs approval": keep the last good
        // figures until the refusal repeats. Other failures (unreachable, server error) never mean "not approved".
        if (data.status === "ok") { cleanupInfo = data.cleanup; cleanupRefusals = 0; }
        else if (data.status === "not_approved" || data.status === "no_key") {
          cleanupRefusals += 1;
          if (!cleanupInfo || cleanupInfo.needsApproval || cleanupRefusals >= 2) cleanupInfo = { needsApproval: true };
        }
        if (typeof paintTasks === "function") paintTasks();
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
  var hostOp = null;       // { runner, kind, typed, busy, text, error } OS update or restart of the machine, after typing its name
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
    return toolsBody(item, offline) + hostBody(item, offline) + '<p><button class="a-btn" type="button" id="cleanup-now"' + (running || offline ? " disabled" : "") + ">" + (running ? "Cleaning up..." : "Docker cleanup now") + "</button> " +
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

  var HOST_TEXT = {
    "os-update": { button: "Install security updates", ask: "Installs the pending security updates on this machine. It can take several minutes.", done: "Security updates installed." },
    "reboot": { button: "Restart machine", ask: "Restarts the whole machine one minute from now. Everything on it, including this app, is unavailable until it is back.", done: "The machine restarts in one minute." }
  };

  function hostBody(item, offline) {
    var mine = hostOp && hostOp.runner === item.runnerId ? hostOp : null;
    var busy = mine && mine.busy;
    var html = '<p><button class="a-btn" type="button" id="host-os-update"' + (busy || offline ? " disabled" : "") + ">" + HOST_TEXT["os-update"].button + "</button> " +
      '<button class="a-btn" type="button" id="host-reboot"' + (busy || offline ? " disabled" : "") + ">" + HOST_TEXT.reboot.button + "</button>" + (busy ? ' <span class="a-hint">Working...</span>' : "") + "</p>";
    if (mine && mine.asking && !busy) {
      html += '<div id="host-confirm"><p class="a-note a-note--warning">' + esc(HOST_TEXT[mine.kind].ask) + " Type <strong>" + esc(item.name) + '</strong> to confirm.</p>' +
        '<p><input class="a-input" id="host-typed" autocomplete="off" spellcheck="false" aria-label="Type the machine name" value="' + esc(mine.typed || "") + '"> ' +
        '<button class="a-btn" type="button" id="host-go"' + (mine.typed === item.name ? "" : " disabled") + ">" + esc(HOST_TEXT[mine.kind].button) + "</button> " +
        '<button class="a-btn" type="button" id="host-cancel">Cancel</button></p></div>';
    }
    if (mine && !mine.asking && !busy && (mine.error || mine.text))
      html += mine.error ? '<p class="a-note a-note--warning" id="host-result">' + esc(mine.error) + "</p>" : '<p class="a-note" id="host-result">' + esc(mine.text) + "</p>";
    return html;
  }

  function askHost(kind) {
    var item = maintainedRunner();
    if (!item) return;
    hostOp = { runner: item.runnerId, kind: kind, asking: true, typed: "" };
    paintMaintenance();
    var box = document.getElementById("host-typed");
    if (box) box.focus();
  }

  function runHost() {
    var item = maintainedRunner();
    if (!item || !hostOp || hostOp.runner !== item.runnerId || hostOp.typed !== item.name) return;
    var kind = hostOp.kind, typed = hostOp.typed;
    hostOp = { runner: item.runnerId, kind: kind, busy: true };
    paintMaintenance();
    fetch("api/maintenance/" + kind + "?runner=" + encodeURIComponent(item.runnerId), { method: "POST", cache: "no-store",
      headers: { "X-Server-Console": "1", "Content-Type": "application/json", "X-Confirm-Machine": encodeURIComponent(typed) }, body: JSON.stringify({ confirm: typed }) }).then(function (response) {
      return response.json().then(function (data) {
        hostOp = { runner: item.runnerId, kind: kind };
        if (data.status !== "ok" || !data.data) {
          hostOp.error = data.status === "forbidden" || data.status === "not_approved" ? "Only a system administrator can do this, on a machine approved for this app." : data.message || "That did not work.";
        } else if (kind === "os-update") {
          hostOp.text = data.data.succeeded ? HOST_TEXT[kind].done + (data.data.restartRequired ? " A restart is now needed." : " No restart is needed.") : "The update failed: " + (data.data.summary || "unknown error");
        } else hostOp.text = HOST_TEXT[kind].done;
        paintMaintenance();
      });
    }).catch(function () { // The Runner resets its connections while it works on the machine, which can drop this answer although the work went on.
      hostOp = { runner: item.runnerId, kind: kind, error: kind === "os-update" ? "The connection dropped while the updates were installed. They usually still finish: the Updates card shows the result after the next check (up to 5 minutes)." : "The connection dropped. Check the machine before trying again." }; paintMaintenance(); });
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
        if (!tool || tool.runner !== item.runnerId) return;
        tool.busy = false;
        tool.text = "The restart was sent, but the connection dropped while the Runner restarted the app. Check the status above.";
        loadApps(item);
        paintMaintenance();
      }, 8000);
    });
  }

  function paintMaintenance() {
    // Do not redraw under someone typing the machine's name.
    if (hostOp && hostOp.asking && document.activeElement && document.activeElement.id === "host-typed") return;
    if (!machinesMaintained.length) { maintenanceBox.hidden = true; return; }
    var item = maintainedRunner();
    maintenanceBox.hidden = false;
    maintenanceBox.innerHTML = card("This machine", item && item.approved ? "ok" : "unknown", '<div id="maintenance-body">' + maintenanceBody(item) + "</div>",
      "Frees Docker images no container uses and build cache older than the keep days, and old journal files above the limit, on this one machine. Never volumes, apps in use or backups. Needs a system administrator.");
    maintenanceBox.firstChild.classList.add("spaced");
  }

  function loadMaintenance() {
    fetch("api/maintenance", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        machinesMaintained = data.status === "ok" && Array.isArray(data.data) ? data.data : [];
        paintMaintenance();
        paintTasks();
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
    else if (event.target.id === "host-os-update") askHost("os-update");
    else if (event.target.id === "host-reboot") askHost("reboot");
    else if (event.target.id === "host-go") runHost();
    else if (event.target.id === "host-cancel") { hostOp = null; paintMaintenance(); }
  });
  maintenanceBox.addEventListener("input", function (event) {
    if (event.target.id !== "host-typed" || !hostOp) return;
    var item = maintainedRunner();
    hostOp.typed = event.target.value;
    var go = document.getElementById("host-go");
    if (go && item) go.disabled = hostOp.typed !== item.name;
  });


  // --- Maintenance section: every task in one place. Reads are open to anyone who may see the page; Run now and Settings
  // are shown to system administrators only (the proxy's role header; the server checks the viewer token on every change). ---

  var tasksBox = document.getElementById("tasks-box");
  var isAdmin = false;
  var cleanupOp = null;   // { error } after Run now on the cleanup
  var cleanupEdit = false;
  var backupOp = null;    // { since, state: "waiting" | "done" | "failed", text, needsApproval }
  var osOp = null;        // { asking, typed, state: "waiting" | "done" | "failed", text, restartRequired } installing the OS updates
  var restartOp = null;   // { asking, at, typed, state: "waiting" | "scheduled" | "done" | "failed", text, started, needsApproval } restarting the server
  var restartInfo = null; // the server's answer: { lastRestartedAtUtc, restartAtUtc, state }
  var upgradeOp = null;   // { items: [{ runnerId, name, state, text }], busy }
  var tasksTimer = null;
  var APPROVAL = "Needs approval. An administrator approves it in Studio under Admin, Apps, Permissions.";

  function post(path, body) {
    return fetch(path, { method: "POST", cache: "no-store", headers: { "X-Server-Console": "1", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (response) { return response.json(); });
  }

  function refused(data, fallback) {
    return data.status === "forbidden" || data.status === "not_approved" ? "Only a system administrator can do this, and the app needs the permission approved." : data.message || fallback;
  }

  function row(id, name, status, lines, actions) {
    return '<li id="task-' + id + '" class="task"><div class="task__main"><div class="task__name"><strong>' + esc(name) + "</strong> " + pill(status) + "</div>" +
      lines.filter(Boolean).map(function (line) { return '<div class="a-hint">' + line + "</div>"; }).join("") + "</div>" +
      (actions ? '<div class="task__actions">' + actions + "</div>" : "") + "</li>";
  }

  function cleanupRow() {
    if (!cleanupInfo || cleanupInfo.needsApproval) return row("cleanup", "Cleanup", "unknown", [esc(APPROVAL)], "");
    var last = (cleanupInfo.runs || [])[0];
    var running = last && (last.result === "queued" || last.result === "running");
    var status = cleanupInfo.warning || (last && last.result === "failed") ? "warning" : last && last.result === "succeeded" ? "ok" : "unknown";
    var line = "Nightly at " + esc(cleanupInfo.settings.timeUtc) + " UTC, next " + when(cleanupInfo.nextRunAtUtc) + ", keeps " + esc(String(cleanupInfo.settings.keepDays)) + " days, journal limit " + esc(String(cleanupInfo.settings.journalLimitMb)) + " MB.";
    var result = running ? "Cleaning up on " + esc(last.runnerName) + "..." : last ? "Last run " + when(last.startedAtUtc) + ", " + (last.result === "succeeded" ? "freed " + esc(bytes(last.bytesFreed)) : esc(last.result)) + (last.result === "failed" && last.message ? ": " + esc(last.message) : "") : "Never run.";
    var actions = "";
    var form = "";
    if (isAdmin) {
      actions = '<button class="a-btn" type="button" id="cleanup-run"' + (running ? " disabled" : "") + ">" + (running ? "Running..." : "Run now") + '</button> <button class="a-btn" type="button" id="cleanup-settings">Settings</button>';
      if (cleanupEdit) {
        var st = cleanupInfo.settings;
        form = '<div id="cleanup-form" class="task__form"><label>Time (UTC) <input class="a-input" id="cs-time" value="' + esc(st.timeUtc) + '" size="5"></label> <label>Keep days <input class="a-input" id="cs-keep" type="number" min="1" max="365" value="' + esc(String(st.keepDays)) + '"></label> ' +
          '<label>Journal limit (MB) <input class="a-input" id="cs-journal" type="number" min="50" max="100000" value="' + esc(String(st.journalLimitMb)) + '"></label> <button class="a-btn" type="button" id="cleanup-save">Save</button> <button class="a-btn" type="button" id="cleanup-cancel">Cancel</button></div>';
      }
    }
    return row("cleanup", "Cleanup", status, [line, result, cleanupInfo.warning ? esc(cleanupInfo.warning) : "", cleanupOp && cleanupOp.error ? '<span class="a-note a-note--warning" id="cleanup-error">' + esc(cleanupOp.error) + "</span>" : "", form], actions);
  }

  function backupRow() {
    var h = lastData && lastData.health, a = lastData && lastData.assessment;
    var b = (h && h.backup) || {};
    if (!b.available) return row("backup", "Backup", "unknown", ["No backup status yet. Run the latest server update to enable backups."], "");
    var last = b.lastSuccessAt ? "Last backup " + when(b.lastSuccessAt) + " succeeded." : "No successful backup yet.";
    var op = backupOp;
    var note = !op ? "" : op.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (op.state === "failed" ? " a-note--warning" : "") + '" id="backup-result">' + esc(op.text) + "</span>";
    var busy = op && op.state === "waiting";
    return row("backup", "Backup", a ? a.backup : "unknown", [last, b.lastError ? '<span class="a-note a-note--critical">' + esc(b.lastError) + "</span>" : "", note],
      isAdmin ? '<button class="a-btn" type="button" id="backup-run"' + (busy ? " disabled" : "") + ">" + (busy ? "Backing up..." : "Run now") + "</button>" : "");
  }

  function upgradeTargets() {
    var runners = (lastData && lastData.health && lastData.health.runners) || [];
    return runners.filter(function (r) { return r.upgradeAvailable && String(r.status || "").toLowerCase() === "online"; });
  }

  function approvedRunner(name) {
    return machinesMaintained.filter(function (m) { return m.name === name && m.approved; })[0];
  }

  function upgradeRow() {
    var runners = (lastData && lastData.health && lastData.health.runners) || [];
    if (!runners.length) return row("upgrade", "Upgrade Runners", "unknown", ["No Runners are registered."], "");
    var old = upgradeTargets();
    var ready = old.filter(function (r) { return approvedRunner(r.name); });
    var busy = upgradeOp && upgradeOp.busy;
    var line = old.length ? old.length + (old.length === 1 ? " Runner is" : " Runners are") + " old: " + old.map(function (r) { return esc(r.name); }).join(", ") + "." : "All Runners are current.";
    var lacking = old.length && !ready.length ? esc(APPROVAL) : old.length > ready.length ? "Needs approval for: " + old.filter(function (r) { return !approvedRunner(r.name); }).map(function (r) { return esc(r.name); }).join(", ") + "." : "";
    var progress = upgradeOp ? upgradeOp.items.map(function (i) { return '<span class="a-note' + (i.state === "failed" ? " a-note--warning" : "") + '" id="upgrade-' + esc(i.runnerId) + '">' + esc(i.name) + ": " + esc(i.text) + "</span>"; }).join("<br>") : "";
    return row("upgrade", "Upgrade Runners", old.length ? "warning" : "ok", [line, lacking, progress],
      isAdmin ? '<button class="a-btn" type="button" id="upgrade-run"' + (busy || !ready.length ? " disabled" : "") + ">" + (busy ? "Upgrading..." : "Run now") + "</button>" : "");
  }

  function updatesRow() {
    var h = lastData && lastData.health, a = lastData && lastData.assessment;
    var host = (h && h.host) || {};
    if (typeof host.updatesPending !== "number") return row("updates", "OS updates", "unknown", ["Update counts need Ubuntu's update notifier on the server."], "");
    var line = plural(host.updatesPending, "update") + " waiting" + (typeof host.securityUpdates === "number" ? ", " + host.securityUpdates + " of them security" : "") + "; " + (host.rebootRequired ? "a restart is needed." : "no restart needed.");
    var name = chosenName();
    var busy = osOp && osOp.state === "waiting";
    var ask = osOp && osOp.asking ? '<div id="os-confirm"><span class="a-note a-note--warning">Installs the pending security updates on this server. It can take several minutes, and no app is stopped. Type <strong>' + esc(name) + '</strong> to confirm.</span> ' +
      '<input class="a-input" id="os-typed" autocomplete="off" spellcheck="false" aria-label="Type the server name" value="' + esc(osOp.typed || "") + '"> ' +
      '<button class="a-btn" type="button" id="os-go"' + (osOp.typed === name ? "" : " disabled") + '>Install updates</button> <button class="a-btn" type="button" id="os-cancel">Cancel</button></div>' : "";
    var note = !osOp || osOp.asking ? "" : osOp.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (osOp.state === "failed" ? " a-note--warning" : "") + '" id="os-result">' + esc(osOp.text) + "</span>";
    return row("updates", "OS updates", a ? a.updates : "unknown", [line, "Installs security updates from here; other updates and a restart: see This machine below.", note, ask],
      isAdmin && name ? '<button class="a-btn" type="button" id="os-run"' + (busy || (osOp && osOp.asking) ? " disabled" : "") + ">" + (busy ? "Installing..." : "Install updates") + "</button>" : "");
  }

  function tonight() {
    var d = new Date(); d.setHours(3, 0, 0, 0);
    if (d.getTime() < Date.now() + 3600000) d.setDate(d.getDate() + 1);
    return d;
  }

  function restartRow() {
    var name = chosenName();
    var info = restartInfo || {};
    var asking = restartOp && restartOp.asking;
    var busy = restartOp && restartOp.state === "waiting";
    var last = info.lastRestartedAtUtc ? "Last restarted " + when(info.lastRestartedAtUtc) + "." : "";
    var plan = info.state === "scheduled" && info.restartAtUtc ? "A restart is scheduled for " + when(info.restartAtUtc) + "." : "";
    var ask = asking ? '<div id="restart-confirm"><span class="a-note a-note--warning">' + (restartOp.at ? "Restarts this server at " + esc(new Date(restartOp.at).toLocaleString()) + "." : "Restarts this server in about a minute.") +
      " Every app on it is unavailable until it is back. Type <strong>" + esc(name) + '</strong> to confirm.</span> ' +
      '<input class="a-input" id="restart-typed" autocomplete="off" spellcheck="false" aria-label="Type the server name" value="' + esc(restartOp.typed || "") + '"> ' +
      '<button class="a-btn" type="button" id="restart-go"' + (restartOp.typed === name ? "" : " disabled") + '>' + (restartOp.at ? "Restart tonight" : "Restart now") + '</button> <button class="a-btn" type="button" id="restart-cancel">Cancel</button></div>' : "";
    var note = !restartOp || asking ? "" : restartOp.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (restartOp.state === "failed" ? " a-note--warning" : "") + '" id="restart-result">' + esc(restartOp.text) + "</span>";
    var off = busy || asking ? " disabled" : "";
    return row("restart", "Server restart", restartOp && restartOp.state === "failed" ? "warning" : plan ? "ok" : "unknown", [last, plan, note, ask],
      isAdmin && name ? '<button class="a-btn" type="button" id="restart-now"' + off + ">Restart now</button> " + '<button class="a-btn" type="button" id="restart-tonight"' + off + ">Restart tonight</button>" : "");
  }

  function paintTasks() {
    if (!lastData) return;
    // Do not redraw under someone typing in the settings form.
    if (cleanupEdit && document.activeElement && /^cs-/.test(document.activeElement.id || "")) return;
    if (osOp && osOp.asking && document.activeElement && document.activeElement.id === "os-typed") return;
    if (restartOp && restartOp.asking && document.activeElement && document.activeElement.id === "restart-typed") return;
    tasksBox.hidden = false;
    tasksBox.innerHTML = '<section class="a-card spaced" id="maintenance"><div class="a-card__head"><h2 class="a-card__title">Maintenance</h2></div><ul class="a-list tasks">' +
      cleanupRow() + backupRow() + upgradeRow() + updatesRow() + restartRow() + "</ul></section>";
    UI.updateRelativeTimes(tasksBox);
  }

  function pollOsUpdates() {
    if (!osOp || osOp.state !== "waiting") return;
    fetch("api/tasks/os-updates", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
      var s = (data.status === "ok" && data.data) || {};
      if (s.state === "succeeded" || s.state === "failed" || s.state === "refused" || s.state === "unsupported") {
        osOp = s.state === "succeeded"
          ? { state: "done", text: "Installed " + (s.upgradedCount || 0) + " update(s)." + (s.restartRequired ? " A restart is now needed." : " No restart is needed.") }
          : { state: "failed", text: s.message || "The updates were not installed." };
        load(); return paintTasks();
      }
      if (Date.now() - osOp.started > 3 * 3600000) { osOp = { state: "failed", text: "Still not finished after 3 hours. Check the server." }; return paintTasks(); }
      setTimeout(pollOsUpdates, 5000);
    }).catch(function () { setTimeout(pollOsUpdates, 5000); });
  }

  function runOsUpdates() {
    var name = chosenName();
    if (!osOp || osOp.typed !== name) return;
    osOp = { state: "waiting", text: "Installing...", started: Date.now() };
    paintTasks();
    post("api/tasks/os-updates").then(function (data) {
      if (data.status === "ok") return setTimeout(pollOsUpdates, 5000);
      osOp = data.status === "forbidden" || data.status === "not_approved" ? { state: "failed", needsApproval: true }
        : data.status === "not_found" ? { state: "failed", text: "This server cannot install updates from Studio yet. Update Automaton, or run sudo apt upgrade on the server." }
        : { state: "failed", text: data.message || "The updates could not be started." };
      paintTasks();
    }).catch(function () { osOp = { state: "failed", text: "The app could not be reached." }; paintTasks(); });
  }

  function loadRestart() {
    return fetch("api/tasks/restart", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.status === "ok" && data.data) restartInfo = data.data;
    });
  }

  function pollRestart() {
    if (!restartOp || restartOp.state !== "waiting") return;
    // The server goes down while it restarts, so a failed read means keep waiting.
    loadRestart().catch(function () {}).then(function () {
      if (restartInfo && restartInfo.state === "refused") { restartOp = { state: "failed", text: restartInfo.message || "The server refused the restart." }; return paintTasks(); }
      var at = restartInfo && restartInfo.lastRestartedAtUtc;
      if (at && Date.parse(at) >= restartOp.started - 60000) {
        restartOp = { state: "done", text: "Restarted at " + new Date(at).toLocaleTimeString() + "." };
        load(); return paintTasks();
      }
      if (Date.now() - restartOp.started > 15 * 60000) { restartOp = { state: "failed", text: "No restart after 15 minutes. Check the server." }; return paintTasks(); }
      setTimeout(pollRestart, 5000);
    });
  }

  function runRestart() {
    var name = chosenName();
    if (!restartOp || restartOp.typed !== name) return;
    var at = restartOp.at;
    restartOp = { state: "waiting", text: at ? "Scheduling..." : "Restart requested. Waiting for the server to come back...", started: Date.now() };
    paintTasks();
    post("api/tasks/restart", { restartAtUtc: at }).then(function (data) {
      if (data.status === "ok") {
        if (at) { restartOp = { state: "scheduled", text: "The server restarts at " + new Date(at).toLocaleString() + "." }; loadRestart().catch(function () {}).then(paintTasks); return paintTasks(); }
        return pollRestart();
      }
      restartOp = data.status === "forbidden" || data.status === "not_approved" ? { state: "failed", needsApproval: true }
        : data.status === "not_found" ? { state: "failed", text: "This server cannot restart itself from Studio yet. Update Automaton, or run sudo reboot on the server." }
        : { state: "failed", text: data.message || "The restart could not be requested." };
      paintTasks();
    }).catch(function () { restartOp = { state: "failed", text: "The app could not be reached." }; paintTasks(); });
  }

  function pollTasks() {
    clearTimeout(tasksTimer);
    var last = cleanupInfo && (cleanupInfo.runs || [])[0];
    var cleaning = last && (last.result === "queued" || last.result === "running");
    var backing = backupOp && backupOp.state === "waiting";
    if (!cleaning && !backing) return;
    if (cleaning) loadCleanup();
    if (backing) {
      load();
      var b = lastData && lastData.health && lastData.health.backup;
      if (b && b.lastSuccessAt && b.lastSuccessAt !== backupOp.since) backupOp = { state: "done", text: "The backup finished." };
      else if (Date.now() - backupOp.started > 15 * 60000) backupOp = { state: "failed", text: "No new backup after 15 minutes. Check the server." };
      else if (b && b.lastError && b.lastError !== backupOp.error) backupOp = { state: "failed", text: "The backup failed: " + b.lastError };
    }
    paintTasks();
    tasksTimer = setTimeout(pollTasks, 5000);
  }

  function runCleanupNow() {
    cleanupOp = null;
    post("api/tasks/cleanup-run").then(function (data) {
      if (data.status === "ok" && data.data) cleanupInfo = Object.assign({}, cleanupInfo, data.data);
      else cleanupOp = { error: refused(data, "The cleanup could not be started.") };
      paintTasks(); pollTasks();
    }).catch(function () { cleanupOp = { error: "The app could not be reached." }; paintTasks(); });
  }

  function saveCleanup() {
    var body = { timeUtc: document.getElementById("cs-time").value.trim(), keepDays: parseInt(document.getElementById("cs-keep").value, 10), journalLimitMb: parseInt(document.getElementById("cs-journal").value, 10) };
    post("api/tasks/cleanup-settings", body).then(function (data) {
      if (data.status === "ok") { cleanupEdit = false; cleanupOp = null; loadCleanup(); }
      else cleanupOp = { error: refused(data, "The settings were not saved.") };
      paintTasks();
    }).catch(function () { cleanupOp = { error: "The app could not be reached." }; paintTasks(); });
  }

  function runBackupNow() {
    var b = (lastData && lastData.health && lastData.health.backup) || {};
    backupOp = { state: "waiting", text: "Backup requested. Waiting for it to finish...", since: b.lastSuccessAt, error: b.lastError, started: Date.now() };
    paintTasks();
    post("api/tasks/backup").then(function (data) {
      if (data.status === "ok") return pollTasks();
      backupOp = data.status === "forbidden" || data.status === "not_approved" ? { state: "failed", needsApproval: true } : { state: "failed", text: data.message || "The backup could not be started." };
      paintTasks();
    }).catch(function () { backupOp = { state: "failed", text: "The app could not be reached." }; paintTasks(); });
  }

  function upgradeOne(item) {
    var query = "?runner=" + encodeURIComponent(item.runnerId);
    var tries = 0, unknown = 0;
    function poll() {
      fetch("api/tasks/upgrade" + query, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
        var state = data.data && data.data.state;
        if (state === "Reconnected") { item.state = "done"; item.text = "upgraded and reconnected."; return finish(); }
        if (state === "RolledBack") { item.state = "failed"; item.text = (data.data.message || "the upgrade was rolled back."); return finish(); }
        if (state === "Unknown" && ++unknown > 6) { item.state = "failed"; item.text = "the upgrade did not start."; return finish(); }
        if (++tries > 60) { item.state = "failed"; item.text = "still not back after 5 minutes. Check the machine."; return finish(); }
        item.text = (data.data && data.data.message) || "upgrading..."; paintTasks(); setTimeout(poll, 5000);
      }).catch(function () { if (++tries > 60) { item.state = "failed"; item.text = "could not read the result."; return finish(); } setTimeout(poll, 5000); });
    }
    function finish() { if (upgradeOp.items.every(function (i) { return i.state !== "waiting"; })) { upgradeOp.busy = false; load(); } paintTasks(); }
    post("api/tasks/upgrade?runner=" + encodeURIComponent(item.runnerId)).then(function (data) {
      if (data.status !== "ok") { item.state = "failed"; item.text = refused(data, "could not be started."); return finish(); }
      item.text = "upgrading..."; paintTasks(); setTimeout(poll, 5000);
    }).catch(function () { // The Runner restarts itself, which can drop this answer although the upgrade started: look at its state instead.
      item.text = "the connection dropped while the Runner restarted; checking..."; paintTasks(); setTimeout(poll, 5000);
    });
  }

  function runUpgradeNow() {
    var items = upgradeTargets().map(function (r) { var m = approvedRunner(r.name); return m && { runnerId: m.runnerId, name: r.name, state: "waiting", text: "starting..." }; }).filter(Boolean);
    if (!items.length) return;
    upgradeOp = { items: items, busy: true };
    paintTasks();
    items.forEach(upgradeOne);
  }

  tasksBox.addEventListener("click", function (event) {
    var id = event.target.id;
    if (id === "cleanup-run") runCleanupNow();
    else if (id === "cleanup-settings") { cleanupEdit = !cleanupEdit; cleanupOp = null; paintTasks(); }
    else if (id === "cleanup-cancel") { cleanupEdit = false; cleanupOp = null; paintTasks(); }
    else if (id === "cleanup-save") saveCleanup();
    else if (id === "backup-run") runBackupNow();
    else if (id === "os-run") { osOp = { asking: true, typed: "" }; paintTasks(); var box = document.getElementById("os-typed"); if (box) box.focus(); }
    else if (id === "os-cancel") { osOp = null; paintTasks(); }
    else if (id === "os-go") runOsUpdates();
    else if (id === "restart-now" || id === "restart-tonight") {
      restartOp = { asking: true, typed: "", at: id === "restart-tonight" ? tonight().toISOString() : null }; paintTasks();
      var rbox = document.getElementById("restart-typed"); if (rbox) rbox.focus();
    }
    else if (id === "restart-cancel") { restartOp = null; paintTasks(); }
    else if (id === "restart-go") runRestart();
    else if (id === "upgrade-run") runUpgradeNow();
  });

  tasksBox.addEventListener("input", function (event) {
    if (event.target.id === "restart-typed" && restartOp) {
      restartOp.typed = event.target.value;
      var rgo = document.getElementById("restart-go");
      if (rgo) rgo.disabled = restartOp.typed !== chosenName();
      return;
    }
    if (event.target.id !== "os-typed" || !osOp) return;
    osOp.typed = event.target.value;
    var go = document.getElementById("os-go");
    if (go) go.disabled = osOp.typed !== chosenName();
  });

  fetch("api/tasks", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) { isAdmin = data.admin === true; paintTasks(); }).catch(function () { /* read-only */ });
  loadRestart().then(paintTasks).catch(function () { /* older server */ });

  UI.bindThemeToggle();
  load();
  loadMaintenance();
  setInterval(loadMaintenance, 60000);
  loadCleanup();
  setInterval(loadCleanup, 30000);
  setInterval(load, 30000);
  setInterval(function () { UI.updateRelativeTimes(document); }, 30000);
})();
