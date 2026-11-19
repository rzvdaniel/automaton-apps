(function () {
  "use strict";
  var esc = AutomatonUI.escapeHtml;
  var view = document.getElementById("view");
  var subtitle = document.getElementById("subtitle");
  var overall = document.getElementById("overall");
  var KEY = "gate-keeper-token";

  AutomatonUI.bindThemeToggle();

  function headers() {
    var token = sessionStorage.getItem(KEY);
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function pill(text, tone) {
    overall.textContent = text;
    overall.className = "a-pill a-pill--large" + (tone ? " a-pill--" + tone : "");
    overall.hidden = false;
  }

  function waiting(title, text, steps) {
    pill("Waiting", "warning");
    view.innerHTML = '<section class="a-waiting"><h2>' + esc(title) + "</h2><p>" + esc(text) + "</p>" +
      (steps ? '<ol class="a-steps">' + steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") + "</section>";
  }

  function askToken(message) {
    overall.hidden = true;
    subtitle.textContent = "Sign in";
    view.innerHTML = '<form class="a-card a-form token-form" id="token-form"><div class="a-field"><label class="a-label" for="token">Admin token</label>' +
      '<input class="a-input" id="token" type="password" autocomplete="current-password" required>' +
      '<p class="a-hint">' + esc(message || "The ADMIN_TOKEN this app was started with.") + "</p></div>" +
      '<button class="a-btn a-btn--primary" type="submit">Open</button></form>';
    document.getElementById("token-form").addEventListener("submit", function (event) {
      event.preventDefault();
      sessionStorage.setItem(KEY, document.getElementById("token").value);
      load();
    });
  }

  function stat(label, value, hint, tone) {
    return '<div class="a-stat' + (tone ? " a-stat--" + tone : "") + '"><div class="a-stat__label">' + esc(label) +
      '</div><div class="a-stat__value">' + esc(String(value)) + '</div><div class="a-stat__hint">' + esc(hint) + "</div></div>";
  }

  function jailCard(jail) {
    var head = '<div class="a-card__head"><h2 class="a-card__title">' + esc(jail.name) + "</h2>" +
      '<span class="a-pill ' + (jail.enabled ? (jail.banned ? "a-pill--warning" : "a-pill--ok") : "") + '">' +
      (jail.enabled ? esc(jail.banned + " banned now") : "Turned off") + "</span></div>";
    var body;
    if (!jail.bans.length) {
      body = '<p class="a-empty">Nobody is banned in this jail right now.</p>';
    } else {
      body = '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Address</th><th>Banned</th><th>Until</th></tr></thead><tbody>' +
        jail.bans.map(function (b) {
          return '<tr><td class="ip">' + esc(b.ip) + "</td><td>" + esc(when(b.bannedAt)) + "</td><td>" +
            (b.expiresAt ? esc(when(b.expiresAt)) : "Permanent") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      if (jail.banned > jail.bans.length) body += '<p class="a-hint">Showing the newest ' + jail.bans.length + " of " + jail.banned + ".</p>";
    }
    return '<section class="a-card">' + head + body + '<p class="a-hint">' + esc(jail.lastHour + " in the last hour, " + jail.last24Hours + " in 24 hours") + "</p></section>";
  }

  function render(s) {
    if (s.status === "no_key" || s.status === "not_approved") {
      subtitle.textContent = "Needs approval";
      return waiting("Waiting for approval", "Gate Keeper reads bans through the security:read permission, and an administrator has not approved it yet.",
        ["Open Studio, then Admin, Apps, Permissions.", "Approve security:read for Gate Keeper.", "Reload this page."]);
    }
    if (s.status !== "ok") {
      subtitle.textContent = "No figures";
      pill("No figures", "warning");
      view.innerHTML = '<p class="a-note a-note--warning">' + esc(s.message || "The bans could not be read.") + "</p>";
      return;
    }
    if (!s.reported) {
      subtitle.textContent = "No figures yet";
      pill("No figures yet");
      view.innerHTML = '<p class="a-empty">The server has not reported fail2ban yet. This can take a few minutes after a Runner starts.</p>';
      return;
    }
    var t = s.totals;
    if (s.running === false) pill("Fail2ban is not running", "warning"); else pill(t.banned ? t.banned + " banned" : "No active bans", "ok");
    subtitle.textContent = "Updated " + when(s.fetchedAt);
    var html = '<div class="stack">';
    if (s.running === false) html += '<div class="a-banner a-banner--warning"><span class="a-banner__title">Fail2ban is not running on this server, so nothing is being banned.</span></div>';
    html += '<section class="a-card"><div class="a-stats">' + stat("Banned now", t.banned, "addresses", t.banned ? "warning" : "ok") +
      stat("Last hour", t.lastHour, "new bans") + stat("Last 24 hours", t.last24Hours, "new bans") + "</div></section>";
    html += s.jails.length ? s.jails.map(jailCard).join("") : '<p class="a-empty">Fail2ban has no jails.</p>';
    view.innerHTML = html + "</div>";
  }

  function load() {
    fetch("api/state", { headers: headers(), cache: "no-store" }).then(function (r) {
      if (r.status === 401) {
        return r.json().then(function (body) {
          sessionStorage.removeItem(KEY);
          askToken(headers().Authorization ? "That token was not accepted." : body.error);
        });
      }
      return r.json().then(render);
    }).catch(function () {
      subtitle.textContent = "Offline";
      view.innerHTML = '<p class="a-note a-note--warning">Gate Keeper could not be reached.</p>';
    });
  }

  load();
  setInterval(function () { if (!document.hidden) load(); }, 60000);
})();
