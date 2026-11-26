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

  function dot(status) {
    return '<span class="dot' + (status === "warning" ? " dot--attn" : status === "critical" ? " dot--bad" : status === "ok" ? "" : " dot--off") + '" aria-hidden="true"></span>';
  }

  function sparkTile(name, meta, value, status, history, key) {
    var shown = pct(value);
    var series = history.map(function (item) { return item[key]; });
    return '<div class="tile"><div class="tile__row"><span>' + esc(name) + "</span><span>" + esc(meta) + '</span></div><div class="tile__value">' + (shown === null ? "-" : esc(String(shown)) + "%") + "</div>" +
      UI.sparkline(series, key === "cpu" ? { min: 0, max: 100, status: status, label: name + ", last 24 hours" } : { status: status, label: name + ", last 24 hours" }) + "</div>";
  }

  var diskOpen = false;

  // The disks that matter, as the Runner reports them: the main disk (/) first, then Docker's data root when it is elsewhere.
  function hostDisks(host) {
    var list = (host.disks || []).filter(function (d) { return d && typeof d.mountPoint === "string" && typeof d.totalBytes === "number" && typeof d.availableBytes === "number"; });
    if (!list.length && typeof host.diskTotalBytes === "number") list = [{ mountPoint: "/", totalBytes: host.diskTotalBytes, availableBytes: host.diskAvailableBytes }];
    return list.sort(function (x, y) { return (x.mountPoint === "/" ? 0 : 1) - (y.mountPoint === "/" ? 0 : 1); });
  }
  var UPDATE_NEEDS = 10 * 1024 * 1024 * 1024;

  function diskRow(d, only, data, warnAt) {
    var main = d.mountPoint === "/";
    var used = d.totalBytes > 0 ? pct(100 - 100 * d.availableBytes / d.totalBytes) : null;
    var level = used === null ? "" : used > 100 - data.settings.diskFreePercent / 2 ? "critical" : used >= warnAt ? "warning" : "";
    var what = only ? "" : main ? " · OS, Automaton, backups" : " · apps, images, app data";
    var sub = bytes(d.totalBytes - d.availableBytes) + " of " + bytes(d.totalBytes) + " · " + bytes(d.availableBytes) + " free" + what + (main && !only ? " · updates need " + bytes(UPDATE_NEEDS) + " free" : "");
    var name = only ? "Disk" : main ? "System disk" : "Docker data";
    return '<div class="diskrow"><div class="tile__row"><span><b>' + esc(name) + '</b> <code>' + esc(d.mountPoint) + "</code></span>" +
      '<span class="tile__value">' + (used === null ? "-" : esc(String(used)) + "%") + "</span></div>" +
      '<div class="bar' + barClass(level || "ok") + '" style="--value:' + (used === null ? 0 : Math.min(100, used)) + "%;--mark:" + warnAt + '%"><span></span></div>' +
      '<div class="tile__sub">' + esc(sub) + "</div></div>";
  }

  function diskTile(h, a, history, data) {
    var host = h.host || {};
    var disks = hostDisks(host);
    var warnAt = 100 - data.settings.diskFreePercent;
    var rc = data.reclaim || {};
    var note = "Warning at " + warnAt + "%" + (disks.length > 1 ? " on any disk" : "") + (typeof rc.freeable === "number" && rc.freeable > 0 ? " · up to " + bytes(rc.freeable) + " can be freed" : "");
    var details = "";
    if (diskOpen) {
      details = '<div class="dk">' + (rc.total ? "<span>Docker images</span><span>" + esc(bytes(rc.images)) + "</span><span>Docker volumes (app data)</span><span>" + esc(bytes(rc.volumes)) + "</span><span>Build cache</span><span>" + esc(bytes(rc.buildCache)) + "</span>" : '<span class="muted">Docker disk use is not reported for this machine.</span>') + '</div><button type="button" class="link" data-tab="apps">Disk by app, in Apps</button>';
    }
    return '<div class="tile' + (a.disk === "warning" ? " tile--attn" : a.disk === "critical" ? " tile--bad" : "") + '" id="disk"><div class="tile__row"><span>' + (disks.length > 1 ? "Disks" : "Disk") + '</span><button type="button" class="link" data-act="disk-toggle" aria-expanded="' + diskOpen + '">' + (diskOpen ? "Hide details" : "Details") + "</button></div>" +
      (disks.length ? disks.map(function (d) { return diskRow(d, disks.length === 1, data, warnAt); }).join("") : '<div class="tile__value">-</div><div class="tile__sub">No disk figures</div>') +
      '<div class="tile__sub">' + esc(note) + "</div>" + details + "</div>";
  }

  function tiles(h, a, history, data) {
    var host = h.host || {};
    var memoryUsed = typeof host.memoryTotalBytes === "number" && host.memoryTotalBytes > 0 ? 100 - 100 * host.memoryAvailableBytes / host.memoryTotalBytes : null;
    var load = typeof host.load1 === "number" ? "load " + [host.load1, host.load5, host.load15].map(function (v) { return v.toFixed(2); }).join(" · ") : "load not reported";
    var cores = host.cpuCount ? " · " + plural(host.cpuCount, "core") : "";
    var memName = typeof host.memoryTotalBytes === "number" ? "Memory · " + bytes(host.memoryTotalBytes) : "Memory";
    return '<section class="tiles" aria-label="Resources">' + sparkTile("CPU" + cores, load, host.cpuPercent, a.cpu, history, "cpu") +
      sparkTile(memName, "last 24 h", memoryUsed, a.memory, history, "mem") + diskTile(h, a, history, data) + "</section>";
  }

  // --- Needs you: one card per item, one action each. ----------------------------------------------------------------

  function needAction(item, data) {
    var title = item.title || "";
    if (item.href) return { href: item.href, label: item.label };
    if (item.card === "updates" && /^Install/.test(title)) return isAdmin ? { act: "os-install", label: "Install updates…", primary: true } : { act: "go-maintenance", label: "Open Maintenance" };
    if (item.card === "updates") return { act: "go-maintenance", label: "Restart…", primary: isAdmin };
    if (item.card === "resources" && /disk/i.test(title) && data.reclaim && data.reclaim.freeable > 0 && isAdmin) return { act: "cleanup-run", label: "Free it now", primary: true };
    if (item.card === "runners") return { act: "go-maintenance", label: "Upgrade Runners" };
    if (item.card === "backups") return { act: "go-maintenance", label: "Open Maintenance" };
    if (item.card === "server" && data.studioBase) return { href: data.studioBase + "/server", label: "Open in Studio" };
    return null;
  }

  // What needs the administrator: the server's list, plus the cleanup waiting for its approval (read by this page).
  function needItems(data) {
    var items = (data.attention || []).slice();
    if (cleanupInfo && cleanupInfo.needsApproval) items.push({ level: "warning", title: "Cleanup is waiting for your approval", detail: "Server Keeper asks for server:cleanup to free old images and logs each night.",
      href: data.studioBase || null, label: "Review in Studio", icon: "lock" });
    return items;
  }

  var ICON = {
    lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>',
    warn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"></path><path d="M12 10v5"></path><path d="M12 18h.01"></path></svg>',
    ok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12l3 3 5-6"></path></svg>'
  };

  function needs(data) {
    var items = needItems(data);
    if (!items.length) return "";
    return '<section class="needs" aria-label="Needs you">' + items.map(function (i) {
      var action = needAction(i, data);
      var button = !action || (action.href === null) ? "" : action.href ? '<a class="a-btn a-btn--lg a-btn--ghost" target="_blank" rel="noopener" href="' + esc(action.href) + '">' + esc(action.label) + "</a>"
        : '<button type="button" class="a-btn a-btn--lg' + (action.primary ? " a-btn--primary" : " a-btn--ghost") + '" data-act="' + esc(action.act) + '">' + esc(action.label) + "</button>";
      return '<div class="need' + (i.level === "critical" ? " need--critical" : "") + '">' + (ICON[i.icon] || ICON.warn) + '<div class="need__text"><strong>' + esc(i.title) + "</strong><span>" + esc(i.detail || "") +
        (i.command ? ' <code class="a-mono">' + esc(i.command) + "</code>" : "") + "</span></div>" + button + "</div>";
    }).join("") + "</section>";
  }

  function banner(data) {
    return data.status !== "ok" && data.status !== "starting" ? '<div class="a-note a-note--warning" style="margin:0">Last read failed' + (data.failedAt ? " at " + clock(data.failedAt) : "") + ": " + esc(data.message || "no reason was reported (status " + (data.status || "unknown") + ")") +
      ". Showing figures from " + (data.fetchedAt ? clock(data.fetchedAt) : "an earlier check") + ".</div>" : "";
  }

  // One line in the Health list: a dot (grey, orange for attention, red for failure), the name, the result.
  function tone(status) { return status === "warning" ? " tone--attn" : status === "critical" ? " tone--bad" : ""; }

  function line(name, status, text) {
    return '<li class="ln">' + dot(status) + '<span class="ln__name">' + esc(name) + '</span><span class="ln__text' + tone(status) + '">' + text + "</span></li>";
  }

  // One line in the Maintenance list: the task, its last result, and its action on the right.
  function task(name, text, action, status) {
    return '<li class="ln"><div class="ln__main"><span class="ln__name">' + esc(name) + '</span><span class="ln__sub' + tone(status) + '">' + text + '</span></div><div class="ln__act">' + (action || "") + "</div></li>";
  }

  function btn(label, act) { return '<button type="button" class="a-btn" data-act="' + act + '">' + esc(label) + "</button>"; }
  function none(text) { return '<span class="muted ln__none">' + esc(text) + "</span>"; }

  function healthList(h, a, data) {
    var host = h.host || {};
    var security = host.securityUpdates;
    var counts = typeof security !== "number" || typeof host.updatesPending !== "number" ? "unknown" : "up to date";
    var updates = counts === "unknown" ? "update counts need Ubuntu's update notifier"
      : (host.updatesPending ? host.updatesPending + " waiting" : "none waiting") + (host.rebootRequired ? " · restart needed" : host.updatesPending ? "" : " · restart not needed");
    var certs = (h.certificates || []).filter(function (c) { return typeof c.daysRemaining === "number"; });
    var names = certs.map(function (c) { return String(c.host || "").split(".")[0]; }).filter(function (n, i, all) { return n && all.indexOf(n) === i; }).slice(0, 3);
    var runners = h.runners || [];
    var online = runners.filter(function (r) { return String(r.status || "").toLowerCase() === "online"; }).length;
    var old = runners.filter(function (r) { return r.upgradeAvailable; }).length;
    var b = h.backup || {};
    var f = data.fail2ban;
    var rows = line("OS updates", a.updates, esc(updates)) +
      line("Certificates", a.certificates, certs.length ? esc((names.length ? names.join(", ") + " · " : "") + Math.min.apply(null, certs.map(function (c) { return c.daysRemaining; })) + " days left") : "no HTTPS host names") +
      line("Runners", a.runners, runners.length ? esc((runners.length - old) + " of " + runners.length + " current" + (online < runners.length ? " · " + (runners.length - online) + " offline" : "")) : "no Runners registered") +
      line("Backups", a.backup, b.available && b.lastSuccessAt ? "last one " + esc(ago(b.lastSuccessAgeHours * 3600).replace("less than a minute ago", "just now")) : b.available ? "no successful backup yet" : "no backup status yet") +
      line("fail2ban", f ? (f.running ? "ok" : "warning") : "unknown", f ? (f.running ? "on · " + esc(f.banned + (f.banned === 1 ? " ban" : " bans")) + " in 24 h" : "not running") : "needs the security:read approval");
    return '<section class="a-card lst" id="health"><h2 class="lst__title">Health</h2><ul class="a-list scroll" style="list-style:none;margin:0;padding:0">' + rows + "</ul></section>";
  }

  function maintenanceList(h, a, data) {
    var host = h.host || {};
    var last = cleanupInfo && !cleanupInfo.needsApproval && (cleanupInfo.runs || [])[0];
    var b = h.backup || {};
    var old = (h.runners || []).filter(function (r) { return r.upgradeAvailable; }).length;
    var info = restartInfo || {};
    var cleanupText = !cleanupInfo ? "reading…" : cleanupInfo.needsApproval ? "waiting for approval" :
      (last ? (last.result === "succeeded" ? "freed " + esc(bytes(last.bytesFreed)) : esc(last.result)) + " " + when(last.startedAtUtc) : "never run") + (cleanupInfo.settings ? " · next " + esc(cleanupInfo.settings.timeUtc) + " UTC" : "");
    var cleanupAct = !cleanupInfo ? "" : cleanupInfo.needsApproval ? none("see above") : isAdmin ? btn("Run now", "cleanup-run") : btn("Open", "go-maintenance");
    var rows = task("Cleanup", cleanupText, cleanupAct, cleanupInfo && cleanupInfo.needsApproval ? "warning" : "") +
      task("Backup", b.lastSuccessAt ? "succeeded " + when(b.lastSuccessAt) + " · daily" : "no backup yet", isAdmin ? btn("Run now", "backup-run") : btn("Open", "go-maintenance")) +
      task("Upgrade Runners", old ? plural(old, "Runner") + " can be upgraded" : "all current", old ? btn("Open", "go-maintenance") : none("nothing to do")) +
      task("OS updates", typeof host.updatesPending !== "number" ? "counts unknown" : host.updatesPending ? host.updatesPending + " waiting" + (typeof host.securityUpdates === "number" ? ", " + host.securityUpdates + " security" : "") : "none waiting",
        host.updatesPending > 0 ? (isAdmin ? btn("Install…", "os-install") : btn("Open", "go-maintenance")) : none("nothing to do")) +
      task("Restart server", info.state === "scheduled" && info.restartAtUtc ? "scheduled " + when(info.restartAtUtc) : info.lastRestartedAtUtc ? "last restart " + when(info.lastRestartedAtUtc) : "not restarted from here yet", btn("Restart…", "go-maintenance"));
    return '<section class="a-card lst" id="maintenance-list"><h2 class="lst__title">Maintenance</h2><ul class="a-list scroll" style="list-style:none;margin:0;padding:0">' + rows + "</ul></section>";
  }

  function headline(h, a, data) {
    var host = h.host || {};
    var s = h.server || {};
    var count = needItems(data).length;
    var text = count ? (count === 1 ? "1 thing needs you" : count + " things need you") : a.overall === "ok" ? "Everything is healthy" : a.overall === "unknown" ? "Some figures unknown" : "Needs attention";
    var meta = [data.host || data.machine, s.version ? "Automaton " + s.version + (s.updateAvailable === false ? " (latest)" : s.updateAvailable === true ? " (update available)" : "") : "", host.osName,
      typeof host.uptimeSeconds === "number" ? "up " + UI.formatDuration(host.uptimeSeconds) : ""].filter(Boolean).map(esc).join(" · ");
    var next = !count && cleanupInfo && !cleanupInfo.needsApproval && cleanupInfo.settings ? "Nothing needs you. Next: cleanup at " + cleanupInfo.settings.timeUtc + " UTC." : !count ? "Nothing needs you." : "";
    return '<div class="head"><div><div class="head__row">' + (count ? "" : ICON.ok) + '<h2 class="head__title">' + esc(text) + '</h2></div><p class="head__meta">' + meta + '</p></div>' + (next ? '<p class="head__next">' + esc(next) + "</p>" : "") + "</div>";
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
      cpu: d && typeof d.cpuPercent === "number" ? d.cpuPercent : null, mem: d && typeof d.memoryBytes === "number" ? d.memoryBytes : null,
      parts: d || null, deployedAt: a.deployedAt || null, error: a.error || null };
  }

  // The first app that needs a look (failing before deploying), else the first running app, else the first one.
  function firstToShow(real) {
    var by = function (r) { return r.name.toLowerCase(); };
    var order = function (x, y) { return by(x) < by(y) ? -1 : 1; };
    var worst = real.filter(function (r) { return r.level >= 2; }).sort(function (x, y) { return y.level - x.level || order(x, y); })[0];
    return worst || real.filter(function (r) { return r.level === 0; }).sort(order)[0] || real.slice().sort(order)[0];
  }

  function stateText(r) { return r.state.toLowerCase(); }
  function stateSpan(r) { return '<span class="st-' + (r.level >= 3 ? "bad" : r.level === 2 ? "attn" : "ok") + '">' + esc(stateText(r)) + "</span>"; }
  function cpuText(r) { return typeof r.cpu === "number" ? esc(String(pct(r.cpu))) + "%" : "-"; }
  function memText(r) { return typeof r.mem === "number" ? esc(bytes(r.mem)) : "-"; }

  function filtered(rows) {
    var q = appQuery.trim().toLowerCase();
    return rows.filter(function (r) {
      if (appGroup === "trouble" ? r.level < 2 || r.left : appGroup === "stopped" ? r.level !== 1 || r.left : appGroup !== "all" && r.group !== appGroup) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0;
    });
  }

  function sorted(rows) {
    var k = appSort.key, dir = appSort.dir;
    var val = function (r) { return k === "app" ? r.name.toLowerCase() : k === "function" ? r.group.toLowerCase() : k === "disk" ? (typeof r.disk === "number" ? r.disk : -1) : k === "cpu" ? (typeof r.cpu === "number" ? r.cpu : -1) : k === "memory" ? (typeof r.mem === "number" ? r.mem : -1) : -r.level; };
    return rows.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      var c = (x < y ? -1 : x > y ? 1 : 0) * (k === "disk" || k === "cpu" || k === "memory" ? -dir : dir);
      return c || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
    });
  }

  function ensureAppShell() {
    if (appShell) return;
    appShell = true;
    appsBox.innerHTML = '<div class="apps"><aside class="apps__left a-card" aria-label="Find apps"><div><label class="apps__label" for="app-search" id="map-title">Apps</label><input class="a-input" id="app-search" type="search" placeholder="Find an app by name" autocomplete="off" spellcheck="false"></div>' +
      '<div><div class="apps__label">Machine map · each square is an app</div><div class="map" id="app-map" role="group" aria-label="Machine map"></div><div class="legend" id="app-legend"></div></div>' +
      '<div><div class="apps__label">Group by function</div><div class="chips" id="app-chips" role="group" aria-label="Group by function"></div></div></aside>' +
      '<section class="apps__right" aria-label="Apps"><div id="app-detail" class="detail"></div><div class="a-card tablebox"><div class="scroll" id="app-table"></div></div></section></div>';
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
    if (!sel && real.length) { sel = firstToShow(real); appSel = sel.key; }
    var trouble = real.filter(function (r) { return r.level >= 2; });
    var stopped = real.filter(function (r) { return r.level === 1; });
    var metrics = real.some(function (r) { return typeof r.cpu === "number" || typeof r.mem === "number"; });
    document.getElementById("map-title").textContent = real.length ? plural(real.length, "app") + " on " + (lastData.machine || "this machine") : "Apps";
    document.getElementById("app-map").innerHTML = real.map(function (r) {
      var shown = rows.indexOf(r) >= 0;
      return '<button type="button" class="sq' + (r.level >= 3 ? " sq--bad" : r.level === 2 ? " sq--attn" : r.level === 1 ? " sq--paused" : "") + (r.key === appSel ? " is-sel" : "") + (shown ? "" : " is-dim") +
        '" data-app="' + esc(r.key) + '" title="' + esc(r.name + ": " + r.state) + '" aria-label="' + esc(r.name + ", " + r.state) + '" aria-pressed="' + (r.key === appSel) + '"></button>';
    }).join("");
    document.getElementById("app-legend").innerHTML = real.length ? '<span><i class="lg-run"></i>running</span><span><i class="lg-attn"></i>needs attention</span><span><i class="lg-bad"></i>failing</span><span><i class="lg-off"></i>stopped</span><span><i class="lg-sel"></i>selected</span>' : "";
    var groups = {};
    real.forEach(function (r) { groups[r.group] = (groups[r.group] || 0) + 1; });
    var names = Object.keys(groups).sort(function (a, b) { return a === "Other" ? 1 : b === "Other" ? -1 : groups[b] - groups[a] || (a < b ? -1 : 1); });
    var chip = function (key, label, n, cls) { return '<button type="button" class="chip' + (cls || "") + (appGroup === key ? " is-on" : "") + '" data-group="' + esc(key) + '" aria-pressed="' + (appGroup === key) + '">' + esc(label) + " " + n + "</button>"; };
    document.getElementById("app-chips").innerHTML = real.length ? (trouble.length ? chip("trouble", "Needs attention", trouble.length, " chip--attn") : "") + chip("all", "All", real.length) + names.map(function (n) { return chip(n, n, groups[n]); }).join("") + (stopped.length ? chip("stopped", "Stopped", stopped.length) : "") : "";
    document.getElementById("app-detail").innerHTML = detailCard(sel, offline, metrics);
    var cols = [["app", "App · " + (appGroup === "all" && !appQuery ? "All " + real.length : rows.length + " of " + real.length), ""], ["function", "Function", ""], ["state", "State", ""]]
      .concat(metrics ? [["cpu", "CPU", " num"], ["memory", "Memory", " num"]] : []).concat([["disk", "Disk", " num"]]);
    var head = cols.map(function (c) {
      var on = c[0] && appSort.key === c[0];
      return '<th class="' + c[2].trim() + '"' + (on ? ' aria-sort="' + (appSort.dir > 0 ? "ascending" : "descending") + '"' : "") + '><button type="button" data-sort="' + c[0] + '">' + esc(c[1]) + (on ? (appSort.dir > 0 ? " ↑" : " ↓") : "") + "</button></th>";
    }).join("");
    var body = sorted(rows).map(function (r) {
      return '<tr class="app' + (r.key === appSel ? " is-sel" : "") + '" data-app="' + esc(r.key) + '"><td class="nm"><button type="button" data-app="' + esc(r.key) + '" aria-pressed="' + (r.key === appSel) + '">' + esc(r.name) + "</button>" + (r.left ? '<div class="a-hint">' + esc(plural(r.count, "leftover")) + "</div>" : "") + '</td><td class="fn">' + esc(r.group) + '</td><td class="st">' + stateSpan(r) +
        "</td>" + (metrics ? '<td class="num cpu">' + cpuText(r) + '</td><td class="num mem">' + memText(r) + "</td>" : "") + '<td class="num dk-c">' + (typeof r.disk === "number" ? esc(bytes(r.disk)) : "-") + "</td></tr>";
    }).join("");
    document.getElementById("app-table").innerHTML = real.length || rows.length
      ? '<table class="at"><thead><tr>' + head + "</tr></thead><tbody>" + (body || '<tr><td colspan="' + cols.length + '" class="muted">No app matches.</td></tr>') + "</tbody></table>"
      : '<div class="a-empty"><div class="a-empty__title">' + (lastData.apps === null || lastData.apps === undefined ? "No app list yet" : "No apps on this machine") + "</div>" +
        (lastData.apps === null || lastData.apps === undefined ? "Server Keeper needs the apps:read-status approval to list apps." : "Apps appear here when they run on this machine.") + "</div>";
  }

  function detailCard(r, offline, metrics) {
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
    var facts = r.left ? "Data left on the machine by apps that no longer exist." :
      esc(r.group) + " · " + (r.level === 0 ? "running" : esc(stateText(r))) + (r.deployedAt ? ' · deployed <time datetime="' + esc(String(r.deployedAt)) + '" data-rel></time>' : "") + (r.error ? " · " + esc(r.error) : "");
    var actions = r.left ? "" : '<button type="button" class="a-btn" data-act="app-logs"' + (can && !busy ? "" : " disabled") + (why ? ' title="' + esc(why) + '"' : "") + ">Logs</button>" +
      '<button type="button" class="a-btn" data-act="app-restart"' + (can && !busy ? "" : " disabled") + (why ? ' title="' + esc(why) + '"' : "") + ">Restart app…</button>" +
      (lastData.studioBase && r.id ? '<a class="a-btn" target="_blank" rel="noopener" href="' + esc(lastData.studioBase + "/apps/" + r.id) + '">Open in Studio</a>' : "");
    var use = metrics ? '<div class="fig"><span>CPU</span><b>' + cpuText(r) + '</b></div><div class="fig"><span>Memory</span><b>' + memText(r) + "</b></div>"
      : '<div class="fig fig--2"><span>CPU and memory</span><b class="fig__none">not reported by this server yet</b></div>';
    return '<section class="a-card detail__card" aria-label="Selected app"><div class="detail__head"><div class="detail__id"><h2 class="detail__name">' + esc(r.name) + '</h2><div class="detail__facts">' + facts + "</div></div>" +
      '<div class="detail__act">' + actions + "</div></div>" +
      '<div class="figs">' + use + '<div class="fig"><span>Disk</span><b>' + (typeof r.disk === "number" ? esc(bytes(r.disk)) : "-") + "</b></div>" +
      '<div class="fig"><span>image · data · files</span>' + (total ? '<div class="split" role="img" aria-label="Image ' + esc(bytes(image)) + ", data " + esc(bytes(data)) + ", files and logs " + esc(bytes(other)) + '"><span class="p1" style="width:' + w(image) + '%"></span><span class="p2" style="width:' + w(data) + '%"></span><span class="p3" style="width:' + w(other) + '%"></span></div>' : '<b class="fig__none">-</b>') + "</div></div>" +
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
    if (tabNow === "apps") paintApps();
    UI.updateRelativeTimes(document);
  }

  function refreshOverview() { if (lastData && lastData.health) dashboard(lastData); }

  // --- Run history: each task keeps its own last runs, shown as bars in its row and as a list under it -----------------------

  var histOpen = {}, histAll = {};
  var TASK_NAME = { cleanup: "Cleanup", backup: "Backup", upgrade: "Upgrade Runners", updates: "OS updates", restart: "Restart server" };

  // The runs this app knows for one task, newest first: [{at (seconds), text, bad}].
  function taskRuns(id) {
    var name = TASK_NAME[id], items = [];
    if (id === "cleanup") {
      if (cleanupInfo && !cleanupInfo.needsApproval) (cleanupInfo.runs || []).forEach(function (r) {
        var at = Date.parse(r.startedAtUtc) / 1000;
        if (!isFinite(at)) return;
        items.push({ at: at, bad: r.result === "failed",
          text: r.result === "succeeded" ? "freed " + bytes(r.bytesFreed) : r.result === "failed" ? "failed" + (r.message ? ": " + r.message : "") : r.result });
      });
    } else {
      ((lastData && lastData.runs) || []).forEach(function (r) {
        if (r.task !== name) return;
        items.push({ at: r.at, bad: r.result !== "started",
          text: r.result === "started" ? "started" : r.result === "refused" ? "refused" : "failed" + (r.detail ? ": " + r.detail : "") });
      });
    }
    return items.sort(function (x, y) { return y.at - x.at; });
  }

  function runBars(id, runs) {
    var last = runs.slice(0, 10).reverse(), html = "";
    for (var i = last.length; i < 10; i++) html += '<span class="bar bar--none" aria-hidden="true"></span>';
    last.forEach(function (r) {
      var when_ = new Date(r.at * 1000).toLocaleString();
      html += '<button type="button" class="bar' + (r.bad ? " bar--bad" : "") + '" data-hist="' + id + '" title="' + esc(when_ + " · " + r.text) + '" aria-label="' + esc(when_ + ", " + r.text) + '"></button>';
    });
    return html;
  }

  function runsHead(id) {
    var runs = taskRuns(id), open = !!histOpen[id];
    return '<div class="runs"><div class="bars" role="group" aria-label="Last 10 runs">' + runBars(id, runs) + "</div>" +
      (runs.length ? '<button type="button" class="linkbtn" data-hist-toggle="' + id + '" aria-expanded="' + open + '">' + (open ? "Hide history" : "History (" + runs.length + ")") + "</button>" : '<span class="muted small">no runs yet</span>') + "</div>";
  }

  function runsList(id) {
    if (!histOpen[id]) return "";
    var runs = taskRuns(id), shown = histAll[id] ? runs : runs.slice(0, 10);
    return '<div class="hist" id="hist-' + id + '">' + shown.map(function (r) {
      return '<div class="hrun">' + dot(r.bad ? "warning" : "ok") + '<time datetime="' + esc(new Date(r.at * 1000).toISOString()) + '">' + esc(new Date(r.at * 1000).toLocaleString()) + "</time><span>" + esc(r.text) + "</span></div>";
    }).join("") + (!histAll[id] && runs.length > 10 ? '<button type="button" class="a-btn" data-hist-older="' + id + '">Show older (' + (runs.length - 10) + ")</button>" : "") + "</div>";
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

  // --- Per-app tools (logs, restart): only for machines an administrator approved for this app (runner:maintain). ---------

  var machinesMaintained = [];
  var appsByRunner = {};   // runnerId -> [{ targetId, name, status }]
  var tool = null;         // { runner, kind, busy, text, error } the last logs, restart or disk answer

  function maintainedRunner() {
    return machinesMaintained.filter(function (item) { return item.name === chosenName(); })[0];
  }

  function chosenName() { return lastData ? lastData.machine : null; }


  function loadApps(item) {
    fetch("api/maintenance/apps?runner=" + encodeURIComponent(item.runnerId), { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        if (data.status === "ok" && Array.isArray(data.data)) { appsByRunner[item.runnerId] = data.data; paintAppParts(); }
      });
    }).catch(function () { /* keep what is shown */ });
  }

  function repaintTool() { paintAppParts(); }

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

  function loadMaintenance() {
    fetch("api/maintenance", { cache: "no-store" }).then(function (response) {
      return response.json().then(function (data) {
        machinesMaintained = data.status === "ok" && Array.isArray(data.data) ? data.data : [];
        paintAppParts();
        paintTasks();
        var item = maintainedRunner();
        if (item && item.approved && !appsByRunner[item.runnerId]) loadApps(item);
      });
    }).catch(function () { /* keep what is shown */ });
  }

  // --- Maintenance section: every task in one place. Reads are open to anyone who may see the page; Run now and Settings
  // are shown to system administrators only (the proxy's role header; the server checks the viewer token on every change). ---

  var tasksBox = document.getElementById("tasks-box");
  var isAdmin = false;
  var cleanupOp = null;   // { error } after Run now on the cleanup
  var cleanupEdit = false;
  var backupOp = null;    // { since, state: "waiting" | "done" | "failed", text, needsApproval }
  var osStatus = null;    // the server's own record of the last OS update run (GET api/tasks/os-updates): the state lives there, not in this page
  var osLost = false;     // no answer while an update runs: updating Docker restarts every app, this one too
  var osForm = null;      // the open confirm panel: { scope, typed, error }
  var osRunner = null;    // { state: "running" | "done" | "failed", text } a Runner machine's security update, which this page waits for
  var osSeen = false;     // this page watched an update run, so its result stays shown
  var osTimer = null;
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

  // One task card of the Maintenance tab: name and what it does, Last run with a status dot, a labelled Next/Status/Waiting/Planned
  // column, and the actions on the right. Plain text; a problem is orange or red text.
  var NEXT_LABEL = { cleanup: "Next", backup: "Next", upgrade: "Status", updates: "Waiting", restart: "Planned" };

  function row(id, name, does, status, last, next, actions, notes, detail) {
    var tone = status === "warning" ? " tone--attn" : status === "critical" ? " tone--bad" : "";
    var idle = last === "not run from here" || last === "never run" || last === "never";
    return '<section class="task" id="task-' + id + '" aria-labelledby="task-' + id + '-name"><div class="task__row"><div class="task__who"><h2 class="task__name" id="task-' + id + '-name">' + esc(name) + '</h2><span class="task__does">' + esc(does) + "</span>" + runsHead(id) + "</div>" +
      '<div class="task__col t-last' + tone + '"><span class="task__label">Last run</span><span class="task__val">' + dot(idle ? "unknown" : status) + "<span>" + last + "</span></span></div>" +
      '<div class="task__col t-next"><span class="task__label">' + (NEXT_LABEL[id] || "Next") + '</span><span class="task__val task__val--next">' + next + '</span></div><div class="task__acts"><div class="t-act">' + (actions || "") + "</div></div></div>" +
      notes.filter(Boolean).map(function (n) { return '<div class="t-note">' + n + "</div>"; }).join("") + (detail ? '<div class="task__detail">' + detail + "</div>" : "") + runsList(id) + "</section>";
  }

  // The newest time this app started the task, as "3 days ago · started"; "not run from here" without one.
  function lastRun(taskName) {
    var r = ((lastData && lastData.runs) || []).filter(function (x) { return x.task === taskName; })[0];
    return r ? when(new Date(r.at * 1000).toISOString()) + " · " + (r.result === "started" ? "started" : r.result === "refused" ? "refused" : "failed") : "not run from here";
  }

  function cleanupRow() {
    var does = "unused images, old build cache and old journal files";
    if (!cleanupInfo || cleanupInfo.needsApproval) return row("cleanup", "Cleanup", does, cleanupInfo ? "warning" : "unknown", cleanupInfo ? "waiting for approval" : "reading…", "-", "", [cleanupInfo ? esc(APPROVAL) : ""]);
    var last = (cleanupInfo.runs || [])[0];
    var running = last && (last.result === "queued" || last.result === "running");
    var status = cleanupInfo.warning || (last && last.result === "failed") ? "warning" : "ok";
    var rc = (lastData && lastData.reclaim) || {};
    var st = cleanupInfo.settings;
    var result = running ? "cleaning up on " + esc(last.runnerName) + "…" : last ? when(last.startedAtUtc) + " · " + (last.result === "succeeded" ? "freed " + esc(bytes(last.bytesFreed)) : esc(last.result)) + (last.result === "failed" && last.message ? ": " + esc(last.message) : "") : "never run";
    var next = '<div class="muted">' + esc(st.timeUtc) + " UTC · " + when(cleanupInfo.nextRunAtUtc) + "</div>" + (typeof rc.freeable === "number" && rc.freeable > 0 ? '<div class="t-strong">' + esc(bytes(rc.freeable)) + " can be freed now</div>" : "");
    var actions = "", form = "";
    if (isAdmin) {
      actions = '<button class="a-btn" type="button" id="cleanup-settings">Settings</button> <button class="a-btn" type="button" id="cleanup-run"' + (running ? " disabled" : "") + ">" + (running ? "Running…" : "Free it now") + "</button>";
      if (cleanupEdit) {
        form = '<div id="cleanup-form" class="task__form"><label>Time (UTC) <input class="a-input" id="cs-time" value="' + esc(st.timeUtc) + '" size="5"></label> <label>Keep days <input class="a-input" id="cs-keep" type="number" min="1" max="365" value="' + esc(String(st.keepDays)) + '"></label> ' +
          '<label>Journal limit (MB) <input class="a-input" id="cs-journal" type="number" min="50" max="100000" value="' + esc(String(st.journalLimitMb)) + '"></label> <button class="a-btn" type="button" id="cleanup-save">Save</button> <button class="a-btn" type="button" id="cleanup-cancel">Cancel</button></div>';
      }
    }
    return row("cleanup", "Cleanup", does + " · journal over " + st.journalLimitMb + " MB · keeps " + st.keepDays + " days", status, result, next, actions, [cleanupInfo.warning ? esc(cleanupInfo.warning) : "", cleanupOp && cleanupOp.error ? '<span class="a-note a-note--warning" id="cleanup-error">' + esc(cleanupOp.error) + "</span>" : "", form]);
  }

  function backupRow() {
    var h = lastData && lastData.health, a = lastData && lastData.assessment;
    var b = (h && h.backup) || {};
    var does = "database, settings and keys, then the off-site copy";
    if (!b.available) return row("backup", "Backup", does, "unknown", "no backup status yet; run the latest server update to enable backups", "-", "", []);
    var last = b.lastSuccessAt ? when(b.lastSuccessAt) + " · succeeded" : "no successful backup yet";
    var op = backupOp;
    var note = !op ? "" : op.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (op.state === "failed" ? " a-note--warning" : "") + '" id="backup-result">' + esc(op.text) + "</span>";
    var busy = op && op.state === "waiting";
    return row("backup", "Backup", does, a ? a.backup : "unknown", last, "nightly", isAdmin ? '<button class="a-btn" type="button" id="backup-run"' + (busy ? " disabled" : "") + ">" + (busy ? "Backing up…" : "Run now") + "</button>" : "",
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
    var does = "moves old Runners to the server's image, rolls back if one doesn't reconnect";
    var runners = (lastData && lastData.health && lastData.health.runners) || [];
    if (!runners.length) return row("upgrade", "Upgrade Runners", does, "unknown", "no Runners are registered", "-", "", []);
    var old = upgradeTargets();
    var ready = old.filter(function (r) { return approvedRunner(r.name); });
    var busy = upgradeOp && upgradeOp.busy;
    var next = old.length ? esc(old.length + (old.length === 1 ? " Runner is" : " Runners are") + " old: " + old.map(function (r) { return r.name; }).join(", ")) : "All Runners current";
    var lacking = old.length && !ready.length ? esc(APPROVAL) : old.length > ready.length ? "Needs approval for: " + old.filter(function (r) { return !approvedRunner(r.name); }).map(function (r) { return esc(r.name); }).join(", ") + "." : "";
    var progress = upgradeOp ? upgradeOp.items.map(function (i) { return '<span class="a-note' + (i.state === "failed" ? " a-note--warning" : "") + '" id="upgrade-' + esc(i.runnerId) + '">' + esc(i.name) + ": " + esc(i.text) + "</span>"; }).join("<br>") : "";
    return row("upgrade", "Upgrade Runners", does, old.length ? "warning" : "ok", lastRun("Upgrade Runners"), next,
      isAdmin ? '<button class="a-btn" type="button" id="upgrade-run"' + (busy || !ready.length ? " disabled" : "") + ">" + (busy ? "Upgrading…" : old.length ? "Upgrade now" : "All current") + "</button>" : "", [lacking, progress]);
  }

  // --- OS updates. The server writes how far an update got; this page only reads it, so a reload shows a running update again. ---

  var KERNEL = /^linux-(image|generic|headers|modules|signed)/;

  function osActive() { return !!osStatus && (osStatus.state === "requested" || osStatus.state === "running"); }
  function osRecent(iso) { var t = Date.parse(iso); return isFinite(t) && Date.now() - t < 24 * 3600000; }
  function isServerMachine() { return !lastData || !lastData.serverMachine || lastData.serverMachine === lastData.machine; }
  function osHost() { var h = lastData && lastData.health; return (h && h.host) || {}; }
  function osBusy() { return osActive() || osLost || (osRunner && osRunner.state === "running"); }

  // What waits on this machine, with the packages the last run held back taken out once the figures are newer than that run.
  function osCounts() {
    var host = osHost();
    var pending = typeof host.updatesPending === "number" ? host.updatesPending : 0;
    var security = typeof host.securityUpdates === "number" ? host.securityUpdates : 0;
    var held = isServerMachine() && osStatus && osStatus.state === "succeeded" && osStatus.heldBack ? osStatus.heldBack : [];
    var measured = Date.parse(host.measuredAtUtc), finished = Date.parse(osStatus && osStatus.finishedAtUtc);
    var stale = held.length && isFinite(finished) && !(measured > finished); // the Runner has not measured since that run
    if (stale) { pending = held.length; security = 0; }
    return { pending: pending, security: security, held: held, installable: Math.max(0, pending - held.length) };
  }

  // The button shows only when an install could change something (owner, 2026-11-22).
  function osCanInstall() {
    var c = osCounts();
    return isServerMachine() ? c.security > 0 || c.installable > 0 : c.security > 0;
  }

  function osDuration() {
    var minutes = Math.max(1, Math.round((Date.parse(osStatus.finishedAtUtc) - Date.parse(osStatus.requestedAtUtc)) / 60000));
    return isFinite(minutes) ? " in " + plural(minutes, "minute") : "";
  }

  function osLastRun() {
    var s = osStatus;
    if (osRunner && osRunner.state === "running") return "running · started just now";
    if (s && osActive()) return "running · started " + when(s.requestedAtUtc);
    if (s && s.state === "succeeded" && s.finishedAtUtc) return when(s.finishedAtUtc) + " · installed " + (s.upgradedCount || 0);
    if (s && s.state === "failed") return when(s.finishedAtUtc) + " · failed" + (typeof s.progressCount === "number" ? " after " + s.progressCount : "");
    if (s && (s.state === "refused" || s.state === "unsupported")) return when(s.finishedAtUtc || s.requestedAtUtc) + " · " + s.state;
    return lastRun("OS updates");
  }

  function osPanel(name) {
    var s = osStatus || {}, c = osCounts();
    var log = s.logTail ? '<details class="os-log"><summary>Full log</summary><pre class="a-mono">' + esc(s.logTail) + "</pre></details>" : "";
    if (osLost) {
      return '<div class="os-panel os-panel--wait" role="status"><div class="os-panel__head"><b>Docker is restarting. This page lost its connection.</b><span class="muted">trying again in 5 s</span></div>' +
        '<div class="a-meter os-meter--idle" aria-hidden="true"><span style="--value:100%"></span></div>' +
        '<div>This is expected: updating Docker restarts every app for a minute, Server Keeper too. The update keeps running on the server; this row picks it up again when the app is back.</div></div>';
    }
    if (osActive()) {
      var total = s.totalCount, done = s.progressCount, known = typeof total === "number" && total > 0 && typeof done === "number";
      if (known) done = Math.min(done, total); // a security update can pull in dependencies the total did not count
      var percent = known ? Math.min(100, Math.round(100 * done / total)) : 0;
      return '<div class="os-panel os-panel--wait" role="status" id="os-running"><div class="os-panel__head"><b>' + (known ? "Installing " + plural(total, "package") : "Installing updates") + "</b><span class=\"muted\">started " + when(s.requestedAtUtc) + (known ? " · " + done + " of " + total : "") + "</span></div>" +
        (known ? '<div class="a-meter" role="progressbar" aria-label="Installing updates" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '"><span style="--value:' + percent + '%"></span></div>' : "") +
        '<div class="a-mono os-current">' + (s.currentPackage ? esc(s.currentPackage) : s.state === "requested" ? "Waiting for the server to start it…" : "Preparing…") + "</div></div>";
    }
    if (osRunner && osRunner.state === "running") return '<div class="os-panel os-panel--wait" role="status"><b>' + esc(osRunner.text) + '</b><div class="muted">This can take several minutes. Progress is not kept if you reload this page.</div></div>';
    if (osForm && isAdmin) {
      var server = isServerMachine(), all = osForm.scope === "all";
      var scopes = server ? [["security", "Security updates only", c.security > 0 ? plural(c.security, "package") + " Ubuntu marks as security." : "0 waiting now, so nothing would be installed.", c.security > 0],
        ["all", "All updates", plural(c.installable, "package") + ". " + (c.held.length ? "Packages apt holds back (" + c.held.join(", ") + ") wait for a full upgrade." : "A new kernel is held back until a full upgrade."), true]]
        : [["security", "Security updates only", plural(c.security, "package") + " Ubuntu marks as security. Runners install nothing else yet.", true]];
      var label = all ? "Install " + plural(c.installable, "update") : "Install security updates";
      return '<div id="os-confirm" class="os-panel os-panel--ask"><fieldset class="os-scopes"><legend>What to install</legend><div class="os-scopes__grid">' +
        scopes.map(function (x) { return '<button type="button" class="os-scope" data-scope="' + esc(x[0]) + '" aria-pressed="' + (osForm.scope === x[0]) + '"' + (x[3] ? "" : " disabled") + '><span class="os-scope__title">' + esc(x[1]) + '</span><span class="os-scope__desc">' + esc(x[2]) + "</span></button>"; }).join("") +
        '</div></fieldset><ul class="os-facts"><li>Takes a few minutes. Apps keep running; Docker restarts briefly if it is updated.</li><li>Config files you changed are kept.</li><li>' +
        (all ? "If it needs a restart afterwards, Restart server shows it." : "Installs only what Ubuntu marks as security.") + "</li></ul>" +
        '<div class="os-ask"><label class="os-ask__name"><span>Type <strong>' + esc(name) + '</strong> to confirm</span><input class="a-input" id="os-typed" autocomplete="off" spellcheck="false" placeholder="' + esc(name) + '" value="' + esc(osForm.typed || "") + '"></label>' +
        '<button class="a-btn" type="button" id="os-cancel">Cancel</button><button class="a-btn a-btn--primary" type="button" id="os-go"' + (osForm.typed === name ? "" : " disabled") + ">" + label + "</button></div>" +
        (osForm.error ? '<div class="a-note a-note--warning" id="os-error">' + osForm.error + "</div>" : "") + "</div>";
    }
    if (osRunner && !isServerMachine()) return '<div class="os-panel' + (osRunner.state === "failed" ? " os-panel--failed" : "") + '" role="status" id="os-result"><b>' + esc(osRunner.text) + "</b></div>";
    if (!isServerMachine()) return "";
    if (s.state === "failed" || ((s.state === "refused" || s.state === "unsupported") && osRecent(s.finishedAtUtc || s.requestedAtUtc))) {
      if (!osRecent(s.finishedAtUtc || s.requestedAtUtc)) return "";
      var failed = s.state === "failed";
      var head = failed ? "Stopped" + (typeof s.progressCount === "number" ? " after " + s.progressCount + (s.totalCount ? " of " + s.totalCount : "") : "") : s.message || "The update was not started.";
      return '<div class="os-panel os-panel--failed" role="alert" id="os-result"><div class="os-panel__text"><b class="tone--bad">' + esc(head) + "</b>" +
        (failed && s.errorLine ? '<span class="a-mono muted">' + esc(s.errorLine) + "</span>" : "") +
        (failed ? "<span>Nothing was rolled back. Apps are running. Try again, or fix it as root with <code class=\"a-mono\">dpkg --configure -a</code>.</span>" : "") + "</div>" +
        (isAdmin && s.state !== "unsupported" && osCanInstall() ? '<button class="a-btn" type="button" id="os-again">Try again…</button>' : "") + log + "</div>";
    }
    if (s.state === "succeeded" && osRecent(s.finishedAtUtc) && (osSeen || s.restartRequired || (s.heldBack || []).length)) {
      var held = s.heldBack || [], kernel = held.filter(function (n) { return KERNEL.test(n); })[0];
      var heldText = held.length ? plural(held.length, "package") + " held back" + (kernel ? ": the new kernel (" + kernel + ") needs a full upgrade as root. " : ": apt keeps it back until a full upgrade as root. ") : "";
      return '<div class="os-panel os-panel--done" role="status" id="os-result"><div class="os-panel__text"><b>Installed ' + plural(s.upgradedCount || 0, "update") + esc(osDuration()) + "</b><span>" + esc(heldText) + (s.restartRequired ? "A restart is needed to finish the update." : "No restart is needed.") + "</span></div>" + log +
        (isAdmin && s.restartRequired ? '<button class="a-btn" type="button" id="os-restart-tonight">Restart tonight 03:00</button><button class="a-btn a-btn--primary" type="button" id="os-restart-now">Restart now…</button>' : "") + "</div>";
    }
    return "";
  }

  function updatesRow() {
    var h = lastData && lastData.health;
    var host = (h && h.host) || {};
    var does = "Ubuntu packages; security first";
    if (typeof host.updatesPending !== "number") return row("updates", "OS updates", does, "unknown", "update counts need Ubuntu's update notifier on the server", "-", "", []);
    var c = osCounts(), name = chosenName(), server = isServerMachine();
    var kernel = c.held.filter(function (n) { return KERNEL.test(n); }).length > 0;
    var next, extra = "";
    if (!c.pending) next = "Up to date" + (host.rebootRequired ? " · restart needed" : "");
    else if (c.held.length && !c.installable && !c.security) next = '<span class="tone--attn">' + esc(c.held.length + " held back" + (kernel ? " (kernel)" : "")) + "</span>";
    else next = '<span class="tone--attn">' + esc(plural(c.pending, "update") + " · " + c.security + " security") + "</span>" + (host.rebootRequired ? " · restart needed" : "");
    if (c.held.length) extra = kernel ? "New kernel waiting: needs a full upgrade as root and a restart" : "Held back by apt: needs a full upgrade as root";
    var why = "";
    if (!server && c.pending && !c.security) why = "Runners other than the server install security updates only, and none is waiting here.";
    else if (!server && c.security && !approvedRunner(name)) why = APPROVAL;
    var button = "";
    if (isAdmin && name && (osBusy() || (osCanInstall() && (server || approvedRunner(name))))) {
      var open = !!osForm;
      button = osBusy() ? '<button class="a-btn" type="button" id="os-run" disabled>Installing…</button>'
        : '<button class="a-btn' + (open ? "" : " a-btn--primary") + '" type="button" id="os-run" aria-expanded="' + open + '">' + (open ? "Close" : server ? "Install…" : "Install security updates…") + "</button>";
    }
    var failed = server && osStatus && osStatus.state === "failed" && osRecent(osStatus.finishedAtUtc);
    var panel = osPanel(name);
    var notes = (extra ? '<div class="t-sub">' + esc(extra) + "</div>" : "") + (why ? '<div class="t-sub">' + esc(why) + "</div>" : "");
    return row("updates", "OS updates", does, failed ? "critical" : "ok", osLastRun(), next + notes, button, [], panel);
  }

  function updateOsBanner() {
    var box = document.getElementById("os-banner");
    if (!box) return;
    var on = osActive() || osLost;
    box.hidden = !on;
    box.innerHTML = on ? '<div class="a-banner a-banner--warning" role="status"><div class="a-banner__title">OS updates are installing on ' + esc((lastData && lastData.serverMachine) || chosenName() || "this server") + '.</div><span>Shown on every tab until it finishes. Leaving this page does not stop it.</span></div>' : "";
  }

  function tonight() {
    var d = new Date(); d.setHours(3, 0, 0, 0);
    if (d.getTime() < Date.now() + 3600000) d.setDate(d.getDate() + 1);
    return d;
  }

  function restartRow() {
    var does = "asks you to type the server's name; every app is unavailable until it is back";
    var name = chosenName();
    var info = restartInfo || {};
    var asking = restartOp && restartOp.asking;
    var busy = restartOp && restartOp.state === "waiting";
    var last = info.lastRestartedAtUtc ? when(info.lastRestartedAtUtc) : "not restarted from here yet";
    var plan = info.state === "scheduled" && info.restartAtUtc ? when(info.restartAtUtc) : "none planned";
    var ask = asking ? '<div id="restart-confirm" class="confirm"><span class="a-note a-note--warning">' + (restartOp.at ? "Restarts this server at " + esc(new Date(restartOp.at).toLocaleString()) + "." : "Restarts this server in about a minute.") +
      " Every app on it is unavailable until it is back. Type <strong>" + esc(name) + '</strong> to confirm.</span> ' +
      '<input class="a-input" id="restart-typed" autocomplete="off" spellcheck="false" aria-label="Type the server name" value="' + esc(restartOp.typed || "") + '"> ' +
      '<button class="a-btn" type="button" id="restart-go"' + (restartOp.typed === name ? "" : " disabled") + '>' + (restartOp.at ? "Restart tonight" : "Restart now") + '</button> <button class="a-btn" type="button" id="restart-cancel">Cancel</button></div>' : "";
    var note = !restartOp || asking ? "" : restartOp.needsApproval ? esc(APPROVAL) : '<span class="a-note' + (restartOp.state === "failed" ? " a-note--warning" : "") + '" id="restart-result">' + esc(restartOp.text) + "</span>";
    var off = busy || asking ? " disabled" : "";
    return row("restart", "Restart server", does, restartOp && restartOp.state === "failed" ? "warning" : info.state === "scheduled" ? "warning" : "ok", last, plan,
      isAdmin && name ? '<button class="a-btn" type="button" id="restart-tonight"' + off + ">Tonight 03:00</button> " + '<button class="a-btn" type="button" id="restart-now"' + off + ">Now…</button>" : "", [note, ask]);
  }

  function paintTasks() {
    if (!lastData) return;
    updateOsBanner();
    // Do not redraw under someone typing in the settings form.
    if (cleanupEdit && document.activeElement && /^cs-/.test(document.activeElement.id || "")) return;
    if (osForm && document.activeElement && document.activeElement.id === "os-typed") return;
    if (restartOp && restartOp.asking && document.activeElement && document.activeElement.id === "restart-typed") return;
    tasksBox.hidden = false;
    tasksBox.innerHTML = '<div class="tasks" id="maintenance">' +
      cleanupRow() + backupRow() + upgradeRow() + updatesRow() + restartRow() + "</div>";
    UI.updateRelativeTimes(tasksBox);
    refreshOverview();
  }

  // After an install the figures are old: have the app read the server again now and once more a minute later.
  function reread() {
    var again = function () { post("api/tasks/refresh").then(load, load); };
    again(); setTimeout(again, 60000);
  }

  // Reads the server's record of the OS update. While one runs (or this page lost its connection) it asks again every 5 s,
  // otherwise once a minute. A failed read while an update runs means "reconnecting", never "failed".
  function readOsStatus() {
    clearTimeout(osTimer);
    return fetch("api/tasks/os-updates", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
      var watching = osActive() || osLost;
      if (data.status === "ok" && data.data) {
        if (osLost) loadAdmin(); // the app was away: read who the viewer is again
        osStatus = data.data; osLost = false;
        if (watching && !osActive()) { osSeen = true; reread(); }
      } else if (watching) osLost = true;
    }).catch(function () { if (osActive() || osLost) osLost = true; }).then(function () {
      paintTasks();
      osTimer = setTimeout(readOsStatus, osActive() || osLost ? 5000 : 60000);
    });
  }

  function openOsPanel() {
    if (!isAdmin || osBusy() || !osCanInstall()) return;
    var c = osCounts();
    osForm = { scope: isServerMachine() && c.security === 0 ? "all" : "security", typed: "" };
    paintTasks();
    var box = document.getElementById("os-typed"); if (box) box.focus();
  }

  function runRunnerUpdates() {
    var item = approvedRunner(chosenName()), name = chosenName(), typed = osForm.typed;
    if (!item) { osForm.error = esc(APPROVAL); return paintTasks(); }
    osForm = null;
    osRunner = { state: "running", text: "Installing security updates on " + name + "…" };
    paintTasks();
    fetch("api/maintenance/os-update?runner=" + encodeURIComponent(item.runnerId), { method: "POST", cache: "no-store",
      headers: { "X-Server-Console": "1", "X-Confirm-Machine": encodeURIComponent(typed), "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) })
      .then(function (r) { return r.json(); }).then(function (data) {
        osRunner = data.status === "ok" ? { state: "done", text: "Security updates were installed on " + name + "." }
          : { state: "failed", text: data.status === "forbidden" || data.status === "not_approved" ? "Only a system administrator can do this, on a machine approved for this app." : data.message || "The updates were not installed." };
        reread(); paintTasks();
      }).catch(function () { osRunner = { state: "failed", text: "The app could not be reached. Check the machine before trying again." }; paintTasks(); });
  }

  function runOsUpdates() {
    var name = chosenName();
    if (!osForm || osForm.typed !== name) return;
    if (!isServerMachine()) return runRunnerUpdates();
    var scope = osForm.scope;
    osForm.error = null;
    post("api/tasks/os-updates", { scope: scope }).then(function (data) {
      if (data.status === "ok") {
        osForm = null; osSeen = true; osLost = false;
        osStatus = { state: "requested", scope: scope, requestedAtUtc: new Date().toISOString() };
        paintTasks();
        return setTimeout(readOsStatus, 3000);
      }
      osForm.error = data.status === "forbidden" || data.status === "not_approved" ? esc(APPROVAL)
        : data.status === "not_found" ? "This server cannot install updates from Studio yet. Update Automaton, or run sudo apt upgrade on the server."
        : esc(data.message || "The updates could not be started.");
      paintTasks();
    }).catch(function () { if (osForm) osForm.error = "The app could not be reached."; paintTasks(); });
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
    var hb = event.target.closest && event.target.closest("[data-hist],[data-hist-toggle],[data-hist-older]");
    if (hb) {
      if (hb.hasAttribute("data-hist-older")) histAll[hb.getAttribute("data-hist-older")] = true;
      else if (hb.hasAttribute("data-hist-toggle")) { var k = hb.getAttribute("data-hist-toggle"); histOpen[k] = !histOpen[k]; }
      else histOpen[hb.getAttribute("data-hist")] = true;
      paintTasks();
      return;
    }
    var id = event.target.id;
    if (id === "cleanup-run") runCleanupNow();
    else if (id === "cleanup-settings") { cleanupEdit = !cleanupEdit; cleanupOp = null; paintTasks(); }
    else if (id === "cleanup-cancel") { cleanupEdit = false; cleanupOp = null; paintTasks(); }
    else if (id === "cleanup-save") saveCleanup();
    else if (id === "backup-run") runBackupNow();
    else if (id === "os-run") { if (osForm) { osForm = null; paintTasks(); } else openOsPanel(); }
    else if (id === "os-again") openOsPanel();
    else if (id === "os-cancel") { osForm = null; paintTasks(); }
    else if (id === "os-go") runOsUpdates();
    else if (event.target.closest("[data-scope]")) { var pick = event.target.closest("[data-scope]"); if (osForm && !pick.disabled) { osForm.scope = pick.getAttribute("data-scope"); paintTasks(); } }
    else if (id === "os-restart-now" || id === "os-restart-tonight") {
      restartOp = { asking: true, typed: "", at: id === "os-restart-tonight" ? tonight().toISOString() : null }; paintTasks();
      var target = document.getElementById("restart-typed"); if (target) { target.scrollIntoView({ block: "center" }); target.focus(); }
    }
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
    if (event.target.id !== "os-typed" || !osForm) return;
    osForm.typed = event.target.value;
    var go = document.getElementById("os-go");
    if (go) go.disabled = osForm.typed !== chosenName();
  });

  function loadAdmin() {
    return fetch("api/tasks", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) { isAdmin = data.admin === true; paintTasks(); paintAppParts(); }).catch(function () { /* read-only */ });
  }
  loadAdmin();
  loadRestart().then(paintTasks).catch(function () { /* older server */ });
  readOsStatus();

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
    if (act === "os-install") openOsPanel();
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
