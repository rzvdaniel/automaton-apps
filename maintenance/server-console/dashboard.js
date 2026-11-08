/* Server Console page. Built only from the Automaton app UI kit in ui/. */
(function () {
  "use strict";

  var UI = window.AutomatonUI;
  var esc = UI.escapeHtml;
  var view = document.getElementById("view");
  var overall = document.getElementById("overall");
  var subtitle = document.getElementById("subtitle");
  var LABELS = { ok: "OK", warning: "Warning", critical: "Critical", unknown: "No data" };


  function pill(status, text) {
    var cls = status === "ok" || status === "warning" || status === "critical" ? " a-pill--" + status : "";
    return '<span class="a-pill' + cls + '">' + esc(text || LABELS[status] || LABELS.unknown) + "</span>";
  }

  function card(title, status, body, foot) {
    return '<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">' + esc(title) + "</h2>" + pill(status) + "</div>" +
      body + (foot ? '<p class="a-card__foot">' + foot + "</p>" : "") + "</section>";
  }

  function stat(label, value, hint, status) {
    return '<div class="a-stat' + (status === "warning" || status === "critical" || status === "ok" ? " a-stat--" + status : "") + '"><div class="a-stat__label">' +
      esc(label) + '</div><div class="a-stat__value">' + value + "</div>" + (hint ? '<div class="a-stat__hint">' + hint + "</div>" : "") + "</div>";
  }

  function num(value, unit) {
    return typeof value === "number" ? esc(String(value)) + (unit ? " <small>" + unit + "</small>" : "") : "-";
  }

  function pct(value) { return typeof value === "number" ? Math.round(value * 10) / 10 : null; }

  function metric(name, value, status, history, key) {
    var shown = pct(value);
    var series = history.map(function (item) { return item[key]; });
    var cls = status === "warning" || status === "critical" ? " a-meter--" + status : "";
    return '<div class="a-metric"><div class="a-metric__row"><span class="a-metric__name">' + esc(name) + '</span><span class="a-metric__value">' +
      (shown === null ? "-" : shown + "%") + '</span></div><div class="a-meter' + cls + '" style="--value:' + (shown === null ? 0 : Math.min(100, shown)) +
      '%"><span></span></div><div class="a-metric__spark">' +
      UI.sparkline(series, key === "cpu" ? { min: 0, max: 100, status: status, label: name + ", last 24 hours" } : { status: status, label: name + ", last 24 hours" }) + "</div></div>";
  }

  function when(iso) { return iso ? '<time datetime="' + esc(iso) + '" data-rel></time>' : "never"; }

  function serverCard(h, a) {
    var s = h.server || {};
    var host = h.host || {};
    var update = s.updateAvailable === true ? pill("warning", "Update available") : s.updateAvailable === false ? pill("ok", "Up to date") : pill("unknown", "Unknown");
    var body = '<dl class="a-kv"><dt>Automaton</dt><dd class="a-mono">' + esc(s.version || "-") + "</dd><dt>Latest release</dt><dd class=\"a-mono\">" + esc(s.latestVersion || "unknown") +
      "</dd><dt>Release check</dt><dd>" + update + "</dd><dt>Operating system</dt><dd>" + esc(host.osName || "-") + "</dd><dt>Uptime</dt><dd>" +
      (typeof host.uptimeSeconds === "number" ? esc(UI.formatDuration(host.uptimeSeconds)) : "-") + "</dd></dl>";
    return card("Server", a.server, body);
  }

  function runnersCard(h, a) {
    var runners = h.runners || [];
    var body = runners.length ? '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Runner</th><th class="a-num">Version</th><th>Status</th></tr></thead><tbody>' +
      runners.map(function (r) {
        var online = String(r.status || "").toLowerCase() === "online";
        var status = !online ? pill("critical", r.status || "offline") : r.upgradeAvailable ? pill("warning", "Upgrade available") : pill("ok", "Online");
        return "<tr><td>" + esc(r.name) + '</td><td class="a-num a-mono">' + esc(r.version || "-") + "</td><td>" + status + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="a-empty"><div class="a-empty__title">No Runners</div>No Machine Management Runner is registered.</div>';
    return card("Runners", a.runners, body);
  }

  function updatesCard(h, a) {
    var host = h.host || {};
    var securityHint = a.securityDays !== null && a.securityDays !== undefined ? "waiting " + esc(String(a.securityDays)) + " days" : "";
    var reboot = host.rebootRequired === true ? pill(a.reboot, "Restart required") : host.rebootRequired === false ? pill("ok", "No restart needed") : pill("unknown", "Unknown");
    var body = '<div class="a-stats">' + stat("Pending updates", num(host.updatesPending), "", a.pending) +
      stat("Security updates", num(host.securityUpdates), securityHint, a.security) + "</div>" +
      '<dl class="a-kv" style="margin-top:14px"><dt>Restart</dt><dd>' + reboot + "</dd>" +
      (host.rebootRequired === true ? "<dt>Required since</dt><dd>" + when(host.rebootRequiredSinceUtc) + "</dd>" : "") + "</dl>";
    var foot = host.updatesPending === null || host.updatesPending === undefined ? "Update counts need Ubuntu's update notifier on the server." : "";
    return card("Updates", a.updates, body, foot);
  }

  var DAY_SECONDS = 86400;

  /* Inline SVG area chart of one series over the last 24 hours. Colours come from console.css. */
  function chart(name, history, key, status, now) {
    var W = 600, H = 150, L = 34, R = 8, T = 8, B = 8;
    var pw = W - L - R, ph = H - T - B;
    var start = now - DAY_SECONDS;
    var points = history.filter(function (i) { return typeof i[key] === "number" && i.t >= start; });
    var cls = status === "warning" || status === "critical" ? " c-chart--" + status : "";
    var grid = [0, 50, 100].map(function (v) {
      var y = T + ph - ph * v / 100;
      return '<line class="c-chart__grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="c-chart__tick" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + v + "%</text>";
    }).join("");
    var summary = "No data in the last 24 hours.";
    var plot = "";
    if (points.length) {
      var xy = points.map(function (i) {
        return [L + pw * (i.t - start) / DAY_SECONDS, T + ph - ph * Math.max(0, Math.min(100, i[key])) / 100];
      });
      var line = xy.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
      var last = xy[xy.length - 1], first = xy[0];
      plot = '<polygon class="c-chart__area" points="' + first[0].toFixed(1) + "," + (T + ph) + " " + line + " " + last[0].toFixed(1) + "," + (T + ph) + '"/>' +
        '<polyline class="c-chart__line" points="' + line + '"/><circle class="c-chart__dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5"/>';
      var values = points.map(function (i) { return i[key]; });
      var avg = values.reduce(function (x, y) { return x + y; }, 0) / values.length;
      summary = "Lowest " + Math.round(Math.min.apply(null, values)) + "%, average " + Math.round(avg) + "%, highest " + Math.round(Math.max.apply(null, values)) + "%.";
    }
    var svg = '<svg class="c-chart__svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(name + ", last 24 hours. " + summary) + '">' + grid + plot + "</svg>";
    return '<section class="a-card c-chart' + cls + '"><div class="a-card__head"><h2 class="a-card__title">' + esc(name) + " &middot; 24 hours</h2>" + pill(status) + "</div>" +
      svg + '<div class="c-chart__axis" aria-hidden="true"><span>24 h ago</span><span>12 h ago</span><span>now</span></div><p class="a-card__foot">' + esc(summary) + "</p></section>";
  }

  function tiles(h, a) {
    var host = h.host || {};
    var memoryUsed = typeof host.memoryTotalBytes === "number" && host.memoryTotalBytes > 0 ? 100 - 100 * host.memoryAvailableBytes / host.memoryTotalBytes : null;
    var diskUsed = typeof host.diskTotalBytes === "number" && host.diskTotalBytes > 0 ? 100 - 100 * host.diskAvailableBytes / host.diskTotalBytes : null;
    var docker = (host.dockerImagesBytes || 0) + (host.dockerContainersBytes || 0) + (host.dockerVolumesBytes || 0) + (host.dockerBuildCacheBytes || 0);
    function p(v) { return v === null ? "-" : Math.round(v) + " <small>%</small>"; }
    return '<div class="a-card"><div class="a-stats c-tiles">' +
      stat("CPU", p(typeof host.cpuPercent === "number" ? host.cpuPercent : null), host.cpuCount ? esc(String(host.cpuCount)) + " CPUs" : "", a.cpu) +
      stat("Memory", p(memoryUsed), typeof host.memoryTotalBytes === "number" ? "of " + esc(UI.formatBytes(host.memoryTotalBytes)) : "", a.memory) +
      stat("Disk", p(diskUsed), typeof host.diskAvailableBytes === "number" ? esc(UI.formatBytes(host.diskAvailableBytes)) + " free" : "", a.disk) +
      stat("Load (5 min)", typeof host.load5 === "number" ? esc(host.load5.toFixed(2)) : "-", host.cpuCount ? "per " + esc(String(host.cpuCount)) + " CPUs" : "", a.load) +
      stat("Docker disk use", docker > 0 ? esc(UI.formatBytes(docker)) : "-", "", "") + "</div></div>";
  }

  function badges(h, a) {
    var host = h.host || {};
    var reboot = host.rebootRequired === true ? pill(a.reboot, "Restart required") : host.rebootRequired === false ? pill("ok", "No restart needed") : pill("unknown", "Restart: no data");
    var sec = typeof host.securityUpdates === "number" ? pill(a.security, host.securityUpdates + (host.securityUpdates === 1 ? " security update" : " security updates")) : pill("unknown", "Security updates: no data");
    var pend = typeof host.updatesPending === "number" ? pill(a.pending, host.updatesPending + " pending") : pill("unknown", "Updates: no data");
    var hint = a.securityDays !== null && a.securityDays !== undefined ? "Security updates have been waiting " + esc(String(a.securityDays)) + " days. " : "";
    var since = host.rebootRequired === true && host.rebootRequiredSinceUtc ? "Restart required since " + when(host.rebootRequiredSinceUtc) + ". " : "";
    var foot = hint + since + (host.updatesPending === null || host.updatesPending === undefined ? "Update counts need Ubuntu's update notifier on the server." : "");
    return card("Operating system updates", a.updates, '<div class="c-badges">' + reboot + sec + pend + "</div>", foot);
  }

  function statusRows(h, a) {
    var b = h.backup || {};
    var rows = [];
    if (!b.available) {
      rows.push('<li><span>Backup</span>' + pill("unknown", "No backup status") + "</li>");
    } else {
      var age = typeof b.lastSuccessAgeHours === "number" ? (b.lastSuccessAgeHours < 48 ? Math.round(b.lastSuccessAgeHours) + " hours ago" : Math.round(b.lastSuccessAgeHours / 24) + " days ago") : "never";
      rows.push("<li><span>Last backup</span>" + pill(a.backup, b.lastSuccessAt ? age : "Never succeeded") + "</li>");
      if (b.lastError) rows.push('<li><span class="a-muted">' + esc(b.lastError) + "</span></li>");
    }
    (h.certificates || []).forEach(function (c) {
      var unreadable = c.daysRemaining === null || c.daysRemaining === undefined;
      var status = unreadable || c.daysRemaining <= 7 ? "critical" : c.daysRemaining <= 14 ? "warning" : "ok";
      rows.push('<li><span class="a-mono">' + esc(c.host) + "</span>" + pill(status, unreadable ? "Unreadable" : "Expires in " + c.daysRemaining + (c.daysRemaining === 1 ? " day" : " days")) + "</li>");
    });
    return card("Backups and certificates", UI_worst([a.backup, a.certificates]), '<ul class="a-list">' + rows.join("") + "</ul>",
      "Certificates show days until each public host name expires.");
  }

  function UI_worst(list) {
    var rank = { critical: 3, warning: 2, ok: 1, unknown: 0 };
    return list.reduce(function (w, x) { return (rank[x] || 0) > (rank[w] || 0) ? x : w; }, "unknown");
  }

  function alertsCard(data) {
    var s = data.settings || {};
    var body = s.webhookConfigured
      ? "<p>Alerts are on and go to <span class=\"a-mono\">" + esc(s.webhookHost || "your webhook") + "</span>. One message is sent when the disk runs low (under " + esc(String(s.diskFreePercent)) +
        "% free), security updates wait over " + esc(String(s.securityUpdateDays)) + " days or a restart is overdue by " + esc(String(s.rebootDays)) + " days, and one when it is resolved.</p>"
      : "<p>Alerts are off. Add a <span class=\"a-mono\">WEBHOOK_URL</span> secret in Studio to turn them on.</p>";
    return card("Alerts", s.webhookConfigured ? "ok" : "unknown", body,
      s.webhookConfigured ? "" : "In Studio: the app's Settings, Secrets, Add a secret. Use a Slack, Discord or Telegram webhook, or any URL that accepts a JSON POST, then redeploy.");
  }

  function activeAlerts(data) {
    var stale = data.status === "error" ? '<div class="a-note a-note--warning" style="margin-bottom:16px">The last check failed (' + esc(data.message || "unknown error") + "), so these figures are from the last good check.</div>" : "";
    var names = Object.keys(data.alerts || {});
    if (!names.length) return stale;
    return stale + '<div class="a-note a-note--warning" style="margin-bottom:16px"><strong>Active warnings:</strong> ' +
      names.map(function (n) { return esc(data.alerts[n].message); }).join("; ") + "</div>";
  }

  function dashboard(data) {
    var h = data.health, a = data.assessment;
    var history = data.history || [];
    var now = data.now || Math.floor(Date.now() / 1000);
    view.innerHTML = activeAlerts(data) + tiles(h, a) +
      '<div class="a-grid a-grid--wide c-charts" style="margin-top:16px">' + chart("CPU", history, "cpu", a.cpu, now) + chart("Memory", history, "mem", a.memory, now) + chart("Disk", history, "disk", a.disk, now) + "</div>" +
      '<div class="a-grid a-grid--wide" style="margin-top:16px"><div class="a-stack">' + statusRows(h, a) + badges(h, a) + '</div><div class="a-stack">' + serverCard(h, a) + runnersCard(h, a) + "</div></div>" +
      '<div style="margin-top:16px">' + alertsCard(data) + "</div>";
    overall.hidden = false;
    overall.className = "a-pill a-pill--large" + (a.overall !== "unknown" ? " a-pill--" + a.overall : "");
    overall.textContent = a.overall === "ok" ? "All good" : a.overall === "warning" ? "Needs attention" : a.overall === "critical" ? "Action needed" : "No data";
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
    var message = data.status === "not_configured" ? "Set the <span class=\"a-mono\">API_BASE_URL</span> setting to the address of your server's API, then restart the app."
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
