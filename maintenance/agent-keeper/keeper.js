(function () {
  "use strict";
  var esc = AutomatonUI.escapeHtml;
  var view = document.getElementById("view");
  var subtitle = document.getElementById("subtitle");
  var overall = document.getElementById("overall");
  var tabN = document.getElementById("tab-n");
  var TABS = ["queue", "machine", "setup"];
  var state = null, queue = null, latest = {}, tokenProblem = null, message = "", poll = null, tab = "queue", refreshTimer = null;
  var LABELS = { setup: "Set up", status: "Refresh status", remove: "Remove", "update-tools": "Update tools" };
  var REFRESH_MS = 5 * 60 * 1000;

  AutomatonUI.bindThemeToggle();

  function when(seconds, long) {
    if (!seconds) return "";
    var d = new Date(seconds * 1000);
    return long ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function request(path, options) {
    options = options || {};
    options.cache = "no-store";
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) { return { ok: response.ok, code: response.status, body: body }; });
    });
  }

  function post(path, payload) {
    return request(path, { method: "POST", headers: { "X-Agent-Keeper": "1", "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  }

  function pill(text, tone) {
    overall.textContent = text;
    overall.className = "a-pill a-pill--large" + (tone ? " a-pill--" + tone : "");
    overall.hidden = false;
  }

  function link(url, text, cls) {
    return /^https:\/\/github\.com\//.test(url || "") ? '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>" : esc(text);
  }

  function ref(card) { return (card.short === "automaton" ? "" : card.short) + "#" + card.number; }
  function issue(card) { return "<b>" + esc(ref(card)) + "</b> " + esc(card.title); }
  function parsed() { return state.status && state.status.parsed; }
  function needsSetup() { var p = parsed(); return !!(p && !p.registered); }
  function setupAt() { var l = state.last && state.last.setup; return l && l.status === "ok" && l.exitCode === 0 ? l.endedAt || l.at : null; }
  function setupNote() {
    return '<div class="a-waiting"><h2 class="a-waiting__title">Set up this machine</h2><p>This machine is not a GitHub agent machine yet, so nothing is picked up. ' +
      '<a href="#setup">Go to Setup</a>.</p></div>';
  }

  function tokenNote() {
    return tokenProblem ? '<div class="a-banner a-banner--critical" role="alert"><div class="a-banner__title">Pick up cannot work</div><div>' + esc(tokenProblem) + "</div></div>" : "";
  }

  function stat(label, value, hint, tone) {
    return '<div class="a-stat' + (tone ? " a-stat--" + tone : "") + '"><div class="a-stat__label">' + esc(label) + '</div><div class="a-stat__value">' + esc(value) + '</div><div class="a-stat__hint">' + esc(hint) + "</div></div>";
  }

  function phases(card) {
    var hasPr = !!card.pr, review = card.status === "Verify";
    var names = ["Picked", "Implement", "Pull request", "Review and merge gate", "Verify"];
    var current = review ? 4 : hasPr ? 3 : 1;
    return '<ol class="phases" aria-label="Run steps">' + names.map(function (n, i) { return '<li class="' + (i < current ? "done" : i === current ? "on" : "") + '">' + esc(n) + "</li>"; }).join("") + "</ol>";
  }

  function renderQueue() {
    if (state.missing) return '<section class="a-waiting"><h2 class="a-waiting__title">Not configured</h2><p>' + esc(state.missing) + "</p></section>";
    var html = tokenNote() + (needsSetup() ? setupNote() : "");
    if (!queue) return html + '<p class="a-empty">Loading the queue.</p>';
    if (!queue.ok) return html + '<div class="a-note a-note--warning" role="alert">' + esc(queue.message) + "</div>";
    var q = queue.data, failed = q.failed, ready = q.ready.filter(function (c) { return c.shaped; }), recent = q.runs.filter(function (r) { return r.endedAt; });
    var lastStart = q.runs.length ? q.runs[0].startedAt : null;
    if (failed.length) {
      html += '<div class="a-banner a-banner--warning" role="status"><div class="a-banner__title">' + failed.length + (failed.length === 1 ? " card needs you" : " cards need you") + "</div><div>" +
        issue(failed[0]) + ': the last run failed. Read the run, then press <b>Run again</b>.</div></div>';
    }
    html += '<div class="a-stats">' +
      stat("Pick up", "Every 10 min", "Pick up Action, set in Studio, Actions" + (lastStart ? " · last agent run started " + when(lastStart) : "")) +
      stat("Ready for agents", String(ready.length), state.config.repo ? ready.length ? "next: " + ref(ready[0]) : "nothing waiting" : "") +
      stat("Done today", String(q.doneToday), "agent runs that finished well") +
      stat("Needs you", String(failed.length), failed.length ? "failed run waiting for you" : "nothing failed", failed.length ? "warning" : "") + "</div>";
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Running now</h2>' + (q.running.length ? '<span class="a-pill a-pill--running">running' + (q.running[0].started ? " since " + esc(when(q.running[0].started)) : "") + "</span>" : "") + "</div>";
    if (!q.running.length) html += '<p class="a-hint">No agent issue is running.</p>';
    q.running.forEach(function (c) {
      html += '<div class="job"><div class="job__main">' + link(c.url, ref(c) + " " + c.title, "job__title") + '<div class="a-muted small">' + esc(c.short) +
        (c.pr ? " · pull request " + link(c.pr.url, "#" + c.pr.number) + " opened" : " · no pull request yet") + "</div></div></div>" + phases(c);
    });
    html += "</div>";
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Needs you</h2>' + (failed.length ? '<span class="a-pill a-pill--warning">' + failed.length + " failed</span>" : "") + "</div>";
    if (!failed.length) html += '<p class="a-hint">No failed card.</p>';
    var locked = state.admin ? "" : " disabled";
    failed.forEach(function (c) {
      html += '<div class="row"><span class="dot dot--warn" aria-hidden="true"></span><div class="row__main"><div>' + issue(c) + '</div><div class="a-muted small">' + esc(c.short) +
        (c.at ? " · failed " + esc(when(c.at)) : "") + (c.reason ? " · " + esc(c.reason) : "") + '</div></div><div class="row__act">' +
        (c.readUrl ? link(c.readUrl, "Read run", "a-btn") : "") +
        '<button class="a-btn a-btn--primary" type="button" data-again="' + esc(c.repo) + "#" + esc(c.number) + '"' + locked + ">Run again</button></div></div>";
    });
    if (failed.length) html += '<p class="a-hint">A failed card stays here, out of the line below, until you run it again or move it back to Inbox.' + (state.admin ? "" : " Only a system administrator can run it again.") + "</p>";
    html += "</div>";
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Next up</h2><span class="a-muted small">order of Ready for agents on board ' + esc(state.board) + "</span></div>";
    if (!q.ready.length) html += '<p class="a-hint">Nothing is waiting in Ready for agents.</p>';
    q.ready.slice(0, 8).forEach(function (c, i) {
      var first = ready.length && c === ready[0];
      html += '<div class="row"><span class="num">' + (c.shaped ? i + 1 : "!") + '</span><div class="row__main"><div>' + issue(c) + '</div><div class="a-muted small">' + esc(c.short) + (c.shaped ? "" : ' · no "Done when"') + "</div></div>" +
        (!c.shaped ? '<span class="a-pill a-pill--warning">goes to Inbox</span>' : '<span class="a-pill">' + (first ? "next" : "queued") + "</span>") + "</div>";
    });
    html += "</div>";
    var bars = recent.slice(0, 10).reverse().map(function (r) { return "<i" + (r.result === "success" ? "" : ' class="f"') + "></i>"; }).join("");
    var bad = recent.slice(0, 10).filter(function (r) { return r.result !== "success"; }).length;
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Recent runs</h2><div class="bars" aria-label="Last ' + Math.min(10, recent.length) + " runs: " + bad + ' did not succeed">' + bars + "</div></div>";
    if (!recent.length) html += '<p class="a-hint">No run yet.</p>';
    else {
      html += '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Run</th><th>Result</th><th class="a-num">Took</th><th>Ended</th></tr></thead><tbody>';
      recent.forEach(function (r) {
        var ok = r.result === "success";
        html += "<tr><td>" + link(r.url, r.title || "Agent run") + '</td><td><span class="dot' + (ok ? "" : " dot--warn") + '"></span> ' + esc(ok ? "finished" : r.result.replace(/_/g, " ")) + '</td><td class="a-num">' +
          esc(AutomatonUI.formatDuration(Math.max(0, r.endedAt - r.startedAt))) + "</td><td>" + esc(when(r.endedAt)) + "</td></tr>";
      });
      html += "</tbody></table></div>";
    }
    return html + "</div>";
  }

  function diskMetric(name, where, used, total) {
    var pct = Math.round(100 * used / total), free = 100 - pct;
    return '<div class="a-metric"><div class="a-metric__row"><span><b>' + esc(name) + '</b> <span class="a-muted small">' + esc(where) + '</span></span><span class="tn">' +
      esc(AutomatonUI.formatBytes(used)) + " of " + esc(AutomatonUI.formatBytes(total)) + '</span></div><div class="a-meter' + (free < 5 ? " a-meter--critical" : free < 15 ? " a-meter--warning" : "") + '" style="--value:' + pct +
      '%"><span></span></div><div class="a-muted small">' + esc(AutomatonUI.formatBytes(total - used)) + " free</div></div>";
  }

  function toolRow(name, key, installed, note) {
    var have = (installed || "").match(/[0-9]+(\.[0-9]+)+/), cur = have ? have[0] : installed || "";
    var newest = latest[key], text, warn = false;
    if (note) text = note;
    else if (!newest) text = "unknown";
    else if (cur && cur !== newest) { text = newest; warn = true; }
    else text = "up to date";
    return "<tr><td>" + esc(name) + '</td><td class="tn">' + esc(cur || "not installed") + '</td><td><span class="dot' + (warn ? " dot--warn" : "") + '"></span> ' + esc(text) + "</td></tr>";
  }

  function renderMachine() {
    if (state.missing) return renderQueue();
    var p = parsed(), locked = state.running || !state.admin ? " disabled" : "";
    var html = needsSetup() ? setupNote() : "";
    if (!p) {
      html += state.status && state.status.status !== "ok" ? '<div class="a-note a-note--warning">' + esc(state.status.message || "The status could not be read.") + "</div>" : '<p class="a-empty">No status yet.</p>';
      return html + '<div><button class="a-btn" type="button" id="refresh"' + locked + ">Refresh status</button></div>";
    }
    var repo = (p.url || state.config.repo || "").replace(/^https?:\/\/github\.com\//, "");
    html += '<div class="a-columns"><div class="a-card"><div class="a-card__head"><h2 class="a-card__title">GitHub runner</h2><span class="a-pill ' + (p.state === "busy" ? "a-pill--running" : p.state.indexOf("online") === 0 ? "a-pill--ok" : "a-pill--warning") + '">' + esc(p.state) + "</span></div>" +
      '<dl class="a-kv"><dt>Name</dt><dd>' + esc(p.runnerName || state.config.name) + "</dd><dt>Repository</dt><dd>" + esc(repo) + "</dd><dt>Current job</dt><dd>" + esc(p.job || "none") + "</dd>" +
      "<dt>Runners</dt><dd>" + esc(p.runners == null ? "1" : p.runners) + " (runs at once: " + esc(state.parallel) + ")</dd></dl>" +
      (state.config.docker ? '<div class="a-note a-note--warning">Jobs on this machine can become root. Only the agent workflows may use it.</div>' : "") +
      '<div class="a-card__foot">Read ' + esc(when(state.status.at)) + ", refreshed every 5 minutes while this page is open. " + '<button class="a-btn" type="button" id="refresh"' + locked + ">Refresh status</button></div></div>";
    var low = function (u, t) { return t && 100 - 100 * u / t < 15; };
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Disk</h2><span class="a-pill ' + (low(p.diskUsed, p.diskTotal) || low(p.dockerUsed, p.dockerTotal) ? "a-pill--warning" : "a-pill--ok") + '">' +
      (low(p.diskUsed, p.diskTotal) || low(p.dockerUsed, p.dockerTotal) ? "low" : "ok") + "</span></div>";
    if (p.diskTotal) html += diskMetric("Main disk", "/ · system and the agent's work folder", p.diskUsed, p.diskTotal);
    if (p.dockerTotal) html += diskMetric("Docker volume", (p.dockerPath || "") + " · images and containers", p.dockerUsed, p.dockerTotal);
    if (!p.diskTotal) html += '<p class="a-hint">The disk could not be read.</p>';
    html += '<div class="a-card__foot">Each disk is measured on its own. A warning shows below 15% free.</div></div>';
    var t = p.tools || {};
    var updates = ["claude", "gh"].filter(function (k) { var m = (t[k] || "").match(/[0-9]+(\.[0-9]+)+/); return latest[k] && m && m[0] !== latest[k]; }).length;
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Tools</h2>' + (updates ? '<span class="a-pill a-pill--warning">' + updates + (updates === 1 ? " update" : " updates") + "</span>" : "") + "</div>" +
      '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Tool</th><th>Installed</th><th>Latest</th></tr></thead><tbody>' +
      toolRow("Claude Code", "claude", t.claude) + toolRow("Docker", "docker", t.docker, "updated by apt") + toolRow("gh", "gh", t.gh) + toolRow("git", "git", t.git, "updated by apt") +
      toolRow("Actions runner", "runner", t.runner, "updates itself") + '</tbody></table></div><div class="a-card__foot"><button class="a-btn a-btn--primary" type="button" id="update"' + locked + ">Update tools</button></div></div></div>";
    return html;
  }

  function tokenField(id, label, hint, optional) {
    return '<div class="a-field"><label class="a-label" for="' + id + '">' + label + (optional ? " (optional)" : "") + '</label><input class="a-input" id="' + id + '" type="password" autocomplete="off" spellcheck="false"' + (state.running || !state.admin ? " disabled" : "") + '><span class="a-hint">' + esc(hint) + "</span></div>";
  }

  function renderSetup() {
    if (state.missing) return renderQueue();
    var p = parsed(), off = state.running || !state.admin ? " disabled" : "", at = setupAt();
    var html = tokenNote();
    if (!state.admin) html += '<div class="a-note">Only a system administrator can run these. You can read the last results.</div>';
    if (!p) return html + '<p class="a-empty">Reading the machine. ' + (state.status ? esc(state.status.message || "") : "") + '</p><button class="a-btn" type="button" id="refresh"' + off + ">Refresh status</button>";
    if (!p.registered) {
      return html + '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Set up this machine</h2><span class="a-pill a-pill--warning">not set up</span></div>' +
        '<div class="a-waiting"><p>This machine has an Automaton Runner but is not a GitHub agent machine yet. Set up installs Claude Code, gh, git, Docker and the build tools, registers the machine as a self-hosted runner with the <b>agent</b> label and starts it as a service. It takes about 5 minutes.</p>' +
        '<ol class="a-steps"><li class="ok">Host access is on for this server and an administrator approved <code>runner:host-exec</code> for this machine <span class="a-pill a-pill--ok">done</span></li>' +
        "<li>In GitHub open <b>" + esc(state.config.repo) + "</b>, Settings, Actions, Runners, <b>New self-hosted runner</b>, and copy the registration token. It is valid for one hour.</li><li>Paste it below and press <b>Set up</b>.</li></ol></div>" +
        '<form class="a-form pad" data-action="setup">' + tokenField("t-setup", "Registration token", "Used once and never saved.") + '<div><button class="a-btn a-btn--primary" type="submit"' + off + ">Set up</button></div></form></div>";
    }
    var last = lastRun();
    html += '<div class="a-columns"><div class="a-card"><div class="a-card__head"><h2 class="a-card__title">This machine</h2><span class="a-pill a-pill--ok">set up</span></div>' +
      "<p>" + (at ? "Set up on " + esc(when(at, true)) + ". " : "Set up. ") + "Tools installed, runner registered as <b>" + esc(p.runnerName || state.config.name) + "</b> and " + (p.service === "active" ? "running" : "not running") + " as a service.</p>" +
      '<details class="again"><summary>Set up again or register with a new token</summary><form class="a-form pad" data-action="setup"><p class="a-hint">Running it again is safe: it only adds what is missing. A token is needed only when the runner is not registered any more.</p>' +
      tokenField("t-again", "Registration token", "From Settings, Actions, Runners, New self-hosted runner. Used once and never saved.", true) + '<div><button class="a-btn" type="submit"' + off + ">Run set up again</button></div></form></details>" +
      (last ? '<div class="a-card__foot">Last run: ' + esc(last.label) + ", " + esc(last.result) + ", " + esc(when(last.run.at, true)) + (last.run.output ? ' · <a href="#setup" id="show-log">show log</a>' : "") + "</div>" : "") +
      (last && last.run.output ? '<pre class="log" id="log" hidden>' + esc(last.run.output) + "</pre>" : "") + "</div>";
    html += '<div class="a-card danger"><div class="a-card__head"><h2 class="a-card__title">Remove from GitHub</h2></div><form class="a-form pad" data-action="remove"><p class="a-hint">Stops the service and unregisters the runner. The tools and the work folder stay; Set up brings it back.</p>' +
      tokenField("t-remove", "Removal token", "From the runner's page on GitHub. Used once and never saved.") + '<div><button class="a-btn a-btn--danger" type="submit"' + off + ">Remove runner</button></div></form></div></div>";
    return html;
  }

  function lastRun() {
    var runs = ["setup", "update-tools", "remove"].map(function (a) { return { action: a, run: state.last && state.last[a] }; }).filter(function (x) { return x.run; }).sort(function (p, q) { return q.run.at - p.run.at; });
    if (!runs.length) return null;
    var run = runs[0].run;
    return { run: run, label: LABELS[runs[0].action].toLowerCase(), result: run.status !== "ok" ? run.message || run.status : run.timedOut ? "timed out" : run.exitCode === 0 ? "succeeded" : "failed (exit " + run.exitCode + ")" };
  }

  function render() {
    var p = parsed(), open = !!view.querySelector(".again[open]");
    subtitle.textContent = state.config.repo ? "Runner for " + state.config.repo : "Not configured";
    if (state.missing) pill("Needs setup", "warning");
    else if (state.running) pill(LABELS[state.running.action] + " running", "running");
    else if (p) pill(p.state, p.state.indexOf("online") === 0 ? "ok" : p.state === "busy" ? "running" : "warning");
    else pill("Unknown");
    var n = queue && queue.ok ? queue.data.failed.length : 0;
    tabN.textContent = n; tabN.hidden = !n;
    TABS.forEach(function (t) { var b = document.getElementById("tab-" + t); b.classList.toggle("is-on", t === tab); b.setAttribute("aria-selected", t === tab); });
    var html = message ? '<div class="a-note a-note--warning" role="alert">' + esc(message) + "</div>" : "";
    html += tab === "machine" ? renderMachine() : tab === "setup" ? renderSetup() : renderQueue();
    view.innerHTML = '<section class="panel" role="tabpanel" aria-labelledby="tab-' + esc(tab) + '">' + html + "</section>";
    var again = view.querySelector(".again");
    if (again && open) again.open = true;
    bind();
  }

  function bind() {
    var refresh = document.getElementById("refresh");
    if (refresh) refresh.addEventListener("click", function () { start("status"); });
    var update = document.getElementById("update");
    if (update) update.addEventListener("click", function () { start("update-tools"); });
    var log = document.getElementById("show-log");
    if (log) log.addEventListener("click", function (e) { e.preventDefault(); var l = document.getElementById("log"); l.hidden = !l.hidden; });
    Array.prototype.forEach.call(view.querySelectorAll("[data-again]"), function (b) {
      b.addEventListener("click", function () {
        var parts = b.getAttribute("data-again").split("#");
        b.disabled = true;
        post("api/retry", { repo: parts[0], number: parseInt(parts[1], 10) }).then(function (r) {
          message = r.body && r.body.message ? (r.ok ? "" : r.body.message) : r.ok ? "" : "That did not start.";
          loadQueue(true);
        });
      });
    });
    Array.prototype.forEach.call(view.querySelectorAll("form[data-action]"), function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input"), action = form.getAttribute("data-action");
        if (action === "remove" && !window.confirm("Unregister the runner on GitHub and remove its service?")) return;
        var token = input.value;
        input.value = "";
        start(action, token);
      });
    });
  }

  function start(action, token) {
    message = "";
    post("api/run/" + action, token ? { token: token } : {}).then(function (r) {
      if (r.body && r.body.message && !r.ok) message = r.body.message;
      else if (!r.ok) message = r.code === 403 ? "Only a system administrator can do this." : "That did not start.";
      if (r.ok && r.body && r.body.config) state = r.body;
      load();
    });
  }

  function loadQueue() {
    return request("api/queue").then(function (r) { if (r.ok) { queue = r.body; if (state) render(); } });
  }

  function load() {
    return request("api/state").then(function (r) {
      if (!r.ok) { subtitle.textContent = "Could not load"; return; }
      state = r.body;
      render();
      clearTimeout(poll);
      if (state.running) poll = setTimeout(load, 4000);
    });
  }

  function show() {
    var name = location.hash.slice(1);
    tab = TABS.indexOf(name) >= 0 ? name : "queue";
    if (state) render();
  }

  // Machine status is read again every 5 minutes while the page is open; only an administrator's page can (the platform needs their token).
  function autoRefresh() {
    if (state && state.admin && !state.running && !state.missing && tab === "machine") start("status");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
    b.addEventListener("click", function () { location.hash = b.getAttribute("data-tab"); });
  });
  window.addEventListener("hashchange", show);
  tab = TABS.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : "queue";
  load().then(function () {
    loadQueue();
    request("api/token").then(function (r) { if (r.ok) { tokenProblem = r.body.problem || null; render(); } });
    request("api/latest").then(function (r) { if (r.ok) { latest = r.body || {}; render(); } });
    if (state && state.admin && !state.status && !state.missing) start("status");
  });
  setInterval(loadQueue, 60000);
  refreshTimer = setInterval(autoRefresh, REFRESH_MS);
})();
