// Server Keeper page. Built only from the Automaton app UI kit in ui/.
(function () {
  "use strict";

  var UI = window.AutomatonUI;
  var esc = UI.escapeHtml;
  var view = document.getElementById("view");
  var subtitle = document.getElementById("subtitle");
  var LABELS = { ok: "OK", warning: "Needs attention", critical: "Action needed", unknown: "No data" };

  // Status words. Healthy is neutral grey, attention is orange, failure is red; the word is always shown.
  function pill(status, text) {
    var cls = status === "warning" ? " s-pill--attn" : status === "critical" ? " s-pill--bad" : status === "ok" ? "" : " s-pill--off";
    return '<span class="s-pill' + cls + '">' + esc(text || LABELS[status] || LABELS.unknown) + "</span>";
  }

  function card(title, status, body, foot) {
    return '<section class="a-card" id="' + esc(title.toLowerCase().replace(/\s+/g, "-")) + '"><div class="a-card__head"><h2 class="a-card__title">' + esc(title) + "</h2>" + (status ? pill(status) : "") + "</div>" +
      body + (foot ? '<p class="a-card__foot">' + foot + "</p>" : "") + "</section>";
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

  function when(iso) { return iso ? '<time datetime="' + esc(iso) + '" data-rel></time>' : "never"; }

  function clock(seconds) {
    var d = new Date(seconds * 1000), two = function (n) { return (n < 10 ? "0" : "") + n; };
    return two(d.getHours()) + ":" + two(d.getMinutes());
  }

  function barClass(status) { return status === "warning" ? " bar--warning" : status === "critical" ? " bar--critical" : ""; }

  function sparkTile(name, value, status, history, key, sub) {
    var shown = pct(value);
    var series = history.map(function (item) { return item[key]; });
    return '<div class="tile"><div class="tile__row"><span class="tile__name">' + esc(name) + '</span><span class="tile__value">' + (shown === null ? "-" : esc(String(shown)) + "%") + "</span></div>" +
      '<div class="bar' + barClass(status) + '" style="--value:' + (shown === null ? 0 : Math.min(100, shown)) + '%"><span></span></div>' +
      UI.sparkline(series, key === "cpu" ? { min: 0, max: 100, status: status, label: name + ", last 24 hours" } : { status: status, label: name + ", last 24 hours" }) +
      '<div class="tile__sub">' + sub + "</div></div>";
  }

  var diskOpen = false;

  function diskTile(h, a, history, data) {
    var host = h.host || {};
    var used = typeof host.diskTotalBytes === "number" && host.diskTotalBytes > 0 ? 100 - 100 * host.diskAvailableBytes / host.diskTotalBytes : null;
    var shown = pct(used);
    var warnAt = 100 - data.settings.diskFreePercent;
    var rc = data.reclaim || {};
    var free = typeof host.diskAvailableBytes === "number" && typeof host.diskTotalBytes === "number" ? esc(bytes(host.diskAvailableBytes)) + " free of " + esc(bytes(host.diskTotalBytes)) : "No disk figures";
    var details = "";
    if (diskOpen) {
      var usedBytes = typeof host.diskTotalBytes === "number" && typeof host.diskAvailableBytes === "number" ? host.diskTotalBytes - host.diskAvailableBytes : null;
      var rest = usedBytes !== null && typeof rc.total === "number" ? Math.max(0, usedBytes - rc.total) : null;
      details = rc.total ? '<dl class="dk"><div><dt>Docker images</dt><dd>' + esc(bytes(rc.images)) + "</dd></div><div><dt>Volumes</dt><dd>" + esc(bytes(rc.volumes)) + "</dd></div><div><dt>Build cache</dt><dd>" + esc(bytes(rc.buildCache)) +
        "</dd></div>" + (rest === null ? "" : "<div><dt>The rest</dt><dd>" + esc(bytes(rest)) + "</dd></div>") + "<div><dt>Can be freed</dt><dd><strong>up to " + esc(bytes(rc.freeable)) + "</strong></dd></div></dl>"
        : '<p class="tile__sub">Docker disk use is not reported for this machine.</p>';
    }
    return '<div class="tile" id="disk"><div class="tile__row"><span class="tile__name">Disk</span><span class="tile__value">' + (shown === null ? "-" : esc(String(shown)) + "%") + "</span></div>" +
      '<div class="bar' + barClass(a.disk) + '" style="--value:' + (shown === null ? 0 : Math.min(100, shown)) + "%;--mark:" + warnAt + '%"><span></span></div>' +
      UI.sparkline(history.map(function (item) { return item.disk; }), { status: a.disk, label: "Disk, last 24 hours" }) +
      '<div class="tile__sub">' + free + ". Warning mark at " + esc(String(warnAt)) + "%.</div>" +
      '<button type="button" class="tile__toggle" data-act="disk-toggle" aria-expanded="' + diskOpen + '">' + (diskOpen ? "Hide details" : "Show details") + "</button>" + details + "</div>";
  }

  function tiles(h, a, history, data) {
    var host = h.host || {};
    var memoryUsed = typeof host.memoryTotalBytes === "number" && host.memoryTotalBytes > 0 ? 100 - 100 * host.memoryAvailableBytes / host.memoryTotalBytes : null;
    var load = typeof host.load1 === "number" ? "Load " + [host.load1, host.load5, host.load15].map(function (v) { return v.toFixed(2); }).join(" · ") : "Load not reported";
    var cores = host.cpuCount ? plural(host.cpuCount, "core") + ". " : "";
    var memSub = typeof host.memoryTotalBytes === "number" && typeof host.memoryAvailableBytes === "number" ? esc(bytes(host.memoryTotalBytes - host.memoryAvailableBytes)) + " of " + esc(bytes(host.memoryTotalBytes)) + " used" : "No memory figures";
    return '<section class="tiles" aria-label="Resources">' + sparkTile("CPU", host.cpuPercent, a.cpu, history, "cpu", esc(cores + load)) +
      sparkTile("Memory", memoryUsed, a.memory, history, "mem", memSub) + diskTile(h, a, history, data) + "</section>";
  }

  // --- Needs you: one card per item, one action each. ----------------------------------------------------------------

  function needAction(item, data) {
    var title = item.title || "";
    if (item.card === "updates" && /^Install/.test(title)) return isAdmin ? { act: "os-install", label: "Install updates…", primary: true } : { act: "go-maintenance", label: "Open Maintenance" };
    if (item.card === "updates") return { act: "go-maintenance", label: "Restart…", primary: isAdmin };
    if (item.card === "resources" && /disk/i.test(title) && data.reclaim && data.reclaim.freeable > 0 && isAdmin) return { act: "cleanup-run", label: "Free it now", primary: true };
    if (item.card === "runners") return { act: "go-maintenance", label: "Upgrade Runners" };
    if (item.card === "backups") return { act: "go-maintenance", label: "Open Maintenance" };
    if (item.card === "server" && data.studioBase) return { href: data.studioBase + "/server", label: "Open in Studio" };
    return null;
  }

  function needs(data) {
    var items = data.attention || [];
    if (!items.length) return "";
    return '<section class="needs" aria-label="Needs you">' + items.map(function (i) {
      var action = needAction(i, data);
      var button = !action ? "" : action.href ? '<a class="a-btn" target="_blank" rel="noopener" href="' + esc(action.href) + '">' + esc(action.label) + "</a>"
        : '<button type="button" class="a-btn' + (action.primary ? " a-btn--primary" : "") + '" data-act="' + esc(action.act) + '">' + esc(action.label) + "</button>";
      return '<div class="need' + (i.level === "critical" ? " need--critical" : "") + '"><div class="need__text"><strong>' + esc(i.title) + "</strong><span>" + esc(i.detail || "") +
        (i.command ? ' <code class="a-mono">' + esc(i.command) + "</code>" : "") + "</span></div>" + button + "</div>";
    }).join("") + "</section>";
  }

  function banner(data) {
    return data.status !== "ok" && data.status !== "starting" ? '<div class="a-note a-note--warning" style="margin:0">Last read failed' + (data.failedAt ? " at " + clock(data.failedAt) : "") + ": " + esc(data.message || "no reason was reported (status " + (data.status || "unknown") + ")") +
      ". Showing figures from " + (data.fetchedAt ? clock(data.fetchedAt) : "an earlier check") + ".</div>" : "";
  }

  function line(name, status, text, action) {
    return '<li class="ln"><div class="ln__main"><span class="ln__name">' + esc(name) + '</span><span class="ln__text">' + text + "</span></div>" +
      '<div class="ln__act">' + pill(status) + (action || "") + "</div></li>";
  }

  function go(label, act) { return '<button type="button" class="link" data-act="' + (act || "go-maintenance") + '">' + esc(label) + "</button>"; }

  function healthList(h, a, data) {
    var host = h.host || {};
    var security = host.securityUpdates;
    var counts = typeof security !== "number" || typeof host.updatesPending !== "number" ? "unknown" : "up to date";
    var updates = counts === "unknown" ? "Update counts need Ubuntu's update notifier on the server."
      : (host.updatesPending ? plural(host.updatesPending, "update") + " waiting, " + security + " security" : "All updates installed") + (host.rebootRequired ? ". Restart needed." : ".");
    var certs = (h.certificates || []).map(function (c) { return c.daysRemaining; }).filter(function (d) { return typeof d === "number"; });
    var runners = h.runners || [];
    var online = runners.filter(function (r) { return String(r.status || "").toLowerCase() === "online"; }).length;
    var old = runners.filter(function (r) { return r.upgradeAvailable; }).length;
    var b = h.backup || {};
    var f = data.fail2ban;
    var rows = line("OS updates", a.updates, esc(updates), host.updatesPending > 0 && isAdmin ? go("Install…", "os-install") : go("Open")) +
      line("Certificates", a.certificates, certs.length ? "Next expires in " + esc(plural(Math.min.apply(null, certs), "day")) : "No HTTPS host names", "") +
      line("Runners", a.runners, runners.length ? esc(online + " of " + runners.length + " online" + (old ? ", " + old + " can be upgraded" : ", all current")) : "No Runners registered", old ? go("Upgrade") : "") +
      line("Backups", a.backup, b.available && b.lastSuccessAt ? "Last backup " + esc(ago(b.lastSuccessAgeHours * 3600).replace("less than a minute ago", "just now")) : b.available ? "No successful backup yet" : "No backup status yet", go("Open")) +
      line("fail2ban", f ? (f.running ? "ok" : "warning") : "unknown", f ? (f.running ? "On, " + esc(f.banned + (f.banned === 1 ? " address" : " addresses")) + " banned in 24 h" : "Not running") : "Needs the security:read approval", "");
    return '<section class="a-card" id="health"><div class="a-card__head"><h2 class="a-card__title">Health</h2></div><ul class="a-list scroll" style="list-style:none;margin:0;padding:0">' + rows + "</ul></section>";
  }

  function maintenanceList(h, a, data) {
    var host = h.host || {};
    var rc = data.reclaim || {};
    var last = cleanupInfo && !cleanupInfo.needsApproval && (cleanupInfo.runs || [])[0];
    var b = h.backup || {};
    var old = (h.runners || []).filter(function (r) { return r.upgradeAvailable; }).length;
    var cleanupText = !cleanupInfo ? "Reading…" : cleanupInfo.needsApproval ? "Needs approval" : (last ? "Last run " + when(last.startedAtUtc) + (last.result === "succeeded" ? ", freed " + esc(bytes(last.bytesFreed)) : ", " + esc(last.result)) : "Never run") +
      (typeof rc.freeable === "number" && rc.freeable > 0 ? ". " + esc(bytes(rc.freeable)) + " can be freed" : "");
    var info = restartInfo || {};
    var rows = line("Cleanup", cleanupInfo && !cleanupInfo.needsApproval && cleanupInfo.warning ? "warning" : last && last.result === "failed" ? "warning" : last ? "ok" : "unknown", cleanupText,
        isAdmin && typeof rc.freeable === "number" && rc.freeable > 0 ? '<button type="button" class="link" data-act="cleanup-run">Free it now</button>' : go("Open")) +
      line("Backup", a.backup, b.lastSuccessAt ? "Last backup " + when(b.lastSuccessAt) : "No backup yet", isAdmin ? '<button type="button" class="link" data-act="backup-run">Run now</button>' : go("Open")) +
      line("Upgrade Runners", old ? "warning" : "ok", old ? plural(old, "Runner") + " can be upgraded" : "All Runners are current", go("Open")) +
      line("OS updates", a.updates, typeof host.updatesPending === "number" ? plural(host.updatesPending, "update") + " waiting" : "Counts unknown", isAdmin && host.updatesPending > 0 ? go("Install…", "os-install") : go("Open")) +
      line("Restart server", info.state === "scheduled" ? "warning" : "ok", info.state === "scheduled" && info.restartAtUtc ? "Scheduled for " + when(info.restartAtUtc) : info.lastRestartedAtUtc ? "Last restarted " + when(info.lastRestartedAtUtc) : "Not restarted from here yet", go("Open"));
    return '<section class="a-card" id="maintenance-list"><div class="a-card__head"><h2 class="a-card__title">Maintenance</h2>' + go("All tasks") + '</div><ul class="a-list scroll" style="list-style:none;margin:0;padding:0">' + rows + "</ul></section>";
  }

  function headline(h, a, data) {
    var host = h.host || {};
    var s = h.server || {};
    var count = (data.attention || []).length;
    var text = count ? (count === 1 ? "1 thing needs you" : count + " things need you") : a.overall === "ok" ? "Everything is healthy" : a.overall === "unknown" ? "Some figures unknown" : "Needs attention";
    var meta = [data.machine, s.version ? "Automaton " + s.version + (s.updateAvailable === false ? " (latest)" : s.updateAvailable === true ? " (update available)" : "") : "", host.osName,
      typeof host.uptimeSeconds === "number" ? "up " + UI.formatDuration(host.uptimeSeconds) : ""].filter(Boolean).map(esc).join(" · ");
    return '<div class="head"><h2 class="head__title">' + esc(text) + '</h2><span class="head__meta">' + meta + "</span></div>";
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

  // --- Tabs ----------------------------------------------------------------------------------------------------------

  var TABS = ["overview", "maintenance", "apps"];
  var tabNow = "overview";

  function showTab(name) {
    if (TABS.indexOf(name) < 0) return;
    tabNow = name;
    TABS.forEach(function (t) {
      var on = t === name;
      var button = document.getElementById("tab-" + t), panel = document.getElementById("panel-" + t);
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
      button.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      panel.classList.toggle("is-on", on);
    });
    if (name === "apps") paintApps();
    UI.updateRelativeTimes(document);
  }

  document.getElementById("tabs").addEventListener("keydown", function (event) {
    var at = TABS.indexOf(tabNow), next = event.key === "ArrowRight" ? at + 1 : event.key === "ArrowLeft" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    showTab(TABS[(next + TABS.length) % TABS.length]);
    document.getElementById("tab-" + tabNow).focus();
  });

  // --- Apps on this machine ------------------------------------------------------------------------------------------

  var appsBox = document.getElementById("apps-box");
  var appSel = null, appQuery = "", appGroup = "all", appSort = { key: "state", dir: 1 };
  var appShell = false;

  // One entry per app on the chosen machine: the server's app list (state, deploy time) joined with the Runner's disk figures by app id.
  function appList(data) {
    var status = data.apps, disk = data.appDisk || [];
    var byDisk = {}, ids = {};
    disk.forEach(function (d) { if (d.appId) byDisk[d.appId] = d; });
    var rows = [], leftBytes = 0, leftCount = 0;
    var multi = (data.machines || []).length > 1;
    (status || []).forEach(function (a) {
      if (disk.length && multi && !byDisk[a.id]) return; // an app that runs on another machine
      ids[a.id] = true;
      rows.push(makeApp(a, byDisk[a.id]));
    });
    disk.forEach(function (d) {
      if (d.appId && ids[d.appId]) return;
      if (status === null || status === undefined) { rows.push(makeApp({ id: d.appId, name: d.name, status: "", paused: false }, d)); return; }
      leftBytes += d.totalBytes; leftCount++;
    });
    if (leftCount) rows.push({ key: "left", id: null, name: "Left by deleted apps", group: "Other", level: 1, state: "Data only", disk: leftBytes, parts: null, left: true, count: leftCount });
    return rows;
  }

  function makeApp(a, d) {
    var s = String(a.status || "");
    var level = 0, state = "Running";
    if (a.paused) { level = 1; state = "Paused"; }
    else if (s === "Failed") { level = 3; state = "Failing"; }
    else if (s === "RunnerOffline") { level = 3; state = "Runner offline"; }
    else if (s === "Deploying") { level = 2; state = "Deploying"; }
    else if (s === "NotDeployed" || s === "Unassigned") { level = 1; state = "Not deployed"; }
    else if (!s) { level = 1; state = "Unknown"; }
    return { key: a.id || "n:" + a.name, id: a.id || null, name: a.name || "(unknown app)", group: a.category || "Other", level: level, state: state, disk: d ? d.totalBytes : null,
      parts: d || null, deployedAt: a.deployedAt || null, error: a.error || null };
  }

  function stateClass(level) { return level >= 3 ? "bad" : level === 2 ? "attn" : ""; }
  function statePill(row) { return '<span class="s-pill' + (row.level >= 3 ? " s-pill--bad" : row.level === 2 ? " s-pill--attn" : row.level === 1 ? " s-pill--off" : "") + '">' + esc(row.state) + "</span>"; }

  function filtered(rows) {
    var q = appQuery.trim().toLowerCase();
    return rows.filter(function (r) {
      if (appGroup === "trouble" ? r.level < 2 || r.left : appGroup !== "all" && r.group !== appGroup) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0;
    });
  }

  function sorted(rows) {
    var k = appSort.key, dir = appSort.dir;
    var val = function (r) { return k === "app" ? r.name.toLowerCase() : k === "function" ? r.group.toLowerCase() : k === "disk" ? (typeof r.disk === "number" ? r.disk : -1) : -r.level; };
    return rows.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      var c = (x < y ? -1 : x > y ? 1 : 0) * (k === "disk" ? -dir : dir);
      return c || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
    });
  }

  function ensureAppShell() {
    if (appShell) return;
    appShell = true;
    appsBox.innerHTML = '<div class="apps"><div class="apps__left"><input class="a-input" id="app-search" type="search" placeholder="Search apps" aria-label="Search apps" autocomplete="off" spellcheck="false">' +
      '<div><div class="a-hint" style="margin-bottom:6px" id="map-title"></div><div class="map" id="app-map" role="group" aria-label="Machine map"></div><div class="legend" id="app-legend"></div></div>' +
      '<div class="chips" id="app-chips" role="group" aria-label="Group by function"></div></div>' +
      '<div class="apps__right"><div id="app-detail" class="detail"></div><section class="a-card tablebox" aria-label="Apps"><div class="scroll" id="app-table"></div></section></div></div>';
    document.getElementById("app-search").addEventListener("input", function (e) { appQuery = e.target.value; paintAppParts(); });
  }

  function paintApps() {
    if (!lastData) return;
    ensureAppShell();
    paintAppParts();
  }

  function paintAppParts() {
    if (!appShell || !lastData) return;
    var all = appList(lastData), rows = filtered(all);
    var offline = ((lastData.machines || []).filter(function (m) { return m.name === lastData.machine && !m.online; })).length > 0;
    var real = all.filter(function (r) { return !r.left; });
    var sel = all.filter(function (r) { return r.key === appSel; })[0];
    if (!sel && real.length) { sel = sorted(real)[0]; appSel = sel.key; }
    var trouble = real.filter(function (r) { return r.level >= 2; });
    document.getElementById("map-title").textContent = real.length ? plural(real.length, "app") + " on " + (lastData.machine || "this machine") + (trouble.length ? ", " + trouble.length + " in trouble" : "") : "";
    document.getElementById("app-map").innerHTML = real.map(function (r) {
      var shown = rows.indexOf(r) >= 0;
      return '<button type="button" class="sq' + (r.level >= 3 ? " sq--bad" : r.level === 2 ? " sq--attn" : r.level === 1 ? " sq--paused" : "") + (r.key === appSel ? " is-sel" : "") + (shown ? "" : " is-dim") +
        '" data-app="' + esc(r.key) + '" title="' + esc(r.name + ": " + r.state) + '" aria-label="' + esc(r.name + ", " + r.state) + '" aria-pressed="' + (r.key === appSel) + '"></button>';
    }).join("");
    document.getElementById("app-legend").innerHTML = real.length ? '<span><i style="background:color-mix(in srgb, var(--neutral) 25%, var(--surface));border:1px solid var(--neutral)"></i>Running</span><span><i style="border:1px dashed var(--neutral)"></i>Paused or not deployed</span><span><i style="background:var(--orange)"></i>Needs a look</span><span><i style="background:var(--critical)"></i>Failing</span>' : "";
    var groups = {};
    real.forEach(function (r) { groups[r.group] = (groups[r.group] || 0) + 1; });
    var names = Object.keys(groups).sort(function (a, b) { return a === "Other" ? 1 : b === "Other" ? -1 : groups[b] - groups[a] || (a < b ? -1 : 1); });
    var chip = function (key, label, n) { return '<button type="button" class="chip' + (appGroup === key ? " is-on" : "") + '" data-group="' + esc(key) + '" aria-pressed="' + (appGroup === key) + '">' + esc(label) + "<b>" + n + "</b></button>"; };
    document.getElementById("app-chips").innerHTML = real.length ? chip("all", "All", real.length) + (trouble.length ? chip("trouble", "In trouble", trouble.length) : "") + names.map(function (n) { return chip(n, n, groups[n]); }).join("") : "";
    document.getElementById("app-detail").innerHTML = detailCard(sel, offline);
    var cols = [["app", "App", ""], ["function", "Function", ""], ["state", "State", ""], [null, "CPU", " num"], [null, "Memory", " num"], ["disk", "Disk", " num"]];
    var head = cols.map(function (c) {
      var on = c[0] && appSort.key === c[0];
      return '<th class="' + c[2].trim() + '"' + (on ? ' aria-sort="' + (appSort.dir > 0 ? "ascending" : "descending") + '"' : "") + ">" + (c[0] ? '<button type="button" data-sort="' + c[0] + '">' + c[1] + (on ? (appSort.dir > 0 ? " ↑" : " ↓") : "") + "</button>" : c[1]) + "</th>";
    }).join("");
    var body = sorted(rows).map(function (r) {
      return '<tr class="app' + (r.key === appSel ? " is-sel" : "") + '" data-app="' + esc(r.key) + '"><td class="nm"><button type="button" data-app="' + esc(r.key) + '" aria-pressed="' + (r.key === appSel) + '">' + esc(r.name) + "</button>" + (r.left ? '<div class="a-hint">' + esc(plural(r.count, "leftover")) + "</div>" : "") + '</td><td class="fn">' + esc(r.group) + '</td><td class="st">' + statePill(r) +
        '</td><td class="num cpu muted">-</td><td class="num mem muted">-</td><td class="num dk-c">' + (typeof r.disk === "number" ? esc(bytes(r.disk)) : "-") + "</td></tr>";
    }).join("");
    document.getElementById("app-table").innerHTML = real.length || rows.length
      ? '<table class="at"><thead><tr>' + head + "</tr></thead><tbody>" + (body || '<tr><td colspan="6" class="muted">No app matches.</td></tr>') + "</tbody></table>"
      : '<div class="a-empty"><div class="a-empty__title">' + (lastData.apps === null || lastData.apps === undefined ? "No app list yet" : "No apps on this machine") + "</div>" +
        (lastData.apps === null || lastData.apps === undefined ? "Server Keeper needs the apps:read-status approval to list apps." : "Apps appear here when they run on this machine.") + "</div>";
  }

  function detailCard(r, offline) {
    if (!r) return "";
    var item = maintainedRunner();
    var target = item && item.approved && !r.left ? ((appsByRunner[item.runnerId] || []).filter(function (a) { return a.name === r.name; })[0]) : null;
    var can = isAdmin && target && !offline;
    var why = !isAdmin ? "Only a system administrator can do this." : !item || !item.approved ? "Maintenance on this machine is not approved for this app." : !target ? "This app was not found on the machine." : "";
    var busy = tool && tool.app === r.name && tool.busy;
    var p = r.parts || {};
    var image = p.imageBytes || 0, data = p.dataBytes || 0, other = (p.filesBytes || 0) + (p.containerBytes || 0) + (p.logsBytes || 0), total = (image + data + other) || 0;
    var w = function (n) { return total ? Math.round(100 * n / total) : 0; };
    var out = "";
    if (tool && tool.app === r.name && !tool.busy && (tool.error || tool.text)) {
      out = tool.error ? '<p class="a-note a-note--warning" id="tool-result">' + esc(tool.error) + "</p>" : '<pre class="a-code tool-out" id="tool-result">' + esc(tool.text) + "</pre>";
    }
    var facts = r.left ? '<span class="a-hint">Data left on the machine by apps that no longer exist.</span>' :
      "<span>" + esc(r.group) + "</span>" + (r.deployedAt ? '<span>Deployed <time datetime="' + esc(String(r.deployedAt)) + '" data-rel></time></span>' : "") + (r.error ? '<span class="a-hint">' + esc(r.error) + "</span>" : "");
    var actions = r.left ? "" : '<button type="button" class="a-btn" data-act="app-logs"' + (can && !busy ? "" : " disabled") + (why ? ' title="' + esc(why) + '"' : "") + ">Logs</button>" +
      '<button type="button" class="a-btn" data-act="app-restart"' + (can && !busy ? "" : " disabled") + (why ? ' title="' + esc(why) + '"' : "") + ">Restart app…</button>" +
      (lastData.studioBase && r.id ? '<a class="a-btn" target="_blank" rel="noopener" href="' + esc(lastData.studioBase + "/apps/" + r.id) + '">Open in Studio</a>' : "");
    return '<section class="a-card" aria-label="Selected app"><div class="detail__head"><div><h2 class="detail__name">' + esc(r.name) + '</h2><div class="detail__facts">' + facts + "</div></div>" +
      '<div class="detail__act">' + statePill(r) + actions + "</div></div>" +
      '<div class="figs"><div class="fig"><b>-</b><span>CPU, not reported yet</span></div><div class="fig"><b>-</b><span>Memory, not reported yet</span></div><div class="fig"><b>' + (typeof r.disk === "number" ? esc(bytes(r.disk)) : "-") + "</b><span>Disk</span></div></div>" +
      (total ? '<div class="split" role="img" aria-label="Disk split"><span class="p1" style="width:' + w(image) + '%"></span><span class="p2" style="width:' + w(data) + '%"></span><span class="p3" style="width:' + w(other) + '%"></span></div><div class="splitkey"><span>Image ' + esc(bytes(image)) + "</span><span>Data " + esc(bytes(data)) + "</span><span>Files and logs " + esc(bytes(other)) + "</span></div>" : "") +
      (busy ? '<p class="a-hint">Working…</p>' : "") + out + "</section>";
  }

  appsBox.addEventListener("click", function (event) {
    var pick = event.target.closest("[data-app]"), chipEl = event.target.closest("[data-group]"), sortEl = event.target.closest("[data-sort]");
    if (sortEl) { var k = sortEl.getAttribute("data-sort"); appSort = appSort.key === k ? { key: k, dir: -appSort.dir } : { key: k, dir: 1 }; return paintAppParts(); }
    if (chipEl) { appGroup = chipEl.getAttribute("data-group"); return paintAppParts(); }
    if (pick) {
      appSel = pick.getAttribute("data-app");
      if (tool && tool.app && tool.app !== selectedName()) tool = null;
      paintAppParts();
      var row = appsBox.querySelector('tr.app[data-app="' + (window.CSS && CSS.escape ? CSS.escape(appSel) : appSel) + '"]');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
      if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) { var d = document.getElementById("app-detail"); if (d && d.scrollIntoView) d.scrollIntoView({ block: "start" }); }
    }
  });

  function selectedName() {
    var r = lastData && appList(lastData).filter(function (x) { return x.key === appSel; })[0];
    return r ? r.name : null;
  }

  // --- Overview ------------------------------------------------------------------------------------------------------

  function dashboard(data) {
    var h = data.health, a = data.assessment;
    var history = data.history || [];
    var machine = (data.machines || []).filter(function (item) { return item.name === data.machine; })[0];
    var offline = machine && !machine.online;
    paintPicker(data);
    view.innerHTML = '<div class="ov">' + banner(data) + headline(h, a, data) + needs(data) +
      (offline ? offlineCard(data) : tiles(h, a, history, data) + '<div class="lists">' + healthList(h, a, data) + maintenanceList(h, a, data) + "</div>") + "</div>";
    subtitle.innerHTML = "Checked " + (data.fetchedAt ? '<time datetime="' + new Date(data.fetchedAt * 1000).toISOString() + '" data-rel></time>' : "never");
    paintRuns();
    if (tabNow === "apps") paintApps();
    UI.updateRelativeTimes(document);
  }

  function refreshOverview() { if (lastData && lastData.health) dashboard(lastData); }

  // --- Recent runs (beside the Maintenance table) --------------------------------------------------------------------

  function paintRuns() {
    var box = document.getElementById("runs-box");
    if (!lastData) return;
    var items = (lastData.runs || []).map(function (r) {
      var text = r.result === "started" ? r.task + " started" : r.task + (r.result === "refused" ? " refused" : " failed") + (r.detail ? ": " + r.detail : "");
      return { at: r.at, text: text, bad: r.result !== "started" };
    });
    if (cleanupInfo && !cleanupInfo.needsApproval) (cleanupInfo.runs || []).forEach(function (r) {
      var at = Date.parse(r.startedAtUtc) / 1000;
      if (!isFinite(at)) return;
      var text = r.result === "succeeded" ? "Cleanup on " + (r.runnerName || "the server") + " freed " + bytes(r.bytesFreed) : r.result === "failed" ? "Cleanup on " + (r.runnerName || "the server") + " failed" + (r.message ? ": " + r.message : "") : "Cleanup on " + (r.runnerName || "the server") + " " + r.result;
      items.push({ at: at, text: text, bad: r.result === "failed" });
    });
    items.sort(function (x, y) { return y.at - x.at; });
    box.innerHTML = '<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Recent runs</h2></div>' + (items.length ? '<ul class="runs">' + items.slice(0, 15).map(function (i) {
      return "<li><span>" + (i.bad ? '<span class="s-pill s-pill--bad">Problem</span> ' : "") + esc(i.text) + '</span><span class="ln__text"><time datetime="' + esc(new Date(i.at * 1000).toISOString()) + '" data-rel></time></span></li>';
    }).join("") + "</ul>" : '<div class="a-empty" style="padding:20px 8px"><div class="a-empty__title">No runs yet</div>Maintenance started from here is listed in this box.</div>') + "</section>";
    UI.updateRelativeTimes(box);
  }

  function waiting(title, lead, steps) {
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
    view.innerHTML = '<div class="a-empty"><div class="a-empty__title">No figures yet</div><p>' + message + "</p></div>";
    subtitle.textContent = data.status === "starting" ? "Starting" : "No data";
  }

  // The gateway answers 401 when the viewer's app session ended. That is not a server error: say so, keep the last figures
  // (greyed) and offer to sign in again; reloading the page goes through sign-in.
  var sessionBox = document.getElementById("session-ended");
  function sessionEnded(ended) {
    sessionBox.hidden = !ended;
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) { p.style.opacity = ended && lastData ? "0.5" : ""; });
    if (ended && !lastData) view.innerHTML = "";
  }
  document.getElementById("session-signin").addEventListener("click", function (e) { e.preventDefault(); location.reload(); });

  function load() {
    fetch("api/state" + (chosen ? "?machine=" + encodeURIComponent(chosen) : ""), { cache: "no-store" }).then(function (response) {
      if (response.status === 401) return sessionEnded(true);
      return response.json().then(function (data) {
        if (data.status === 401 || data.status === "401") return sessionEnded(true);
        sessionEnded(false);
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
    var busy = tool && tool.runner === item.runnerId && tool.busy && tool.kind === "disk";
    var out = "";
    if (tool && tool.kind === "disk" && tool.runner === item.runnerId && !tool.busy) {
      out = tool.error ? '<p class="a-note a-note--warning" id="disk-result">' + esc(tool.error) + "</p>"
        : '<pre class="a-code" id="disk-result" style="max-height:20rem;overflow:auto;white-space:pre-wrap">' + esc(tool.text) + "</pre>";
    }
    return '<p><button class="a-btn" type="button" id="disk-report"' + (busy || offline ? " disabled" : "") + ">Disk report</button>" + (busy ? ' <span class="a-hint">Working...</span>' : "") +
      ' <span class="a-hint">Logs and restart of one app are in the Apps tab.</span></p>' + out;
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
        if (data.status === "ok" && Array.isArray(data.data)) { appsByRunner[item.runnerId] = data.data; paintMaintenance(); paintAppParts(); }
      });
    }).catch(function () { /* keep what is shown */ });
  }

  function repaintTool() { paintMaintenance(); paintAppParts(); }

  function runTool(kind, appName) {
    var item = maintainedRunner();
    if (!item) return;
    var found = (appsByRunner[item.runnerId] || []).filter(function (a) { return a.name === appName; })[0];
    var picked = found ? found.targetId : "";
    if (kind !== "disk" && !picked) { tool = { runner: item.runnerId, kind: kind, app: appName, error: "That app was not found on this machine." }; return repaintTool(); }
    if (kind === "restart" && !window.confirm("Restart " + appName + " on " + item.name + "? It is unavailable for a short while.")) return;
    tool = { runner: item.runnerId, kind: kind, app: appName, busy: true };
    repaintTool();
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
        repaintTool();
      });
    }).catch(function () {
      if (kind !== "restart") { tool.busy = false; tool.error = "The app could not be reached."; repaintTool(); return; }
      // The Runner resets its connections while it restarts an app, which can drop this answer although the restart worked.
      setTimeout(function () {
        if (!tool || tool.runner !== item.runnerId) return;
        tool.busy = false;
        tool.text = "The restart was sent, but the connection dropped while the Runner restarted the app. Check the status above.";
        loadApps(item);
        repaintTool();
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
        paintAppParts();
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
    else if (event.target.id === "disk-report") runTool("disk", null);
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

  function row(id, name, does, status, last, next, actions, notes) {
    return '<tr id="task-' + id + '" class="t-row"><td data-label="Task"><div class="t-name">' + esc(name) + '</div><div class="t-does">' + esc(does) + "</div></td>" +
      '<td class="t-last" data-label="Last run">' + pill(status) + '<div class="a-hint" style="margin-top:4px">' + last + "</div></td>" +
      '<td class="t-next" data-label="Next run">' + next + '</td><td data-label="Actions"><div class="t-act">' + (actions || "") + "</div>" +
      notes.filter(Boolean).map(function (n) { return '<div class="t-note">' + n + "</div>"; }).join("") + "</td></tr>";
  }

  function cleanupRow() {
    var does = "Frees Docker images no app uses, old build cache and journal files.";
    if (!cleanupInfo || cleanupInfo.needsApproval) return row("cleanup", "Cleanup", does, "unknown", esc(APPROVAL), "-", "", []);
    var last = (cleanupInfo.runs || [])[0];
    var running = last && (last.result === "queued" || last.result === "running");
    var status = cleanupInfo.warning || (last && last.result === "failed") ? "warning" : last && last.result === "succeeded" ? "ok" : "unknown";
    var rc = (lastData && lastData.reclaim) || {};
    var result = running ? "Cleaning up on " + esc(last.runnerName) + "..." : last ? "Last run " + when(last.startedAtUtc) + ", " + (last.result === "succeeded" ? "freed " + esc(bytes(last.bytesFreed)) : esc(last.result)) + (last.result === "failed" && last.message ? ": " + esc(last.message) : "") : "Never run.";
    var next = "Nightly at " + esc(cleanupInfo.settings.timeUtc) + " UTC<br>" + when(cleanupInfo.nextRunAtUtc) + '<div class="a-hint">keeps ' + esc(String(cleanupInfo.settings.keepDays)) + " days, journal limit " + esc(String(cleanupInfo.settings.journalLimitMb)) + " MB</div>";
    var freeable = typeof rc.freeable === "number" && rc.freeable > 0 ? '<div><strong>' + esc(bytes(rc.freeable)) + "</strong> can be freed now.</div>" : "";
    var actions = "", form = "";
    if (isAdmin) {
      actions = '<button class="a-btn a-btn--primary" type="button" id="cleanup-run"' + (running ? " disabled" : "") + ">" + (running ? "Running..." : "Free it now") + '</button> <button class="a-btn" type="button" id="cleanup-settings">Settings</button>';
      if (cleanupEdit) {
        var st = cleanupInfo.settings;
        form = '<div id="cleanup-form" class="task__form"><label>Time (UTC) <input class="a-input" id="cs-time" value="' + esc(st.timeUtc) + '" size="5"></label> <label>Keep days <input class="a-input" id="cs-keep" type="number" min="1" max="365" value="' + esc(String(st.keepDays)) + '"></label> ' +
          '<label>Journal limit (MB) <input class="a-input" id="cs-journal" type="number" min="50" max="100000" value="' + esc(String(st.journalLimitMb)) + '"></label> <button class="a-btn" type="button" id="cleanup-save">Save</button> <button class="a-btn" type="button" id="cleanup-cancel">Cancel</button></div>';
      }
    }
    return row("cleanup", "Cleanup", does, status, result + freeable, next, actions, [cleanupInfo.warning ? esc(cleanupInfo.warning) : "", cleanupOp && cleanupOp.error ? '<span class="a-note a-note--warning" id="cleanup-error">' + esc(cleanupOp.error) + "</span>" : "", form]);
  }

  function backupRow() {
    var h = lastData && lastData.health, a = lastData && lastData.assessment;
    var b = (h && h.backup) || {};
    var does = "Saves the server's data and settings.";
    if (!b.available) return row("backup", "Backup", does, "unknown", "No backup status yet. Run the latest server update to enable backups.", "-", "", []);
    var last = b.lastSuccessAt ? "Last backup " + when(b.lastSuccessAt) + " succeeded." : "No successful backup yet.";
    var op = backupOp;
    var note = !op ? "" : op.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (op.state === "failed" ? " a-note--warning" : "") + '" id="backup-result">' + esc(op.text) + "</span>";
    var busy = op && op.state === "waiting";
    return row("backup", "Backup", does, a ? a.backup : "unknown", last, "Nightly", isAdmin ? '<button class="a-btn" type="button" id="backup-run"' + (busy ? " disabled" : "") + ">" + (busy ? "Backing up..." : "Run now") + "</button>" : "",
      [b.lastError ? '<span class="a-note a-note--critical">' + esc(b.lastError) + "</span>" : "", note]);
  }

  function upgradeTargets() {
    var runners = (lastData && lastData.health && lastData.health.runners) || [];
    return runners.filter(function (r) { return r.upgradeAvailable && String(r.status || "").toLowerCase() === "online"; });
  }

  function approvedRunner(name) {
    return machinesMaintained.filter(function (m) { return m.name === name && m.approved; })[0];
  }

  function upgradeRow() {
    var does = "Brings old Runners up to the server's version.";
    var runners = (lastData && lastData.health && lastData.health.runners) || [];
    if (!runners.length) return row("upgrade", "Upgrade Runners", does, "unknown", "No Runners are registered.", "-", "", []);
    var old = upgradeTargets();
    var ready = old.filter(function (r) { return approvedRunner(r.name); });
    var busy = upgradeOp && upgradeOp.busy;
    var text = old.length ? old.length + (old.length === 1 ? " Runner is" : " Runners are") + " old: " + old.map(function (r) { return esc(r.name); }).join(", ") + "." : "All Runners are current.";
    var lacking = old.length && !ready.length ? esc(APPROVAL) : old.length > ready.length ? "Needs approval for: " + old.filter(function (r) { return !approvedRunner(r.name); }).map(function (r) { return esc(r.name); }).join(", ") + "." : "";
    var progress = upgradeOp ? upgradeOp.items.map(function (i) { return '<span class="a-note' + (i.state === "failed" ? " a-note--warning" : "") + '" id="upgrade-' + esc(i.runnerId) + '">' + esc(i.name) + ": " + esc(i.text) + "</span>"; }).join("<br>") : "";
    return row("upgrade", "Upgrade Runners", does, old.length ? "warning" : "ok", text, "-",
      isAdmin ? '<button class="a-btn' + (old.length ? " a-btn--primary" : "") + '" type="button" id="upgrade-run"' + (busy || !ready.length ? " disabled" : "") + ">" + (busy ? "Upgrading..." : "Upgrade now") + "</button>" : "", [lacking, progress]);
  }

  function updatesRow() {
    var h = lastData && lastData.health, a = lastData && lastData.assessment;
    var host = (h && h.host) || {};
    var does = "Installs the pending security updates; other updates and a restart: see This machine below.";
    if (typeof host.updatesPending !== "number") return row("updates", "OS updates", does, "unknown", "Update counts need Ubuntu's update notifier on the server.", "-", "", []);
    var last = plural(host.updatesPending, "update") + " waiting" + (typeof host.securityUpdates === "number" ? ", " + host.securityUpdates + " of them security" : "") + "; " + (host.rebootRequired ? "a restart is needed." : "no restart needed.");
    var name = chosenName();
    var busy = osOp && osOp.state === "waiting";
    var ask = osOp && osOp.asking ? '<div id="os-confirm" class="confirm"><span class="a-note a-note--warning">Installs the pending security updates on this server. It can take several minutes, and no app is stopped. Type <strong>' + esc(name) + '</strong> to confirm.</span> ' +
      '<input class="a-input" id="os-typed" autocomplete="off" spellcheck="false" aria-label="Type the server name" value="' + esc(osOp.typed || "") + '"> ' +
      '<button class="a-btn a-btn--primary" type="button" id="os-go"' + (osOp.typed === name ? "" : " disabled") + '>Install updates</button> <button class="a-btn" type="button" id="os-cancel">Cancel</button></div>' : "";
    var note = !osOp || osOp.asking ? "" : osOp.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (osOp.state === "failed" ? " a-note--warning" : "") + '" id="os-result">' + esc(osOp.text) + "</span>";
    return row("updates", "OS updates", does, a ? a.updates : "unknown", last, "-",
      isAdmin && name ? '<button class="a-btn' + (host.updatesPending > 0 ? " a-btn--primary" : "") + '" type="button" id="os-run"' + (busy || (osOp && osOp.asking) ? " disabled" : "") + ">" + (busy ? "Installing..." : "Install…") + "</button>" : "", [note, ask]);
  }

  function tonight() {
    var d = new Date(); d.setHours(3, 0, 0, 0);
    if (d.getTime() < Date.now() + 3600000) d.setDate(d.getDate() + 1);
    return d;
  }

  function restartRow() {
    var does = "Restarts the whole server; every app is unavailable until it is back.";
    var name = chosenName();
    var info = restartInfo || {};
    var asking = restartOp && restartOp.asking;
    var busy = restartOp && restartOp.state === "waiting";
    var last = info.lastRestartedAtUtc ? "Last restarted " + when(info.lastRestartedAtUtc) + "." : "Not restarted from here yet.";
    var plan = info.state === "scheduled" && info.restartAtUtc ? when(info.restartAtUtc) : "-";
    var ask = asking ? '<div id="restart-confirm" class="confirm"><span class="a-note a-note--warning">' + (restartOp.at ? "Restarts this server at " + esc(new Date(restartOp.at).toLocaleString()) + "." : "Restarts this server in about a minute.") +
      " Every app on it is unavailable until it is back. Type <strong>" + esc(name) + '</strong> to confirm.</span> ' +
      '<input class="a-input" id="restart-typed" autocomplete="off" spellcheck="false" aria-label="Type the server name" value="' + esc(restartOp.typed || "") + '"> ' +
      '<button class="a-btn a-btn--primary" type="button" id="restart-go"' + (restartOp.typed === name ? "" : " disabled") + '>' + (restartOp.at ? "Restart tonight" : "Restart now") + '</button> <button class="a-btn" type="button" id="restart-cancel">Cancel</button></div>' : "";
    var note = !restartOp || asking ? "" : restartOp.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (restartOp.state === "failed" ? " a-note--warning" : "") + '" id="restart-result">' + esc(restartOp.text) + "</span>";
    var off = busy || asking ? " disabled" : "";
    return row("restart", "Restart server", does, restartOp && restartOp.state === "failed" ? "warning" : info.state === "scheduled" ? "warning" : "ok", last, plan,
      isAdmin && name ? '<button class="a-btn" type="button" id="restart-tonight"' + off + ">Tonight 03:00</button> " + '<button class="a-btn" type="button" id="restart-now"' + off + ">Now…</button>" : "", [note, ask]);
  }

  function paintTasks() {
    if (!lastData) return;
    // Do not redraw under someone typing in the settings form.
    if (cleanupEdit && document.activeElement && /^cs-/.test(document.activeElement.id || "")) return;
    if (osOp && osOp.asking && document.activeElement && document.activeElement.id === "os-typed") return;
    if (restartOp && restartOp.asking && document.activeElement && document.activeElement.id === "restart-typed") return;
    tasksBox.hidden = false;
    tasksBox.innerHTML = '<section class="a-card" id="maintenance"><div class="a-card__head"><h2 class="a-card__title">Maintenance</h2></div><table class="mt"><thead><tr><th>Task</th><th>Last run</th><th>Next run</th><th>Actions</th></tr></thead><tbody>' +
      cleanupRow() + backupRow() + upgradeRow() + updatesRow() + restartRow() + "</tbody></table></section>";
    UI.updateRelativeTimes(tasksBox);
    paintRuns();
    refreshOverview();
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

  fetch("api/tasks", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) { isAdmin = data.admin === true; paintTasks(); paintAppParts(); }).catch(function () { /* read-only */ });
  loadRestart().then(paintTasks).catch(function () { /* older server */ });

  // Buttons on the Overview, the Apps tab and the tab strip.
  document.addEventListener("click", function (event) {
    var tabButton = event.target.closest("[data-tab]");
    if (tabButton) return showTab(tabButton.getAttribute("data-tab"));
    var button = event.target.closest("[data-act]");
    if (!button || button.disabled) return;
    var act = button.getAttribute("data-act");
    if (act === "disk-toggle") { diskOpen = !diskOpen; return refreshOverview(); }
    if (act === "app-logs" || act === "app-restart") { var name = selectedName(); return name ? runTool(act === "app-logs" ? "logs" : "restart", name) : undefined; }
    if (act === "go-maintenance") return showTab("maintenance");
    showTab("maintenance");
    if (act === "os-install") { osOp = { asking: true, typed: "" }; paintTasks(); var box = document.getElementById("os-typed"); if (box) box.focus(); }
    else if (act === "cleanup-run") runCleanupNow();
    else if (act === "backup-run") runBackupNow();
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
