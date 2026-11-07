/* Server Console page. Built only from the Automaton app UI kit in ui/. */
(function () {
  "use strict";

  var UI = window.AutomatonUI;
  var esc = UI.escapeHtml;
  var view = document.getElementById("view");
  var overall = document.getElementById("overall");
  var subtitle = document.getElementById("subtitle");
  var signout = document.getElementById("signout");
  var TOKEN_KEY = "server-console-token";
  var LABELS = { ok: "OK", warning: "Warning", critical: "Critical", unknown: "No data" };

  function token() { try { return window.sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(value) { try { if (value) window.sessionStorage.setItem(TOKEN_KEY, value); else window.sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* kept for this page only */ } }

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

  function resourcesCard(h, a, history) {
    var host = h.host || {};
    var memoryUsed = typeof host.memoryTotalBytes === "number" && host.memoryTotalBytes > 0 ? 100 - 100 * host.memoryAvailableBytes / host.memoryTotalBytes : null;
    var diskUsed = typeof host.diskTotalBytes === "number" && host.diskTotalBytes > 0 ? 100 - 100 * host.diskAvailableBytes / host.diskTotalBytes : null;
    var docker = (host.dockerImagesBytes || 0) + (host.dockerContainersBytes || 0) + (host.dockerVolumesBytes || 0) + (host.dockerBuildCacheBytes || 0);
    var load = typeof host.load1 === "number" ? [host.load1, host.load5, host.load15].map(function (v) { return v.toFixed(2); }).join(" / ") : "-";
    var body = metric("CPU", host.cpuPercent, a.cpu, history, "cpu") +
      metric("Memory used" + (typeof host.memoryTotalBytes === "number" ? " of " + UI.formatBytes(host.memoryTotalBytes) : ""), memoryUsed, a.memory, history, "mem") +
      metric("Disk used" + (typeof host.diskTotalBytes === "number" ? " of " + UI.formatBytes(host.diskTotalBytes) : ""), diskUsed, a.disk, history, "disk") +
      '<dl class="a-kv" style="margin-top:6px"><dt>Disk free</dt><dd>' + (typeof host.diskAvailableBytes === "number" ? esc(UI.formatBytes(host.diskAvailableBytes)) : "-") +
      "</dd><dt>Load 1 / 5 / 15 min" + (host.cpuCount ? " (" + esc(String(host.cpuCount)) + " CPUs)" : "") + '</dt><dd class="a-mono">' + esc(load) +
      "</dd><dt>Docker disk use</dt><dd>" + (docker > 0 ? esc(UI.formatBytes(docker)) : "-") + "</dd></dl>";
    var stale = a.freshness === "warning" ? '<p class="a-note a-note--warning" style="margin-top:12px">The Runner has not reported for a while; these figures are old.</p>' : "";
    var foot = "History: the last 24 hours, one point every few minutes.";
    return card("Resources", a.resources, body + stale, foot);
  }

  function backupsCard(h, a) {
    var b = h.backup || {};
    var body;
    if (!b.available) {
      body = '<div class="a-empty"><div class="a-empty__title">No backup status</div>Run the latest server update to enable nightly backups.</div>';
    } else {
      var age = typeof b.lastSuccessAgeHours === "number" ? (b.lastSuccessAgeHours < 48 ? Math.round(b.lastSuccessAgeHours) + " hours" : Math.round(b.lastSuccessAgeHours / 24) + " days") : "-";
      body = '<div class="a-stats">' + stat("Last successful backup", b.lastSuccessAt ? esc(age) + " <small>ago</small>" : "never", "", a.backup) + "</div>" +
        (b.lastError ? '<p class="a-note a-note--critical" style="margin-top:12px">' + esc(b.lastError) + "</p>" : "");
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
    view.innerHTML = activeAlerts(data) + '<div class="a-grid a-grid--wide"><div class="a-stack">' + serverCard(h, a) + updatesCard(h, a) + "</div>" +
      resourcesCard(h, a, history) + "</div>" +
      '<div class="a-grid" style="margin-top:16px">' + runnersCard(h, a) + backupsCard(h, a) + certificatesCard(h, a) + "</div>";
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

  function needToken() {
    waiting("Set an access token",
      "This page shows your server's details, so it stays closed until you protect it with a token.",
      ["In Studio open this app's <strong>Settings</strong> and add the secret <span class=\"a-mono\">ADMIN_TOKEN</span>: at least 16 random characters.",
        "Restart the app so it picks the secret up, then reload this page and sign in with the token."]);
    subtitle.textContent = "Not protected yet";
  }

  function login(error) {
    overall.hidden = true;
    view.innerHTML = '<section class="a-card" style="max-width:440px;margin:0 auto"><div class="a-card__head"><h2 class="a-card__title">Sign in</h2></div>' +
      '<form class="a-form" id="login"><div class="a-field"><label class="a-label" for="token">Access token</label>' +
      '<input class="a-input" id="token" type="password" autocomplete="current-password" required><span class="a-hint">The ADMIN_TOKEN secret of this app.</span></div>' +
      (error ? '<p class="a-note a-note--critical">' + esc(error) + "</p>" : "") + '<button class="a-btn a-btn--primary" type="submit">Open the console</button></form></section>';
    subtitle.textContent = "Sign in to continue";
    document.getElementById("login").addEventListener("submit", function (event) {
      event.preventDefault();
      setToken(document.getElementById("token").value.trim());
      load();
    });
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
    var headers = token() ? { Authorization: "Bearer " + token() } : {};
    fetch("api/state", { headers: headers, cache: "no-store" }).then(function (response) {
      if (response.status === 503) { signout.hidden = true; return fetch("api/status").then(function (r) { return r.json(); }).then(function (s) { if (s.status === "no_key" || s.status === "not_approved") needApproval(s.status); else needToken(); }); }
      if (response.status === 401) {
        signout.hidden = true;
        var hadToken = !!token();
        setToken("");
        return fetch("api/status").then(function (r) { return r.json(); }).then(function (s) {
          if (s.status === "no_key" || s.status === "not_approved") needApproval(s.status);
          else login(hadToken ? "That token was not accepted." : "");
        });
      }
      return response.json().then(function (data) {
        signout.hidden = false;
        if (data.status === "no_key" || data.status === "not_approved") return needApproval(data.status);
        if (!data.health) return problem(data);
        dashboard(data);
      });
    }).catch(function () {
      view.innerHTML = '<div class="a-empty"><div class="a-empty__title">Cannot reach the app</div>Retrying shortly.</div>';
    });
  }

  signout.addEventListener("click", function () { setToken(""); signout.hidden = true; load(); });
  UI.bindThemeToggle();
  load();
  setInterval(load, 30000);
  setInterval(function () { UI.updateRelativeTimes(document); }, 30000);
})();
