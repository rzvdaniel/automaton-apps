(function () {
  "use strict";
  var esc = AutomatonUI.escapeHtml;
  var view = document.getElementById("view");
  var subtitle = document.getElementById("subtitle");
  var tabN = document.getElementById("tab-n");
  var TABS = ["queue", "machine", "setup"];
  var state = null, queue = null, latest = {}, tokenProblem = null, repoVars = null, message = "", poll = null, tab = "queue", refreshTimer = null;
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

  function link(url, text, cls) {
    return /^https:\/\/github\.com\//.test(url || "") ? '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>" : esc(text);
  }

  function ref(card) { return (card.short === "automaton" ? "" : card.short.replace(/^automaton-/, "") ) + "#" + card.number; }
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

  var TOOLS = { agy: "Gemini", claude: "Claude" };
  function toolName(t) { return TOOLS[t] || t; }
  function chip(t, text) { return '<span class="chip chip--' + esc(t === "agy" ? "gemini" : t === "claude" ? "claude" : "other") + '">' + esc(text || toolName(t)) + "</span>"; }
  function mins(m) {
    m = Math.round(m || 0);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + ("0" + (m % 60)).slice(-2) + " min";
  }
  function pct(part, whole) { return Math.max(0, Math.min(100, Math.round(100 * part / whole))); }
  function tile(label, pillHtml, value, foot, extra, cls) {
    return '<div class="a-card tile"><div class="tile__head"><span>' + label + "</span>" + pillHtml + '</div><div class="tile__value' + (cls || "") + '">' + esc(value) + "</div>" + (extra || "") + '<div class="tile__foot a-muted">' + foot + "</div></div>";
  }

  function stepsFor(card) {
    var names = ["Picked", "Implement", "Pull request", "Reviews", "Merge gate"];
    var current = card.status === "Verify" ? 4 : card.pr ? 3 : 1;
    return '<ol class="steps" aria-label="Run steps">' + names.map(function (n, i) { return '<li class="' + (i < current ? "done" : i === current ? "on" : "") + '">' + esc(n) + "</li>"; }).join("") + "</ol>";
  }

  function pickupCard(q) {
    var next = new Date(Math.ceil(Date.now() / 600000) * 600000);
    var last = q.runs.length ? q.runs[0] : null;
    var blocked = !!tokenProblem || !state.hasToken;
    return '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Pick-up</h2><span class="a-pill ' + (blocked ? "a-pill--warning" : "a-pill--ok") + '">' + (blocked ? "cannot work" : "every 10 min") + "</span></div>" +
      '<div class="tile__value">next ' + esc(when(next.getTime() / 1000)) + "</div>" +
      '<div class="hrow"><span class="dot"></span>' + (last ? "last agent run started " + esc(when(last.startedAt)) : "no agent run yet") + "</div>" +
      '<div class="hrow"><span class="dot' + (blocked ? " dot--warn" : "") + '"></span>' + (blocked ? esc(tokenProblem || "no token saved") : "token reads board " + esc(state.board.split("/").pop()) + " · schedule set in Studio, Actions") + "</div></div>";
  }

  function runningCard(q) {
    var c = q.running[0], a = q.agent || {};
    var html = '<div class="a-card run"><div class="a-card__head"><h2 class="a-card__title">Running now</h2>' + (c && c.started ? '<span class="a-pill a-pill--running">' + esc(mins((q.now - c.started) / 60)) + "</span>" : "") + "</div>";
    if (!c) return html + '<p class="a-hint">No agent issue is running.</p></div>';
    return html + link(c.url, ref(c) + " " + c.title, "run__title") + '<div class="meta">' + chip(a.tool, a.tool + (a.model ? " · " + a.model : "")) +
      "<span>" + esc(c.short) + (c.pr ? " · PR " + link(c.pr.url, "#" + c.pr.number) + " opened" : " · no pull request yet") + "</span></div>" + stepsFor(c) + "</div>";
  }

  function needsCard(q) {
    var f = q.failed, c = f[0], locked = state.admin ? "" : " disabled";
    var html = '<div class="a-card' + (c ? " a-card--warn" : "") + '"><div class="a-card__head"><h2 class="a-card__title">Needs you</h2>' + (c ? '<span class="a-pill a-pill--warning">' + f.length + " failed</span>" : "") + "</div>";
    if (!c) return html + '<p class="a-hint">No failed card.</p></div>';
    return html + '<div class="small">' + issue(c) + (c.reason ? ". " + esc(c.reason) : "") + (f.length > 1 ? " (+" + (f.length - 1) + " more)" : "") + "</div>" +
      '<div class="btns">' + (c.readUrl ? link(c.readUrl, "Read run", "a-btn") : "") + '<button class="a-btn a-btn--primary" type="button" data-again="' + esc(c.repo) + "#" + esc(c.number) + '"' + locked + ">Run again</button></div></div>";
  }

  function nextCard(q) {
    var ready = q.ready, first = ready.filter(function (c) { return c.shaped; })[0];
    var html = '<div class="a-card list"><div class="a-card__head"><h2 class="a-card__title">Next up <span class="a-muted small">· ' + ready.length + ' ready</span></h2><span class="a-muted small">order of Ready for agents</span></div><div class="list__body">';
    if (!ready.length) html += '<p class="a-hint">Nothing is waiting in Ready for agents.</p>';
    ready.forEach(function (c, i) {
      html += '<div class="row"><span class="num">' + (c.shaped ? i + 1 : "!") + '</span><div><div class="row__t">' + issue(c) + '</div><div class="row__s">' + esc(c.short) + (c.shaped ? "" : ' · no "Done when"') + '</div></div><div class="row__r">' +
        (!c.shaped ? '<span class="a-pill a-pill--warning">goes to Inbox</span>' : c === first ? '<span class="a-pill">next</span>' : "queued") + "</div></div>";
    });
    return html + '</div><div class="list__foot"><a href="https://github.com/users/' + esc(state.board.split("/")[0]) + "/projects/" + esc(state.board.split("/")[1]) + '" target="_blank" rel="noopener">Open board ' + esc(state.board.split("/").pop()) + " on GitHub</a></div></div>";
  }

  function runsCard(q) {
    var recs = q.records || [], bars = recs.slice(0, 10).reverse().map(function (r) { return "<i" + (r.result !== "success" ? ' class="f"' : r.tool === "agy" ? ' class="g"' : "") + "></i>"; }).join("");
    var html = '<div class="a-card list"><div class="a-card__head"><h2 class="a-card__title">Recent runs</h2><div class="legend"><span><i style="background:#3b74e0"></i>Gemini</span><span><i style="background:var(--bar)"></i>Claude</span><span><i style="background:var(--orange)"></i>failed</span>' +
      '<div class="bars" aria-label="Last ' + Math.min(10, recs.length) + ' runs">' + bars + "</div></div></div>";
    var tools = Object.keys(q.tools || {});
    if (tools.length) {
      html += '<div class="split">' + tools.map(function (t) {
        var s = q.tools[t];
        return "<div><b>" + s.runs + (s.runs === 1 ? " run" : " runs") + " · " + esc(mins(s.median)) + "</b><span>" + esc(toolName(t)) + " · median · " + s.prs + (s.prs === 1 ? " PR" : " PRs") + (s.fallbacks ? ", " + s.fallbacks + " fell back" : "") + "</span></div>";
      }).join("") + "</div>";
    }
    html += '<div class="list__body">';
    if (!recs.length) html += '<p class="a-hint">No agent run has recorded itself yet.</p>';
    recs.forEach(function (r) {
      var ok = r.result === "success";
      html += '<div class="row"><span class="num">' + (ok ? "✓" : "!") + '</span><div><div class="row__t">' + issue(r) + '</div><div class="row__s">' +
        (r.pr ? "PR " + link(r.pr.url, "#" + r.pr.number) + (r.pr.state === "MERGED" ? " merged" : "") : "no pull request") + (r.fallback ? " · fell back to Claude" : "") + " · " + esc(when(r.at)) +
        '</div></div><div class="row__r">' + (ok ? chip(r.tool) : '<span class="res">failed</span>') + '<span class="tn">' + esc(mins(r.minutes)) + "</span></div></div>";
    });
    return html + '</div><div class="list__foot"><a href="https://github.com/' + esc(q.homeRepo || "rzvdaniel/automaton") + '/actions/workflows/agent-issue.yml" target="_blank" rel="noopener">All runs on GitHub Actions</a></div></div>';
  }

  function renderQueue() {
    if (state.missing) return '<section class="a-waiting"><h2 class="a-waiting__title">Not configured</h2><p>' + esc(state.missing) + "</p></section>";
    var html = tokenNote() + (needsSetup() ? setupNote() : "");
    if (!queue) return html + '<p class="a-empty">Loading the queue.</p>';
    if (!queue.ok) return html + '<div class="a-note a-note--warning" role="alert">' + esc(queue.message) + "</div>";
    var q = queue.data;
    return html + '<div class="strip">' + pickupCard(q) + runningCard(q) + needsCard(q) + '</div><div class="cols">' + nextCard(q) + runsCard(q) + "</div>";
  }

  function diskTile(name, where, used, total) {
    var p = pct(used, total), free = 100 - p, low = free < 15;
    return tile("<b>" + esc(name) + "</b> <code>" + esc(where) + "</code>", '<span class="a-muted">' + esc(AutomatonUI.formatBytes(used)) + " of " + esc(AutomatonUI.formatBytes(total)) + "</span>", p + "%",
      esc(AutomatonUI.formatBytes(total - used)) + " free" + (low ? " · low" : ""), '<div class="bar"><i style="width:' + p + '%' + (low ? ";background:var(--orange)" : "") + '"></i><b></b></div>');
  }

  function toolRow(name, key, installed, used, note) {
    var have = (installed || "").match(/[0-9]+(\.[0-9]+)+/), cur = have ? have[0] : installed || "";
    var newest = latest[key], text, warn = false;
    if (!cur) text = "not installed";
    else if (note) text = note;
    else if (!newest) text = "unknown";
    else if (cur !== newest) { text = newest + " available"; warn = true; }
    else text = "up to date";
    return "<tr><td>" + esc(name) + '</td><td class="tn">' + esc(cur || "–") + '</td><td class="a-muted">' + esc(used) + '</td><td><span class="dot' + (warn ? " dot--warn" : "") + '"></span> ' + esc(text) + "</td></tr>";
  }

  function agentCards(p) {
    var u = (queue && queue.ok && queue.data.usage) || {}, q = queue && queue.ok ? queue.data : null, t = p.tools || {};
    var keys = ["agy", "claude"].filter(function (k) { return t[k] || u[k]; });
    Object.keys(u).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    if (!keys.length) return "";
    var impl = (state.agents.AGENT_CLI || "claude"), review = (state.agents.AGENT_REVIEW_CLI || "claude");
    var html = '<div class="agents" style="--cols:' + (keys.length === 4 ? 2 : Math.min(keys.length, 3)) + '">';
    keys.forEach(function (k) {
      var x = u[k] || { today: { runs: 0, busyMinutes: 0, prs: 0 }, hours5: { runs: 0, busyMinutes: 0 }, week: { runs: 0, busyMinutes: 0 } };
      var working = !!(q && q.running.length && (q.agent || {}).tool === k);
      var roles = [impl === k ? "implements" : "", review === k ? "reviews" : "", k === "claude" ? "security pass, fallback" : ""].filter(Boolean).join(", ");
      var colour = k === "agy" ? "#3b74e0" : "";
      var bar = function (v) { return '<div class="bar"><i style="width:' + v + "%" + (colour ? ";background:" + colour : "") + '"></i></div>'; };
      var fb = (q && q.tools && q.tools[k] || {}).fallbacks;
      html += '<div class="a-card agent"><div class="a-card__head"><h2 class="a-card__title"><span class="sw" style="' + (colour ? "background:" + colour : "") + '"></span>' + esc(toolName(k)) + '</h2><span class="a-pill ' + (working ? "a-pill--running" : "a-pill--ok") + '">' + (working ? "working" : t[k] ? "ready" : "no runs lately") + "</span></div>" +
        '<div class="agent__nums"><div><b>' + x.today.runs + "</b><span>runs today</span></div><div><b>" + esc(mins(x.today.busyMinutes)) + "</b><span>agent time today</span></div><div><b>" + (x.today.runs ? x.today.prs + " of " + x.today.runs : "–") + "</b><span>opened a PR</span></div></div>" +
        '<div class="win"><div class="win__row"><span>Last 5 hours</span><span class="tn">' + esc(x.hours5.busyMinutes ? mins(x.hours5.busyMinutes) + " busy" : "idle") + "</span></div>" + bar(pct(x.hours5.busyMinutes, 300)) + "</div>" +
        '<div class="win"><div class="win__row"><span>This week <span class="a-muted">(since Mon)</span></span><span class="tn">' + x.week.runs + " runs · " + esc(mins(x.week.busyMinutes)) + "</span></div>" + bar(pct(x.week.busyMinutes, 168 * 60)) + "</div>" +
        '<div class="card-end"><span class="a-muted small">' + esc((roles || "not chosen for any step") + (fb ? " · fell back " + fb + (fb === 1 ? " time" : " times") : "")) + "</span></div></div>";
    });
    return html + "</div>";
  }

  function renderMachine() {
    if (state.missing) return renderQueue();
    var p = parsed(), locked = state.running || !state.admin ? " disabled" : "";
    var html = needsSetup() ? setupNote() : "";
    if (!p) {
      html += state.status && state.status.status !== "ok" ? '<div class="a-note a-note--warning">' + esc(state.status.message || "The status could not be read.") + "</div>" : '<p class="a-empty">No status yet.</p>';
      return html + '<div><button class="a-btn" type="button" id="refresh"' + locked + ">Refresh status</button></div>";
    }
    var u = (queue && queue.ok && queue.data.usage) || {}, today = 0, time = 0, split = [];
    Object.keys(u).forEach(function (k) { today += u[k].today.runs; time += u[k].today.busyMinutes; if (u[k].today.runs) split.push(u[k].today.runs + " " + toolName(k)); });
    var running = queue && queue.ok && queue.data.running[0];
    var runnerPill = '<span class="a-pill ' + (p.state === "busy" ? "a-pill--running" : p.state.indexOf("online") === 0 ? "a-pill--ok" : "a-pill--warning") + '">' + esc(p.state) + "</span>";
    var since = p.since ? " · service up since " + new Date(p.since * 1000).toLocaleDateString([], { day: "numeric", month: "short" }) : "";
    html += '<div class="tiles4">' + tile("GitHub runner", runnerPill, running ? ref(running) : p.job ? "working" : "idle", esc(p.runnerName || state.config.name) + esc(since), "", running ? "" : " tile__value--text");
    html += p.diskTotal ? diskTile("Main disk", "/", p.diskUsed, p.diskTotal) : tile("Main disk", "", "?", "The disk could not be read.");
    if (p.dockerTotal) html += diskTile("Docker data", p.dockerPath || "", p.dockerUsed, p.dockerTotal);
    html += tile("Agents", '<span class="a-pill a-pill--ok">' + Object.keys(p.tools || {}).filter(function (k) { return k === "agy" || k === "claude"; }).length + " ready</span>", today + (today === 1 ? " run" : " runs"),
      "today" + (split.length ? " · " + esc(split.join(", ")) : "") + " · " + esc(mins(time)) + " of agent time") + "</div>";
    html += agentCards(p);
    html += '<p class="a-hint">Measured from Agent Keeper\'s own runs (the "Agent run:" line each run comments on its issue); bars show busy time out of the window (5 hours, or the week\'s 168). One card per agent tool found on this machine. The tools do not report their plan limits, so none are shown.</p>';
    var t = p.tools || {};
    var updates = ["claude", "gh"].filter(function (k) { var m = (t[k] || "").match(/[0-9]+(\.[0-9]+)+/); return latest[k] && m && m[0] !== latest[k]; }).length;
    var impl = state.agents.AGENT_CLI || "claude", review = state.agents.AGENT_REVIEW_CLI || "claude";
    var used = function (k, base) { return [impl === k ? "implements" : "", review === k ? "reviews" : "", k === "claude" ? "security pass, fallback" : ""].filter(Boolean).join(", ") || base; };
    html += '<div class="two"><div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Agent tools</h2>' + (updates ? '<span class="a-pill a-pill--warning">' + updates + (updates === 1 ? " update" : " updates") + "</span>" : "") + "</div>" +
      '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Tool</th><th>Installed</th><th>Used for</th><th>Status</th></tr></thead><tbody>' +
      (t.agy ? toolRow("Antigravity (agy)", "agy", t.agy, used("agy", "not chosen"), "updates itself") : "") + toolRow("Claude Code", "claude", t.claude, used("claude", "not chosen")) +
      toolRow("gh", "gh", t.gh, "GitHub") + toolRow("Docker", "docker", t.docker, "builds, tests", "updated by apt") + toolRow("git", "git", t.git, "worktrees", "updated by apt") + toolRow("Actions runner", "runner", t.runner, "runs the jobs", "updates itself") +
      '</tbody></table></div><div class="card-end"><span class="a-muted small">Read ' + esc(when(state.status.at)) + ", refreshed every 5 minutes while this page is open." + '</span><span><button class="a-btn" type="button" id="refresh"' + locked + '>Refresh</button> <button class="a-btn" type="button" id="update"' + locked + '>Update tools</button></span></div></div>';
    var repo = (p.url || state.config.repo || "").replace(/^https?:\/\/github\.com\//, "");
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">GitHub runner</h2>' + runnerPill + '</div><dl class="a-kv"><dt>Name</dt><dd>' + esc(p.runnerName || state.config.name) + "</dd><dt>Repository</dt><dd>" + esc(repo) + "</dd><dt>Labels</dt><dd class=\"a-mono\">self-hosted, " + esc(state.config.labels) + "</dd>" +
      "<dt>Current job</dt><dd>" + esc(p.job || "none") + "</dd><dt>Service</dt><dd>" + esc(p.service === "active" ? "running" + (p.since ? " since " + new Date(p.since * 1000).toLocaleDateString([], { day: "numeric", month: "short" }) : "") : p.service) + "</dd>" +
      "<dt>Runners</dt><dd>" + esc(p.runners == null ? "1" : p.runners) + " (runs at once: " + esc(state.parallel) + ")</dd>" + (p.worktrees != null ? '<dt>Work folder</dt><dd class="a-mono">~/agent-work · ' + p.worktrees + (p.worktrees === 1 ? " worktree" : " worktrees") + "</dd>" : "") + "</dl>" +
      (state.config.docker ? '<div class="card-end"><div class="a-note a-note--warning">Jobs on this machine can become root. Only the agent workflows may use it.</div></div>' : "") + "</div></div>";
    return html;
  }

  function tokenField(id, label, hint, optional) {
    return '<div class="a-field"><label class="a-label" for="' + id + '">' + label + (optional ? " (optional)" : "") + '</label><input class="a-input" id="' + id + '" type="password" autocomplete="off" spellcheck="false"' + (state.running || !state.admin ? " disabled" : "") + '><span class="a-hint">' + esc(hint) + "</span></div>";
  }

  function choice(label, value, fallback) { return '<div class="mrow"><div><b>' + esc(label) + '</b></div><span class="small">' + esc(value || fallback) + "</span></div>"; }

  function agentsCard() {
    var a = state.agents || {};
    var rv = repoVars && repoVars.ok ? (repoVars.variables || {}) : null;
    var roles = [
      ["Implementation", "AGENT_CLI", "AGENT_MODEL"],
      ["Review and security pass", "AGENT_REVIEW_CLI", "AGENT_REVIEW_MODEL"],
      ["Fallback after a failed agy run", "AGENT_FALLBACK_CLI", "AGENT_FALLBACK_MODEL"],
      ["Release verification", "AGENT_VERIFY_CLI", "AGENT_VERIFY_MODEL"]
    ];
    var mismatch = false;
    var rows = roles.map(function (r) {
      var label = r[0], ck = r[1], mk = r[2];
      var cli = rv ? (rv[ck] || "") : (a[ck] || "");
      var model = rv ? (rv[mk] || "") : (a[mk] || "");
      if (rv && ((rv[ck] || "") !== (a[ck] || "") || (rv[mk] || "") !== (a[mk] || ""))) mismatch = true;
      var text = (cli ? toolName(cli) : "workflow default") + (model ? " \u00b7 " + model : "");
      return choice(label, text, "workflow default");
    }).join("");
    var warn = mismatch ? '<div class="a-note a-note--warning">Repository variables on GitHub differ from Agent Keeper\'s settings (someone changed them on GitHub).</div>' : "";
    return '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Who does what</h2></div><p class="small a-muted">Role \u2192 tool \u00b7 model, read back from the repository variables. Applies to the next run.</p>' +
      rows + warn +
      '<div class="card-end"><span class="a-hint">Change these in Studio, this app\'s Settings (AGENT_CLI, AGENT_MODEL, AGENT_REVIEW_CLI, AGENT_REVIEW_MODEL, AGENT_FALLBACK_CLI, AGENT_FALLBACK_MODEL, AGENT_VERIFY_CLI, AGENT_VERIFY_MODEL).</span></div></div>';
  }

  function boardCard() {
    var bad = !!tokenProblem || !state.hasToken;
    return '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">Board and pick-up</h2><span class="a-pill ' + (bad ? "a-pill--warning" : "a-pill--ok") + '">' + (bad ? "needs a token" : "ok") + "</span></div>" +
      '<div class="mrow"><div><b>Board</b><div class="a-muted small">' + esc(state.board) + '</div></div><span class="small"><span class="dot' + (queue && !queue.ok ? " dot--warn" : "") + '"></span> ' + (queue ? (queue.ok ? "readable" : "not readable") : "checking") + "</span></div>" +
      '<div class="mrow"><div><b>Repositories</b><div class="a-muted small">' + esc((state.repos || []).join(", ")) + '</div></div><span class="small">' + (state.repos || []).length + "</span></div>" +
      '<div class="mrow"><div><b>GitHub token</b><div class="a-muted small">' + esc(tokenProblem || (state.hasToken ? "AGENT_GH_TOKEN · project, repo, workflow" : "no AGENT_GH_TOKEN secret saved")) + '</div></div><span class="small"><span class="dot' + (bad ? " dot--warn" : "") + '"></span> ' + (bad ? "scopes missing" : "scopes ok") + "</span></div>" +
      '<div class="mrow"><div><b>Pick up</b><div class="a-muted small">every 10 min · ' + esc(state.parallel) + ' run' + (state.parallel === 1 ? "" : "s") + ' at a time</div></div><span class="small"><span class="dot"></span> scheduled in Studio</span></div>' +
      '<div class="card-end"><span class="a-hint">Board, repositories and parallel runs: Studio, this app\'s Settings. Pick up on or off: Studio, Actions.</span></div></div>';
  }

  function renderSetup() {
    if (state.missing) return renderQueue();
    var p = parsed(), off = state.running || !state.admin ? " disabled" : "", at = setupAt();
    var html = tokenNote();
    if (!state.admin) html += '<div class="a-note">Only a system administrator can run these. You can read the last results.</div>';
    html += '<div class="two">' + agentsCard() + boardCard();
    if (!p) return html + '</div><p class="a-empty">Reading the machine. ' + (state.status ? esc(state.status.message || "") : "") + '</p><button class="a-btn" type="button" id="refresh"' + off + ">Refresh status</button>";
    if (!p.registered) {
      return html + '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">This machine</h2><span class="a-pill a-pill--warning">not set up</span></div>' +
        '<p class="small">This machine has an Automaton Runner but is not a GitHub agent machine yet. Set up installs Claude Code, gh, git, Docker and the build tools, registers the machine as a self-hosted runner with the <b>agent</b> label and starts it as a service. It takes about 5 minutes.</p>' +
        '<ol class="a-steps"><li class="ok">Host access is on for this server and an administrator approved <code>runner:host-exec</code> for this machine <span class="a-pill a-pill--ok">done</span></li>' +
        "<li>In GitHub open <b>" + esc(state.config.repo) + "</b>, Settings, Actions, Runners, <b>New self-hosted runner</b>, and copy the registration token. It is valid for one hour.</li><li>Paste it below and press <b>Set up</b>.</li></ol>" +
        '<form class="a-form" data-action="setup">' + tokenField("t-setup", "Registration token", "Used once and never saved.") + '<div class="card-end"><span></span><button class="a-btn a-btn--primary" type="submit"' + off + ">Set up</button></div></form></div></div>";
    }
    var last = lastRun();
    html += '<div class="a-card"><div class="a-card__head"><h2 class="a-card__title">This machine</h2><span class="a-pill a-pill--ok">set up</span></div>' +
      '<p class="small">' + (at ? "Set up on " + esc(when(at, true)) + ": tools installed, " : "Set up: tools installed, ") + "runner registered as <b>" + esc(p.runnerName || state.config.name) + "</b> and " + (p.service === "active" ? "running" : "not running") + " as a service.</p>" +
      '<form class="a-form" data-action="setup">' + tokenField("t-again", "Registration token (only to register again)", "Used once and never saved. Running set up again only adds what is missing.", false) +
      '<div class="card-end"><span class="a-muted small">' + (last ? "Last run: " + esc(last.label) + ", " + esc(last.result) + " · " + esc(when(last.run.at, true)) + (last.run.output ? ' · <a href="#setup" id="show-log">show log</a>' : "") : "") + '</span><button class="a-btn" type="submit"' + off + ">Run set up again</button></div></form>" +
      (last && last.run.output ? '<pre class="log" id="log" hidden>' + esc(last.run.output) + "</pre>" : "") + "</div>";
    html += '<div class="a-card a-card--danger"><div class="a-card__head"><h2 class="a-card__title">Remove from GitHub</h2></div><p class="small">Stops the service and unregisters the runner. Tools and the work folder stay; Set up brings it back.</p><form class="a-form" data-action="remove">' +
      tokenField("t-remove", "Removal token", "From the runner's page on GitHub. Used once and never saved.") + '<div class="card-end"><span></span><button class="a-btn a-btn--danger" type="submit"' + off + ">Remove runner</button></div></form></div></div>";
    return html;
  }

  function lastRun() {
    var runs = ["setup", "update-tools", "remove"].map(function (a) { return { action: a, run: state.last && state.last[a] }; }).filter(function (x) { return x.run; }).sort(function (p, q) { return q.run.at - p.run.at; });
    if (!runs.length) return null;
    var run = runs[0].run;
    return { run: run, label: LABELS[runs[0].action].toLowerCase(), result: run.status !== "ok" ? run.message || run.status : run.timedOut ? "timed out" : run.exitCode === 0 ? "succeeded" : "failed (exit " + run.exitCode + ")" };
  }

  function render() {
    var p = parsed(), open = view.querySelector("#log") && !view.querySelector("#log").hidden;
    var checked = state.status && state.status.at ? " · checked " + when(state.status.at) : "";
    subtitle.textContent = state.config.repo ? (p && p.runnerName ? p.runnerName : state.config.name) + " · board " + state.board.split("/").pop() + checked : "Not configured";
    var n = queue && queue.ok ? queue.data.failed.length : 0;
    tabN.textContent = n; tabN.hidden = !n;
    document.documentElement.classList.toggle("q", tab === "queue" && !state.missing);
    TABS.forEach(function (t) { var b = document.getElementById("tab-" + t); b.classList.toggle("is-on", t === tab); b.setAttribute("aria-selected", t === tab); });
    var html = message ? '<div class="a-note a-note--warning err" role="alert">' + esc(message) + "</div>" : "";
    if (state.running) html += '<div class="a-note err" role="status">' + esc(LABELS[state.running.action]) + " is running.</div>";
    html += tab === "machine" ? renderMachine() : tab === "setup" ? renderSetup() : renderQueue();
    view.innerHTML = '<section class="view" role="tabpanel" aria-labelledby="tab-' + esc(tab) + '">' + html + "</section>";
    var log = document.getElementById("log");
    if (log && open) log.hidden = false;
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
    request("api/repo-variables").then(function (r) { if (r.ok) { repoVars = r.body || null; render(); } });
    if (state && state.admin && !state.status && !state.missing) start("status");
  });
  setInterval(loadQueue, 60000);
  refreshTimer = setInterval(autoRefresh, REFRESH_MS);
})();
