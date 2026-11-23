(function () {
  "use strict";
  var esc = AutomatonUI.escapeHtml;
  var view = document.getElementById("view");
  var subtitle = document.getElementById("subtitle");
  var overall = document.getElementById("overall");
  var state = null;
  var message = "";
  var poll = null;
  var LABELS = { setup: "Set up", status: "Refresh status", remove: "Remove", "update-tools": "Update tools" };

  AutomatonUI.bindThemeToggle();

  function when(seconds) {
    if (!seconds) return "";
    return new Date(seconds * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function request(path, options) {
    options = options || {};
    options.cache = "no-store";
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) { return { ok: response.ok, code: response.status, body: body }; });
    });
  }

  function post(action, token) {
    return request("api/run/" + action, { method: "POST", headers: { "X-Agent-Keeper": "1", "Content-Type": "application/json" }, body: JSON.stringify(token ? { token: token } : {}) });
  }

  function pill(text, tone) {
    overall.textContent = text;
    overall.className = "a-pill a-pill--large" + (tone ? " a-pill--" + tone : "");
    overall.hidden = false;
  }

  function tools(parsed) {
    var names = parsed && parsed.tools ? Object.keys(parsed.tools) : [];
    if (!names.length) return '<p class="a-empty">No tool versions yet. Refresh the status.</p>';
    return '<dl class="a-kv">' + names.map(function (n) { return "<dt>" + esc(n) + "</dt><dd>" + esc(parsed.tools[n]) + "</dd>"; }).join("") + "</dl>";
  }

  function lastLog() {
    var runs = ["setup", "update-tools", "remove"].map(function (action) { return { action: action, run: state.last && state.last[action] }; })
      .filter(function (x) { return x.run; }).sort(function (p, q) { return q.run.at - p.run.at; });
    if (!runs.length) return "";
    var x = runs[0], run = x.run;
    var result = run.status !== "ok" ? run.message || run.status : run.timedOut ? "timed out" : run.exitCode === 0 ? "succeeded" : "failed (exit " + run.exitCode + ")";
    return '<details class="a-card last-run"><summary class="a-card__head"><h2 class="a-card__title">Last run: ' + esc(LABELS[x.action].toLowerCase()) + '</h2><span class="a-pill ' +
      (result === "succeeded" ? "a-pill--ok" : "a-pill--warning") + '">' + esc(result) + '</span><span class="a-hint">' + esc(when(run.at)) + "</span></summary>" +
      (run.output ? '<pre class="log">' + esc(run.output) + "</pre>" : '<p class="a-hint">No output.</p>') + "</details>";
  }

  function tokenForm(action, title, hint, optional) {
    var disabled = state.running || !state.admin ? " disabled" : "";
    return '<form class="a-card a-form" data-action="' + action + '"><div class="a-card__head"><h2 class="a-card__title">' + esc(title) + '</h2></div>' +
      '<div class="a-field"><label class="a-label" for="t-' + action + '">GitHub token' + (optional ? " (only the first time)" : "") + '</label>' +
      '<input class="a-input" id="t-' + action + '" type="password" autocomplete="off" spellcheck="false"' + (optional ? "" : " required") + disabled + '>' +
      '<p class="a-hint">' + esc(hint) + " It is used once and never saved.</p></div>" +
      '<div class="card-actions"><button class="a-btn ' + (action === "remove" ? "a-btn--danger" : "a-btn--primary") + '" type="submit"' + disabled + ">" + esc(LABELS[action]) + "</button></div></form>";
  }

  function render() {
    var wasOpen = !!view.querySelector(".last-run[open]");
    var parsed = state.status && state.status.parsed;
    subtitle.textContent = state.config.repo ? "Runner for " + state.config.repo : "Not configured";
    if (state.missing) {
      pill("Needs setup", "warning");
      view.innerHTML = '<section class="a-waiting"><h2>Not configured</h2><p>' + esc(state.missing) + "</p>" +
        '<ol class="a-steps"><li>Install this app and fill in the settings.</li><li>An administrator turns on host access (Studio, the app\'s Admin tab) and approves <code>runner:host-exec</code> for the machine.</li></ol></section>';
      return;
    }
    if (state.running) pill(LABELS[state.running.action] + " running", "running");
    else if (parsed) pill(parsed.state, parsed.state.indexOf("online") === 0 || parsed.state === "busy" ? "ok" : "warning");
    else pill("Unknown");
    var html = "";
    if (message) html += '<div class="a-note a-note--warning" role="alert">' + esc(message) + "</div>";
    if (!state.admin) html += '<div class="a-note">Only a system administrator can run these. You can read the last results.</div>';
    html += '<div class="a-grid a-grid--two">';
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">GitHub runner</h2>' +
      (state.config.docker ? '<span class="a-pill a-pill--warning">Jobs can become root</span>' : "") + "</div>";
    if (parsed) {
      html += '<dl class="a-kv"><dt>State</dt><dd>' + esc(parsed.state) + "</dd><dt>Name</dt><dd>" + esc(parsed.runnerName || state.config.name) + "</dd>" +
        "<dt>Repository</dt><dd>" + esc(parsed.url || state.config.repo) + "</dd>" + (parsed.job ? "<dt>Job</dt><dd>" + esc(parsed.job) + "</dd>" : "") + "</dl>";
      if (parsed.diskTotal) {
        var pct = Math.round(100 * parsed.diskUsed / parsed.diskTotal);
        html += '<div class="a-meter' + (pct > 90 ? " a-meter--critical" : pct > 80 ? " a-meter--warning" : "") + '" style="--value:' + pct + '%"></div><p class="a-hint">Disk ' +
          esc(AutomatonUI.formatBytes(parsed.diskUsed)) + " of " + esc(AutomatonUI.formatBytes(parsed.diskTotal)) + " used</p>";
      }
      html += '<p class="a-hint">Read ' + esc(when(state.status.at)) + ". State comes from the machine's runner service.</p>";
    } else if (state.status && state.status.status !== "ok") {
      html += '<p class="a-note a-note--warning">' + esc(state.status.message || "The status could not be read.") + "</p>";
    } else {
      html += '<p class="a-empty">No status yet.</p>';
    }
    html += '<div class="card-actions"><button class="a-btn" type="button" id="refresh"' + (state.running || !state.admin ? " disabled" : "") + ">Refresh status</button></div></div>";
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Tools</h2></div>' + tools(parsed) + "</div>";
    html += "</div>";
    html += '<div class="a-grid a-grid--three form-gap">';
    html += tokenForm("setup", "Set up", "Copy a registration token from the repository's Settings, Actions, Runners, New self-hosted runner.", true);
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Update tools</h2></div><p class="a-hint">Upgrades gh, git, Docker and Claude Code. Needs no token.</p>' +
      '<div class="card-actions"><button class="a-btn" type="button" id="update"' + (state.running || !state.admin ? " disabled" : "") + ">Update tools</button></div></div>";
    html += tokenForm("remove", "Remove", "Copy a removal token from the runner's page on GitHub.");
    html += "</div>";
    html += '<div class="form-gap">' + lastLog() + "</div>";
    view.innerHTML = html;
    var lr = view.querySelector(".last-run");
    if (lr && wasOpen) lr.open = true;
    var refresh = document.getElementById("refresh");
    if (refresh) refresh.addEventListener("click", function () { start("status"); });
    var update = document.getElementById("update");
    if (update) update.addEventListener("click", function () { start("update-tools"); });
    Array.prototype.forEach.call(view.querySelectorAll("form[data-action]"), function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input");
        var action = form.getAttribute("data-action");
        if (action === "remove" && !window.confirm("Unregister the runner on GitHub and remove its service?")) return;
        var token = input.value;
        input.value = "";
        start(action, token);
      });
    });
  }

  function start(action, token) {
    message = "";
    post(action, token).then(function (r) {
      if (r.body && r.body.message && !r.ok) message = r.body.message;
      else if (!r.ok) message = r.code === 403 ? "Only a system administrator can do this." : "That did not start.";
      if (r.ok && r.body && r.body.config) state = r.body;
      load();
    });
  }

  function load() {
    request("api/state").then(function (r) {
      if (!r.ok) { subtitle.textContent = "Could not load"; return; }
      state = r.body;
      render();
      clearTimeout(poll);
      if (state.running) poll = setTimeout(load, 4000);
    });
  }

  load();
})();
