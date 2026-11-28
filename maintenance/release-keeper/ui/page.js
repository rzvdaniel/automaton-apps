/* Release Keeper UI */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => (window.AutomatonUI && AutomatonUI.escapeHtml ? AutomatonUI.escapeHtml(String(v ?? "")) : String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const PAGE = 20;

  const ui = {
    releases: { f: "all", q: "", n: PAGE },
    reports: { f: "all", q: "", date: "", n: PAGE },
    lessons: { f: "all", area: "", q: "", n: PAGE },
  };

  let current = "";
  let lastFocus = null;

  function fmtShort(iso) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  function dotState(label, kind) {
    const dotCls = kind === "attn" ? "rk-dot rk-dot--attn" : kind === "empty" ? "rk-dot rk-dot--empty" : "rk-dot";
    const txtCls = kind === "attn" ? "rk-state--attn" : "";
    return `<span class="${txtCls}"><span class="${dotCls}" aria-hidden="true"></span>${esc(label)}</span>`;
  }

  function statCards(cards) {
    return `<div class="rk-stats">${cards
      .map(
        ([label, val, sub, tone]) =>
          `<div class="a-stat"><div class="a-stat__label">${esc(label)}</div><div class="a-stat__value">${esc(val)}</div>${
            sub ? `<div class="a-stat__sub ${tone === "warning" ? "rk-state--attn" : ""}">${esc(sub)}</div>` : ""
          }</div>`
      )
      .join("")}</div>`;
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      renderLogin();
      throw new Error("Unauthorized");
    }
    return res.json();
  }

  function renderLogin(errMsg = "") {
    $("#view").innerHTML = `
      <section class="a-card" style="max-width:420px;margin:40px auto">
        <div class="a-card__head"><h2 class="a-card__title">Sign in</h2></div>
        <form id="login-form" class="a-form" style="padding:16px;display:flex;flex-direction:column;gap:12px">
          <label>Admin token
            <input class="a-input" id="login-token" type="password" autocomplete="current-password" required>
          </label>
          ${errMsg ? `<div class="rk-state--attn">${esc(errMsg)}</div>` : ""}
          <button class="a-btn a-btn--primary" type="submit">Sign in</button>
        </form>
      </section>`;
    $("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      const token = $("#login-token").value;
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (r.ok) {
        render();
      } else {
        const d = await r.json().catch(() => ({}));
        renderLogin(d.error || "Invalid token");
      }
    };
  }

  async function viewNow() {
    const d = await api("/api/now");
    const cards = statCards([
      ["Production", d.prod_version || "—", "api.automaton.monster"],
      ["Test server", d.test_version || "—", "runner-01"],
      ["Ready to deploy", String(d.ready_count || 0), d.ready_count > 0 ? "waiting" : "up to date", d.ready_count > 0 ? "warning" : "ok"],
      ["Open lessons", String(d.open_lessons || 0), d.open_lessons > 0 ? "needs triage" : "all triaged", d.open_lessons > 0 ? "warning" : "ok"],
    ]);

    const needsHtml = (d.needs_you || []).length
      ? `<ul class="a-list">${d.needs_you
          .map(
            (n) =>
              `<li class="a-list__row"><span>${esc(n.title)}</span><a class="a-btn" href="${esc(n.href || "#/now")}" target="_blank" rel="noopener">${esc(n.action || "Open")}</a></li>`
          )
          .join("")}</ul>`
      : `<div class="a-empty"><div class="a-empty__title">Nothing waiting</div></div>`;

    const pipe = d.pipeline || {};
    const pipeHtml = `<div class="rk-pipe">${["Inbox", "Ready", "In progress", "Verify", "Done"]
      .map((k) => `<div class="rk-pipe__col"><div class="rk-pipe__num">${esc(pipe[k] ?? 0)}</div><div class="rk-pipe__lbl">${esc(k)}</div></div>`)
      .join("")}</div>`;

    const rep = d.latest_report;
    const repHtml = rep
      ? `<div class="a-card__body"><p><strong>${esc(rep.headline)}</strong></p><p class="a-muted">${esc(fmtShort(rep.created_at))} · ${esc(rep.kind)}</p><a class="a-btn" href="#/reports/${encodeURIComponent(rep.id)}">Open report</a></div>`
      : `<div class="a-empty"><div class="a-empty__title">No reports yet</div></div>`;

    const rel = d.latest_release;
    const relHtml = rel
      ? `<div class="a-card__body"><p><strong>${esc(rel.version)}</strong></p><p class="a-muted">${esc(fmtShort(rel.released_at))} · ${esc(rel.state)}</p><a class="a-btn" href="#/releases/${encodeURIComponent(rel.version)}">Open release</a></div>`
      : `<div class="a-empty"><div class="a-empty__title">No releases yet</div></div>`;

    $("#view").innerHTML = `
      ${cards}
      <div class="rk-grid2">
        <section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Needs you</h2></div><div class="a-card__body">${needsHtml}</div></section>
        <section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Pipeline</h2></div><div class="a-card__body">${pipeHtml}</div></section>
      </div>
      <div class="rk-grid2">
        <section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Latest report</h2></div>${repHtml}</section>
        <section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Latest release</h2></div>${relHtml}</section>
      </div>`;
  }

  async function viewReleases() {
    const st = ui.releases;
    const d = await api(`/api/releases?f=${encodeURIComponent(st.f)}&q=${encodeURIComponent(st.q)}&limit=${st.n}&offset=0`);
    const c = d.counts || {};
    const cards = statCards([
      ["Total", String(c.all || 0), "releases"],
      ["Ready", String(c.ready || 0), "to deploy", c.ready > 0 ? "warning" : "ok"],
      ["Deployed", String(c.deployed || 0), "in production"],
      ["Failed", String(c.failed || 0), "verification", c.failed > 0 ? "warning" : "ok"],
    ]);
    const chips = [
      ["all", "All"],
      ["ready", "Ready"],
      ["deployed", "Deployed"],
      ["failed", "Failed"],
    ]
      .map(([v, l]) => `<button class="rk-chip" data-chip data-val="${v}" aria-pressed="${st.f === v}">${esc(l)}</button>`)
      .join("");

    const rows = (d.items || [])
      .map((r) => {
        const kind = r.verified === "failed" || r.state === "ready" ? "attn" : "ok";
        return `<tr class="rk-row" data-href="#/releases/${encodeURIComponent(r.version)}">
          <td>${esc(fmtShort(r.released_at))}</td>
          <td>${esc(r.version)}</td>
          <td>${esc(fmtShort(r.prod_at))}</td>
          <td>${esc(r.verified)}</td>
          <td>${dotState(r.state, kind)}</td>
        </tr>`;
      })
      .join("");

    $("#view").innerHTML = `${cards}
      <section class="a-card">
        <div class="rk-barhead" style="padding:12px 16px 0">
          <h2 class="a-card__title">Releases</h2>
          <div class="rk-controls">
            <div class="rk-chips">${chips}</div>
            <input class="a-input" id="q" type="search" placeholder="Search releases" aria-label="Search releases" value="${esc(st.q)}">
          </div>
        </div>
        <div class="rk-table-wrap">
          <table class="a-table">
            <thead><tr><th>Released</th><th>Version</th><th>Production</th><th>Verified</th><th>State</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5"><div class="a-empty"><div class="a-empty__title">No releases match</div></div></td></tr>`}</tbody>
          </table>
        </div>
        ${d.total > d.items.length ? `<div class="a-card__foot"><button class="a-btn" data-more type="button">Show 20 more</button></div>` : ""}
      </section>`;
    bindListControls("releases");
  }

  async function viewReports() {
    const st = ui.reports;
    const d = await api(`/api/reports?f=${encodeURIComponent(st.f)}&q=${encodeURIComponent(st.q)}&date=${encodeURIComponent(st.date)}&limit=${st.n}&offset=0`);
    const c = d.counts || {};
    const cards = statCards([
      ["Total", String(c.all || 0), "reports"],
      ["Morning", String(c.morning || 0), "07:00 UTC"],
      ["End of day", String(c.eod || 0), "18:00 UTC"],
      ["Needs you", String(c.attn || 0), "with items", c.attn > 0 ? "warning" : "ok"],
    ]);
    const chips = [
      ["all", "All"],
      ["morning", "Morning"],
      ["eod", "End of day"],
      ["attn", "Needs you"],
    ]
      .map(([v, l]) => `<button class="rk-chip" data-chip data-val="${v}" aria-pressed="${st.f === v}">${esc(l)}</button>`)
      .join("");

    let lastMonth = "";
    const rows = (d.items || [])
      .map((r) => {
        const month = (r.created_at || "").slice(0, 7);
        const monthRow = month && month !== lastMonth ? `<tr><td colspan="5" class="rk-month">${esc(month)}</td></tr>` : "";
        lastMonth = month;
        const kind = r.needs_you_count > 0 ? "attn" : "ok";
        return `${monthRow}<tr class="rk-row" data-href="#/reports/${encodeURIComponent(r.id)}">
          <td>${esc(fmtShort(r.created_at))}</td>
          <td>${esc(r.headline)}</td>
          <td>${esc(r.kind)}</td>
          <td>${esc(String(r.needs_you_count))}</td>
          <td>${dotState(r.state, kind)}</td>
        </tr>`;
      })
      .join("");

    $("#view").innerHTML = `${cards}
      <section class="a-card">
        <div class="rk-barhead" style="padding:12px 16px 0">
          <h2 class="a-card__title">Reports</h2>
          <div class="rk-controls">
            <div class="rk-chips">${chips}</div>
            <input class="a-input" id="d" type="date" aria-label="Jump to date" value="${esc(st.date)}">
            <input class="a-input" id="q" type="search" placeholder="Search reports" aria-label="Search reports" value="${esc(st.q)}">
          </div>
        </div>
        <div class="rk-table-wrap">
          <table class="a-table">
            <thead><tr><th>When</th><th>Headline</th><th>Kind</th><th>Needs you</th><th>State</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5"><div class="a-empty"><div class="a-empty__title">No reports match</div></div></td></tr>`}</tbody>
          </table>
        </div>
        ${d.total > d.items.length ? `<div class="a-card__foot"><button class="a-btn" data-more type="button">Show 20 more</button></div>` : ""}
      </section>`;
    bindListControls("reports");
  }

  async function viewLessons() {
    const st = ui.lessons;
    const d = await api(`/api/lessons?f=${encodeURIComponent(st.f)}&area=${encodeURIComponent(st.area)}&q=${encodeURIComponent(st.q)}&limit=${st.n}&offset=0`);
    const c = d.counts || {};
    const cards = statCards([
      ["Total", String(c.all || 0), "lessons"],
      ["Open", String(c.open || 0), "needs triage", c.open > 0 ? "warning" : "ok"],
      ["Repeat", String(c.repeat || 0), "times > 1", c.repeat > 0 ? "warning" : "ok"],
      ["Fixed", String(c.fixed || 0), "closed"],
    ]);
    const chips = [
      ["all", "All"],
      ["open", "Open"],
      ["repeat", "Repeat"],
      ["fixed", "Fixed"],
    ]
      .map(([v, l]) => `<button class="rk-chip" data-chip data-val="${v}" aria-pressed="${st.f === v}">${esc(l)}</button>`)
      .join("");
    const areas = [`<option value="">All areas</option>`]
      .concat((d.areas || []).map((a) => `<option value="${esc(a)}" ${st.area === a ? "selected" : ""}>${esc(a)}</option>`))
      .join("");

    const rows = (d.items || [])
      .map((l) => {
        const kind = l.state === "open" ? "attn" : "ok";
        return `<tr class="rk-row" data-href="#/lessons/${encodeURIComponent(l.id)}">
          <td>${esc(fmtShort(l.filed_at))}</td>
          <td>${esc(l.title)}</td>
          <td>${esc(l.area)}</td>
          <td>${esc(String(l.times))}</td>
          <td>${dotState(l.state, kind)}</td>
        </tr>`;
      })
      .join("");

    $("#view").innerHTML = `${cards}
      <section class="a-card">
        <div class="rk-barhead" style="padding:12px 16px 0">
          <h2 class="a-card__title">Lessons</h2>
          <div class="rk-controls">
            <div class="rk-chips">${chips}</div>
            <select class="a-input" id="a" aria-label="Filter by area">${areas}</select>
            <input class="a-input" id="q" type="search" placeholder="Search lessons" aria-label="Search lessons" value="${esc(st.q)}">
          </div>
        </div>
        <div class="rk-table-wrap">
          <table class="a-table">
            <thead><tr><th>Filed</th><th>Lesson</th><th>Area</th><th>Times</th><th>State</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5"><div class="a-empty"><div class="a-empty__title">No lessons match</div></div></td></tr>`}</tbody>
          </table>
        </div>
        ${d.total > d.items.length ? `<div class="a-card__foot"><button class="a-btn" data-more type="button">Show 20 more</button></div>` : ""}
      </section>`;
    bindListControls("lessons");
  }

  function bindListControls(sec) {
    const st = ui[sec];
    const q = $("#q");
    if (q) {
      q.oninput = () => {
        const pos = q.selectionStart;
        st.q = q.value;
        st.n = PAGE;
        drawList(sec).then(() => {
          const n = $("#q");
          if (n) {
            n.focus();
            if (pos != null) n.setSelectionRange(pos, pos);
          }
        });
      };
    }
    const d = $("#d");
    if (d) d.onchange = () => { st.date = d.value; st.n = PAGE; drawList(sec); };
    const a = $("#a");
    if (a) a.onchange = () => { st.area = a.value; st.n = PAGE; drawList(sec); };
    document.querySelectorAll("[data-chip]").forEach((b) => {
      b.onclick = () => { st.f = b.dataset.val; st.n = PAGE; drawList(sec); };
    });
    const m = document.querySelector("[data-more]");
    if (m) m.onclick = () => { st.n += PAGE; drawList(sec); };
    document.querySelectorAll(".rk-row").forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.tagName !== "A") location.hash = tr.dataset.href;
      };
    });
  }

  async function detailRelease(ver) {
    const r = await api(`/api/releases/${encodeURIComponent(ver)}`);
    return {
      title: `Release ${r.version}`,
      body: `${statCards([
        ["State", r.state, r.verified],
        ["Released", fmtShort(r.released_at), ""],
        ["Production", fmtShort(r.prod_at), ""],
        ["Test", fmtShort(r.test_at), ""],
      ])}
      <section class="a-card"><div class="a-card__head"><h3 class="a-card__title">Notes</h3>${
        r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">GitHub</a>` : ""
      }</div><div class="a-card__body rk-prose">${esc(r.notes || "No release notes.")}</div></section>`,
    };
  }

  async function detailReport(id) {
    const r = await api(`/api/reports/${encodeURIComponent(id)}`);
    return {
      title: r.id,
      body: `${statCards([
        ["Kind", r.kind, ""],
        ["State", r.state, r.emailed_at ? `emailed ${fmtShort(r.emailed_at)}` : "saved"],
        ["Needs you", String(r.needs_you_count), ""],
        ["Created", fmtShort(r.created_at), ""],
      ])}
      <section class="a-card"><div class="a-card__head"><h3 class="a-card__title">${esc(r.headline)}</h3></div>
      <div class="a-card__body rk-prose">${esc(r.body_md || "")}</div></section>`,
    };
  }

  async function detailLesson(id) {
    const l = await api(`/api/lessons/${encodeURIComponent(id)}`);
    const attn = l.state === "open";
    const body = `${statCards([
      ["State", l.state, l.fix, attn ? "warning" : "ok"],
      ["Filed", fmtShort(l.filed_at), l.area],
      ["Times", String(l.times), l.times > 1 ? "repeat" : "once", l.times > 1 ? "warning" : "ok"],
      ["Repo", l.repo || "—", ""],
    ])}
    <section class="a-card">
      <div class="a-card__head"><h3 class="a-card__title">Lasting change</h3>${
        l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Issue on GitHub</a>` : ""
      }</div>
      <div class="a-card__body rk-prose">${esc(l.change_text || "No description.")}${l.rec_text ? `\n\nRecommendation:\n${esc(l.rec_text)}` : ""}</div>
      ${
        attn
          ? `<div class="a-card__foot" style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="a-btn a-btn--primary" data-triage="fix_now" type="button">Fix now</button>
              <button class="a-btn" data-triage="later" type="button">Later</button>
              <button class="a-btn" data-triage="drop" type="button">Drop</button>
            </div>`
          : ""
      }
    </section>`;
    return {
      title: `${l.id} ${l.title}`,
      body,
      onMount: () => {
        document.querySelectorAll("[data-triage]").forEach((btn) => {
          btn.onclick = async () => {
            await api(`/api/lessons/${encodeURIComponent(l.id)}/triage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: btn.dataset.triage }),
            });
            await drawList("lessons");
            const updated = await detailLesson(l.id);
            openDrawer(updated);
          };
        });
      },
    };
  }

  async function drawList(sec) {
    const map = { now: viewNow, releases: viewReleases, reports: viewReports, lessons: viewLessons };
    const fn = map[sec];
    if (fn) {
      await fn();
    } else {
      $("#view").innerHTML = `<div class="a-empty"><div class="a-empty__title">Not found</div><a href="#/now">Back to Now</a></div>`;
    }
  }

  function openDrawer(d) {
    if (!$("#drawer").classList.contains("on")) lastFocus = document.activeElement;
    $("#dtitle").textContent = d.title;
    $("#dbody").innerHTML = d.body;
    $("#dbody").scrollTop = 0;
    $("#drawer").classList.add("on");
    $("#scrim").classList.add("on");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#dclose").focus();
    if (d.onMount) d.onMount();
  }

  function closeDrawer(nav) {
    if (!$("#drawer").classList.contains("on")) return;
    $("#drawer").classList.remove("on");
    $("#scrim").classList.remove("on");
    $("#drawer").setAttribute("aria-hidden", "true");
    if (nav) location.hash = "#/" + (current || "now");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function render() {
    const [, sec = "now", id] = (location.hash || "#/now").split("/").map(decodeURIComponent);
    document.querySelectorAll(".rk-tab").forEach((a) => {
      a.setAttribute("aria-current", a.getAttribute("href") === "#/" + sec ? "page" : "false");
    });
    if (sec !== current || !id) {
      await drawList(sec);
      current = sec;
    }
    const det = id && { releases: detailRelease, reports: detailReport, lessons: detailLesson }[sec];
    if (det) {
      const d = await det(id);
      if (d) openDrawer(d);
    } else {
      closeDrawer(false);
    }
  }

  $("#scrim").onclick = () => closeDrawer(true);
  $("#dclose").onclick = () => closeDrawer(true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer(true);
  });
  $("#btn-sync").onclick = async () => {
    $("#btn-sync").disabled = true;
    try {
      await api("/api/sync", { method: "POST" });
      await render();
    } finally {
      $("#btn-sync").disabled = false;
    }
  };
  window.addEventListener("hashchange", render);
  render();
})();
