/* Automaton app UI kit 1.0.0 - https://github.com/rzvdaniel/automaton-apps/tree/main/design/automaton-app-ui
   Copied into each app as ui/app.js. Do not edit a copy: change the kit and copy it again. */
(function () {
  "use strict";

  var STORAGE_KEY = "automaton-theme";

  function stored() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function store(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode: the choice lasts for this page */ }
  }

  /** Applies "light", "dark" or null (follow the system) to the page. */
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /** Makes every [data-theme-toggle] button switch between light and dark and remember the choice. */
  function bindThemeToggle() {
    applyTheme(stored());
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        store(next);
      });
    }
  }

  function plural(n, unit) { return n + " " + unit + (n === 1 ? "" : "s"); }

  /** "5 minutes ago", "in 3 days". Accepts a Date, an ISO string or epoch seconds. */
  function relativeTime(value, now) {
    var date = value instanceof Date ? value : typeof value === "number" ? new Date(value * 1000) : new Date(value);
    if (isNaN(date.getTime())) return "";
    var seconds = Math.round(((now ? now.getTime() : Date.now()) - date.getTime()) / 1000);
    var future = seconds < 0;
    var s = Math.abs(seconds);
    var text;
    if (s < 45) return future ? "in a moment" : "just now";
    if (s < 3600) text = plural(Math.round(s / 60), "minute");
    else if (s < 86400) text = plural(Math.round(s / 3600), "hour");
    else text = plural(Math.round(s / 86400), "day");
    return future ? "in " + text : text + " ago";
  }

  /** Keeps every <time datetime="..." data-rel> element showing its relative time. */
  function updateRelativeTimes(root) {
    var nodes = (root || document).querySelectorAll("time[data-rel]");
    for (var i = 0; i < nodes.length; i++) {
      var text = relativeTime(nodes[i].getAttribute("datetime"));
      if (text) nodes[i].textContent = text;
    }
  }

  var UNITS = ["B", "KB", "MB", "GB", "TB"];

  /** 1536 -> "1.5 KB". */
  function formatBytes(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) return "-";
    var i = 0;
    while (bytes >= 1024 && i < UNITS.length - 1) { bytes /= 1024; i++; }
    return (i === 0 || bytes >= 100 ? Math.round(bytes) : Math.round(bytes * 10) / 10) + " " + UNITS[i];
  }

  /** 93784 seconds -> "1 d 2 h". */
  function formatDuration(seconds) {
    if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "-";
    var d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return d + " d " + h + " h";
    if (h > 0) return h + " h " + m + " min";
    return m + " min";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * Returns an inline SVG sparkline for an array of numbers (null or NaN leaves a gap).
   * options: min, max (default: data range), status ("ok" | "warning" | "critical"), label (accessible name).
   */
  function sparkline(values, options) {
    options = options || {};
    var W = 120, H = 32, pad = 2;
    var points = (values || []).map(function (v) { return typeof v === "number" && isFinite(v) ? v : null; });
    var label = escapeHtml(options.label || "Trend");
    var cls = "a-spark" + (options.status && options.status !== "ok" ? " a-spark--" + options.status : "");
    var real = points.filter(function (v) { return v !== null; });
    if (real.length < 2) {
      return '<svg class="' + cls + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' +
        label + ': not enough data yet"><line class="a-spark__empty" x1="0" y1="' + H / 2 + '" x2="' + W + '" y2="' + H / 2 + '"/></svg>';
    }
    var min = typeof options.min === "number" ? options.min : Math.min.apply(null, real);
    var max = typeof options.max === "number" ? options.max : Math.max.apply(null, real);
    if (max === min) { max = min + 1; }
    var step = W / (points.length - 1);
    var segments = [], current = [];
    points.forEach(function (v, i) {
      if (v === null) { if (current.length) segments.push(current); current = []; return; }
      var y = H - pad - ((Math.min(Math.max(v, min), max) - min) / (max - min)) * (H - pad * 2);
      current.push([Math.round(i * step * 10) / 10, Math.round(y * 10) / 10]);
    });
    if (current.length) segments.push(current);
    var line = "", area = "";
    segments.forEach(function (seg) {
      seg.forEach(function (p, i) { line += (i === 0 ? "M" : "L") + p[0] + " " + p[1]; });
      if (seg.length > 1) {
        area += "M" + seg[0][0] + " " + H;
        seg.forEach(function (p) { area += "L" + p[0] + " " + p[1]; });
        area += "L" + seg[seg.length - 1][0] + " " + H + "Z";
      }
    });
    var last = real[real.length - 1];
    return '<svg class="' + cls + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' +
      label + ": latest " + Math.round(last * 10) / 10 + '"><path class="a-spark__area" d="' + area + '"/><path class="a-spark__line" d="' + line + '"/></svg>';
  }

  window.AutomatonUI = {
    version: "1.0.0",
    applyTheme: applyTheme,
    bindThemeToggle: bindThemeToggle,
    relativeTime: relativeTime,
    updateRelativeTimes: updateRelativeTimes,
    formatBytes: formatBytes,
    formatDuration: formatDuration,
    escapeHtml: escapeHtml,
    sparkline: sparkline
  };

  // Apply a saved theme before the first paint when this script is loaded in <head>.
  applyTheme(stored());
})();
