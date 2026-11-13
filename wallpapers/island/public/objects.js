// Island wallpaper: the object catalogue and how each object is drawn (top-down, in code).
(function (root) {
  "use strict";
  var THEMES = {
    Lagoon: { dry: "#f4ebe1", wet: "#ecdcb6", glow: "#cfeec4", shallow: "#45d3cf", mid: "#16aed0", deep: "#0a6a9c", foam: "#ffffff", grass: "#a9d277", grass2: "#74b45c", tree: "palm", shade: "16,48,70" },
    Dusk:   { dry: "#f6dcc6", wet: "#dca98c", glow: "#ffd3a8", shallow: "#e58f8c", mid: "#8e62a8", deep: "#2e2f6e", foam: "#fff1e0", grass: "#b9b071", grass2: "#8f9a5e", tree: "palm", shade: "40,20,60" },
    Arctic: { dry: "#f6fafc", wet: "#d3e4ee", glow: "#b4e0ea", shallow: "#4b9fc0", mid: "#256f9c", deep: "#10385c", foam: "#ffffff", grass: "#ffffff", grass2: "#dfeaf1", tree: "pine", shade: "10,30,60" }
  };
  var KEYS = ["dry", "wet", "glow", "shallow", "mid", "deep", "foam"];
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  var theme = THEMES.Lagoon;

  // spin: 1 = any rotation, 0 = nearly upright (objects that read as stickers)
  var KIND = {
    tree:       { label: "Tree", R: 0.075, group: "Nature", spin: 1, also: "palm pine" },
    castle:     { label: "Castle", R: 0.12, group: "Buildings", spin: 0, also: "fort palace tower" },
    house:      { label: "House", R: 0.1, group: "Buildings", spin: 0, also: "home" },
    hut:        { label: "Hut", R: 0.11, group: "Buildings", spin: 1, also: "cabin" },
    tent:       { label: "Tent", R: 0.085, group: "Buildings", spin: 1, also: "camping" },
    lighthouse: { label: "Lighthouse", R: 0.055, group: "Buildings", spin: 0 },
    sofa:       { label: "Sofa", R: 0.07, group: "Home", spin: 0, also: "couch" },
    campfire:   { label: "Campfire", R: 0.065, group: "Home", spin: 0, also: "fire bonfire" },
    coffee:     { label: "Coffee", R: 0.045, group: "Food", spin: 0, also: "cup tea espresso" },
    laptop:     { label: "Laptop", R: 0.05, group: "Work", spin: 0, also: "computer work" },
    bike:       { label: "Bike", R: 0.065, group: "Sport", spin: 0, also: "bicycle cycling" },
    football:   { label: "Football", R: 0.04, group: "Sport", spin: 1, also: "soccer ball" },
    guitar:     { label: "Guitar", R: 0.06, group: "Sport", spin: 0, also: "music" },
    car:        { label: "Car", R: 0.08, group: "Travel", spin: 1, also: "drive" },
    rowboat:    { label: "Rowboat", R: 0.075, group: "Travel", spin: 1, also: "boat" },
    cat:        { label: "Cat", R: 0.045, group: "Animals", spin: 1, also: "kitten" },
    dog:        { label: "Dog", R: 0.05, group: "Animals", spin: 1, also: "puppy" },
    person:     { label: "Person", R: 0.045, group: "Animals", spin: 1, also: "me human people" },
    parasol:    { label: "Parasol", R: 0.07, group: "Mood", spin: 1, also: "umbrella beach towel" }
  };
  var SCALE = { tree: 1, castle: 1.5, house: 1.2, hut: 1.15, tent: 1, lighthouse: 0.9, sofa: 1, campfire: 0.8, coffee: 0.6, laptop: 0.75, bike: 0.95, football: 0.5, guitar: 0.9, car: 1.05, rowboat: 1, cat: 0.6, dog: 0.7, person: 0.6, parasol: 1 };
  var SIZES = [0.72, 1, 1.38];

  // ---------- sprites (top-down, drawn in code) ----------
  function shade(a) { return "rgba(" + theme.shade + "," + a + ")"; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
  function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
  function oval(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.283); c.fill(); }
  function poly(c, r, n, rot) { c.beginPath(); for (var i = 0; i < n; i++) { var a = rot + i * 6.283 / n; c[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
  function leafPath(c, sz) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sz * 0.5, -sz * 0.3, sz * 1.15, 0); c.quadraticCurveTo(sz * 0.5, sz * 0.3, 0, 0); }
  function palm(c, sz, t, o, flat) {
    for (var i = 0; i < 7; i++) {
      c.save(); c.rotate(i / 7 * 6.283 + o.rot + 0.07 * Math.sin(t * 1.2 + i * 1.7));
      leafPath(c, sz); c.fillStyle = flat || (i % 2 ? "#3f9a55" : "#2f8048"); c.fill();
      if (!flat) { c.strokeStyle = "rgba(210,240,190,0.45)"; c.lineWidth = sz * 0.035; c.beginPath(); c.moveTo(sz * 0.1, 0); c.lineTo(sz * 1.0, 0); c.stroke(); }
      c.restore();
    }
    if (!flat) disc(c, 0, 0, sz * 0.15, "#7a5a3a");
  }
  function star(c, r, n, rot, inner) { c.beginPath(); for (var i = 0; i < n * 2; i++) { var a = rot + i * Math.PI / n, q = i % 2 ? r * inner : r; c[i ? "lineTo" : "moveTo"](Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); }
  function pine(c, sz, t, o, flat) {
    var cols = ["#1f5b3f", "#2c7550", "#3c8f62", "#e9f3f0"], rs = [1.0, 0.72, 0.44, 0.2];
    for (var i = 0; i < 4; i++) { star(c, sz * rs[i], 9, o.rot + i * 0.3, 0.72); c.fillStyle = flat || cols[i]; c.fill(); if (flat) break; }
  }
  var DRAW = {
    tree: function (c, sz, t, o) {
      var f = theme.tree === "pine" ? pine : palm;
      c.save(); c.translate(sz * 0.3, sz * 0.4); f(c, sz, t, o, shade(0.24)); c.restore();
      f(c, sz, t, o);
    },
    parasol: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      c.save(); c.translate(sz * 1.15, sz * 0.2); c.rotate(0.3);
      c.fillStyle = "#f7f3ea"; c.fillRect(-sz * 0.3, -sz * 0.6, sz * 0.6, sz * 1.2);
      c.fillStyle = "#2fa7a0"; for (var k = 0; k < 3; k++) c.fillRect(-sz * 0.3, -sz * 0.5 + k * sz * 0.42, sz * 0.6, sz * 0.16);
      c.restore(); c.restore();
      disc(c, sz * 0.28, sz * 0.36, sz * 0.78, shade(0.24));
      for (var i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, sz * 0.78, o.rot + i * 0.7854, o.rot + (i + 1) * 0.7854); c.closePath(); c.fillStyle = i % 2 ? "#fff4e6" : "#ff6f61"; c.fill(); }
      disc(c, 0, 0, sz * 0.09, "#fff4e6");
    },
    tent: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      c.fillStyle = shade(0.24); c.fillRect(-sz * 0.5, -sz * 0.23, sz * 1.5, sz * 1.1);
      c.fillStyle = "#f29c38"; c.fillRect(-sz * 0.75, -sz * 0.55, sz * 1.5, sz * 0.55);
      c.fillStyle = "#d97a1e"; c.fillRect(-sz * 0.75, 0, sz * 1.5, sz * 0.55);
      c.strokeStyle = "#fff0d6"; c.lineWidth = sz * 0.05; c.beginPath(); c.moveTo(-sz * 0.75, 0); c.lineTo(sz * 0.75, 0); c.stroke();
      c.fillStyle = "#8a4a10"; c.beginPath(); c.moveTo(sz * 0.75, -sz * 0.28); c.lineTo(sz * 0.42, 0); c.lineTo(sz * 0.75, sz * 0.28); c.closePath(); c.fill();
      c.restore();
    },
    hut: function (c, sz, t, o) {
      var h = sz * 0.85, cols = ["#d6b47c", "#c9a368", "#a57c44", "#b58d52"];
      c.save(); c.rotate(o.rot);
      c.fillStyle = shade(0.26); c.fillRect(-h + sz * 0.3, -h + sz * 0.4, h * 2, h * 2);
      var pts = [[-h, -h], [h, -h], [h, h], [-h, h]];
      for (var i = 0; i < 4; i++) { var a = pts[i], b = pts[(i + 1) % 4]; c.beginPath(); c.moveTo(0, 0); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fillStyle = cols[i]; c.fill(); }
      c.strokeStyle = "rgba(90,60,20,0.35)"; c.lineWidth = sz * 0.04; c.strokeRect(-h, -h, h * 2, h * 2);
      c.restore();
    },
    lighthouse: function (c, sz) {
      disc(c, sz * 0.3, sz * 0.4, sz * 0.6, shade(0.26));
      [[0.82, "#9aa3a8"], [0.58, "#ffffff"], [0.44, "#e04a3a"], [0.3, "#ffffff"], [0.17, "#ffe58a"]].forEach(function (r) { disc(c, 0, 0, sz * r[0], r[1]); });
    },
    campfire: function (c, sz, t) {
      var fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
      var g = c.createRadialGradient(0, 0, 0, 0, 0, sz * 1.5 * fl); g.addColorStop(0, "rgba(255,170,60,0.55)"); g.addColorStop(1, "rgba(255,170,60,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, sz * 1.5, 0, 6.283); c.fill();
      for (var i = 0; i < 8; i++) disc(c, Math.cos(i * 0.785) * sz * 0.45, Math.sin(i * 0.785) * sz * 0.45, sz * 0.13, "#8f979c");
      c.fillStyle = "#6b4526"; c.save(); c.rotate(0.6); c.fillRect(-sz * 0.34, -sz * 0.07, sz * 0.68, sz * 0.14); c.rotate(1.6); c.fillRect(-sz * 0.34, -sz * 0.07, sz * 0.68, sz * 0.14); c.restore();
      disc(c, 0, 0, sz * 0.2 * fl, "#ff8a2a"); disc(c, sz * 0.03, -sz * 0.02, sz * 0.1 * fl, "#ffe07a");
    },
    cat: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      oval(c, sz * 0.12, sz * 0.18, sz * 0.55, sz * 0.34, shade(0.22));
      c.strokeStyle = "#1d1d22"; c.lineWidth = sz * 0.13; c.lineCap = "round";
      c.beginPath(); c.moveTo(-sz * 0.4, 0); c.quadraticCurveTo(-sz * 0.75, 0, -sz * 0.95, Math.sin(t * 2.2) * sz * 0.32); c.stroke();
      oval(c, 0, 0, sz * 0.5, sz * 0.32, "#1d1d22"); disc(c, sz * 0.52, 0, sz * 0.25, "#1d1d22");
      [-1, 1].forEach(function (s) { c.beginPath(); c.moveTo(sz * 0.5, s * sz * 0.22); c.lineTo(sz * 0.72, s * sz * 0.34); c.lineTo(sz * 0.68, s * sz * 0.1); c.closePath(); c.fill(); });
      c.restore();
    },
    castle: function (c, sz, t, o) {
      var w = sz * 0.78, corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], dx = sz * 0.25, dy = sz * 0.32;
      c.save(); c.rotate(o.rot);
      c.fillStyle = shade(0.26); c.beginPath(); c.rect(-w + dx, -w + dy, w * 2, w * 2);
      corners.forEach(function (p) { c.moveTo(p[0] * w + dx + sz * 0.3, p[1] * w + dy); c.arc(p[0] * w + dx, p[1] * w + dy, sz * 0.3, 0, 6.283); }); c.fill();
      c.fillStyle = "#cfc9bb"; c.fillRect(-w, -w, w * 2, w * 2);
      c.fillStyle = "#a39c86"; c.fillRect(-w + sz * 0.2, -w + sz * 0.2, w * 2 - sz * 0.4, w * 2 - sz * 0.4);
      c.fillStyle = "#b3ad9e";
      for (var k = -1; k <= 1; k++) { var q = k * sz * 0.3 - sz * 0.05; c.fillRect(q, -w + sz * 0.05, sz * 0.1, sz * 0.1); c.fillRect(q, w - sz * 0.15, sz * 0.1, sz * 0.1); c.fillRect(-w + sz * 0.05, q, sz * 0.1, sz * 0.1); c.fillRect(w - sz * 0.15, q, sz * 0.1, sz * 0.1); }
      c.fillStyle = "#5a4632"; c.fillRect(-sz * 0.12, w - sz * 0.2, sz * 0.24, sz * 0.2);
      var kp = sz * 0.36, r = kp * 0.82, blues = ["#6f93ba", "#5b7fa6", "#4a6a8e", "#567aa0"], pts = [[-r, -r], [r, -r], [r, r], [-r, r]];
      c.fillStyle = "#d9d4c7"; c.fillRect(-kp, -kp, kp * 2, kp * 2);
      for (var i = 0; i < 4; i++) { var a = pts[i], b = pts[(i + 1) % 4]; c.beginPath(); c.moveTo(0, 0); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fillStyle = blues[i]; c.fill(); }
      corners.forEach(function (p) {
        var x = p[0] * w, y = p[1] * w;
        disc(c, x, y, sz * 0.3, "#d9d4c7"); disc(c, x, y, sz * 0.22, "#5b7fa6");
        c.fillStyle = "#7fa3c9"; c.beginPath(); c.moveTo(x, y); c.arc(x, y, sz * 0.22, -2.5, -1.3); c.closePath(); c.fill();
        disc(c, x, y, sz * 0.04, "#3d5876");
      });
      c.fillStyle = "#e04a3a"; c.beginPath(); c.moveTo(0, -sz * 0.07); c.lineTo(sz * 0.4, Math.sin(t * 3) * sz * 0.06); c.lineTo(0, sz * 0.07); c.closePath(); c.fill();
      disc(c, 0, 0, sz * 0.05, "#4a3a2a");
      c.restore();
    },
    house: function (c, sz, t, o) {
      var w = sz * 0.8, h = sz * 0.58;
      c.save(); c.rotate(o.rot);
      c.fillStyle = shade(0.26); c.fillRect(-w + sz * 0.25, -h + sz * 0.32, w * 2, h * 2);
      c.fillStyle = "#c8553d"; c.fillRect(-w, -h, w * 2, h); c.fillStyle = "#a94430"; c.fillRect(-w, 0, w * 2, h);
      c.strokeStyle = "rgba(80,20,10,0.25)"; c.lineWidth = sz * 0.025;
      [-2, -1, 1, 2].forEach(function (k) { c.beginPath(); c.moveTo(-w, k * h / 3); c.lineTo(w, k * h / 3); c.stroke(); });
      c.strokeStyle = "#f2c7b6"; c.lineWidth = sz * 0.05; c.beginPath(); c.moveTo(-w, 0); c.lineTo(w, 0); c.stroke();
      c.fillStyle = "#8d8d8d"; c.fillRect(w * 0.35, -h * 0.8, sz * 0.26, sz * 0.26); c.fillStyle = "#3a3a3a"; c.fillRect(w * 0.35 + sz * 0.06, -h * 0.8 + sz * 0.06, sz * 0.14, sz * 0.14);
      c.restore();
    },
    sofa: function (c, sz, t, o) {
      var w = sz * 0.85, h = sz * 0.5, cw = (w * 2 - sz * 0.64) / 2 - sz * 0.03;
      c.save(); c.rotate(o.rot);
      rr(c, -w + sz * 0.2, -h + sz * 0.28, w * 2, h * 2, sz * 0.14); c.fillStyle = shade(0.24); c.fill();
      rr(c, -w, -h, w * 2, h * 2, sz * 0.14); c.fillStyle = "#5d8fbf"; c.fill();
      rr(c, -w, -h, w * 2, sz * 0.3, sz * 0.12); c.fillStyle = "#466f96"; c.fill();
      rr(c, -w, -h, sz * 0.28, h * 2, sz * 0.12); c.fillStyle = "#4f7ba6"; c.fill();
      rr(c, w - sz * 0.28, -h, sz * 0.28, h * 2, sz * 0.12); c.fill();
      c.fillStyle = "#7fabd6";
      rr(c, -w + sz * 0.32, -h + sz * 0.34, cw, h * 2 - sz * 0.44, sz * 0.08); c.fill();
      rr(c, -w + sz * 0.32 + cw + sz * 0.06, -h + sz * 0.34, cw, h * 2 - sz * 0.44, sz * 0.08); c.fill();
      c.save(); c.translate(-w + sz * 0.5, -h + sz * 0.5); c.rotate(0.4); rr(c, -sz * 0.14, -sz * 0.14, sz * 0.28, sz * 0.28, sz * 0.06); c.fillStyle = "#ffd166"; c.fill(); c.restore();
      c.restore();
    },
    laptop: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      rr(c, -sz * 0.5, -sz * 0.55, sz * 1.32, sz * 1.47, sz * 0.07); c.fillStyle = shade(0.22); c.fill();
      rr(c, -sz * 0.6, -sz * 0.75, sz * 1.2, sz * 0.72, sz * 0.06); c.fillStyle = "#2b2f38"; c.fill();
      var g = c.createLinearGradient(0, -sz * 0.68, 0, -sz * 0.1); g.addColorStop(0, "#6bb8ff"); g.addColorStop(1, "#2e6fd1");
      c.fillStyle = g; c.fillRect(-sz * 0.52, -sz * 0.68, sz * 1.04, sz * 0.58);
      c.fillStyle = "rgba(255,255,255,0.7)"; [0.6, 0.4, 0.5].forEach(function (len, i) { c.fillRect(-sz * 0.42, -sz * 0.58 + i * sz * 0.13, sz * len, sz * 0.05); });
      rr(c, -sz * 0.66, 0, sz * 1.32, sz * 0.72, sz * 0.07); c.fillStyle = "#d5d9de"; c.fill();
      c.fillStyle = "#8c939c"; for (var r = 0; r < 3; r++) for (var k = 0; k < 8; k++) c.fillRect(-sz * 0.56 + k * sz * 0.142, sz * 0.08 + r * sz * 0.12, sz * 0.1, sz * 0.08);
      rr(c, -sz * 0.2, sz * 0.47, sz * 0.4, sz * 0.19, sz * 0.03); c.fillStyle = "#b9bfc6"; c.fill();
      c.restore();
    },
    bike: function (c, sz, t, o) {
      function body(frame, wheel, seat) {
        c.lineCap = "round"; c.lineJoin = "round";
        c.strokeStyle = wheel; c.lineWidth = sz * 0.09;
        [-0.55, 0.55].forEach(function (x) { c.beginPath(); c.arc(x * sz, sz * 0.15, sz * 0.4, 0, 6.283); c.stroke(); });
        c.strokeStyle = frame; c.lineWidth = sz * 0.08; c.beginPath();
        c.moveTo(-sz * 0.55, sz * 0.15); c.lineTo(-sz * 0.02, sz * 0.15); c.lineTo(-sz * 0.2, -sz * 0.32); c.lineTo(-sz * 0.55, sz * 0.15);
        c.moveTo(-sz * 0.2, -sz * 0.32); c.lineTo(sz * 0.38, -sz * 0.3); c.lineTo(-sz * 0.02, sz * 0.15);
        c.moveTo(sz * 0.38, -sz * 0.3); c.lineTo(sz * 0.55, sz * 0.15); c.stroke();
        c.strokeStyle = seat; c.beginPath(); c.moveTo(-sz * 0.34, -sz * 0.42); c.lineTo(-sz * 0.08, -sz * 0.42);
        c.moveTo(sz * 0.38, -sz * 0.3); c.lineTo(sz * 0.42, -sz * 0.5); c.moveTo(sz * 0.3, -sz * 0.53); c.lineTo(sz * 0.54, -sz * 0.5); c.stroke();
      }
      c.save(); c.rotate(o.rot);
      c.save(); c.translate(sz * 0.14, sz * 0.24); var s = shade(0.2); body(s, s, s); c.restore();
      body("#e04a3a", "#2f3338", "#2f3338");
      disc(c, -sz * 0.55, sz * 0.15, sz * 0.06, "#c9ccd1"); disc(c, sz * 0.55, sz * 0.15, sz * 0.06, "#c9ccd1");
      c.restore();
    },
    dog: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      oval(c, sz * 0.14, sz * 0.2, sz * 0.62, sz * 0.38, shade(0.22));
      c.strokeStyle = "#c08a52"; c.lineWidth = sz * 0.12; c.lineCap = "round";
      c.beginPath(); c.moveTo(-sz * 0.5, 0); c.quadraticCurveTo(-sz * 0.72, 0, -sz * 0.9, Math.sin(t * 7) * sz * 0.24); c.stroke();
      oval(c, 0, 0, sz * 0.58, sz * 0.36, "#c08a52"); oval(c, -sz * 0.12, 0, sz * 0.26, sz * 0.2, "#e3c08e");
      c.strokeStyle = "#e04a3a"; c.lineWidth = sz * 0.08; c.beginPath(); c.moveTo(sz * 0.4, -sz * 0.22); c.lineTo(sz * 0.4, sz * 0.22); c.stroke();
      disc(c, sz * 0.62, 0, sz * 0.28, "#c08a52");
      [-1, 1].forEach(function (s) { c.save(); c.translate(sz * 0.52, s * sz * 0.28); c.rotate(s * 0.5); oval(c, 0, 0, sz * 0.13, sz * 0.21, "#8a5a2e"); c.restore(); });
      oval(c, sz * 0.86, 0, sz * 0.14, sz * 0.11, "#e3c08e"); disc(c, sz * 0.96, 0, sz * 0.05, "#2a2a2a");
      c.restore();
    },
    person: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot);
      oval(c, sz * 0.16, sz * 0.24, sz * 0.36, sz * 0.6, shade(0.22));
      oval(c, 0, 0, sz * 0.3, sz * 0.58, "#2fa7a0");
      disc(c, sz * 0.03, 0, sz * 0.36, "#e9d29a"); disc(c, sz * 0.03, 0, sz * 0.2, "#f3e2b3");
      c.strokeStyle = "#c0563f"; c.lineWidth = sz * 0.05; c.beginPath(); c.arc(sz * 0.03, 0, sz * 0.21, 0, 6.283); c.stroke();
      c.restore();
    },
    rowboat: function (c, sz, t, o) {
      function hull() { c.beginPath(); c.moveTo(sz, 0); c.quadraticCurveTo(sz * 0.4, -sz * 0.5, -sz * 0.8, -sz * 0.38); c.lineTo(-sz * 0.8, sz * 0.38); c.quadraticCurveTo(sz * 0.4, sz * 0.5, sz, 0); c.closePath(); }
      c.save(); c.rotate(o.rot);
      c.save(); c.translate(sz * 0.2, sz * 0.28); hull(); c.fillStyle = shade(0.24); c.fill(); c.restore();
      c.strokeStyle = "#7a4a22"; c.lineWidth = sz * 0.06; c.lineCap = "round";
      [-1, 1].forEach(function (s) { c.beginPath(); c.moveTo(-sz * 0.05, s * sz * 0.1); c.lineTo(sz * 0.3, s * sz * 0.8); c.stroke(); c.save(); c.translate(sz * 0.32, s * sz * 0.84); c.rotate(s * 1.15); oval(c, 0, 0, sz * 0.14, sz * 0.06, "#7a4a22"); c.restore(); });
      hull(); c.fillStyle = "#a8672f"; c.fill();
      c.save(); c.scale(0.84, 0.76); hull(); c.fillStyle = "#e0b07a"; c.fill(); c.restore();
      c.fillStyle = "#a8672f"; c.fillRect(-sz * 0.38, -sz * 0.31, sz * 0.14, sz * 0.62); c.fillRect(sz * 0.18, -sz * 0.26, sz * 0.14, sz * 0.52);
      c.restore();
    },
    coffee: function (c, sz, t) {
      disc(c, sz * 0.18, sz * 0.24, sz * 0.62, shade(0.22));
      disc(c, 0, 0, sz * 0.62, "#f4f1ea");
      c.strokeStyle = "#ded8cb"; c.lineWidth = sz * 0.04; c.beginPath(); c.arc(0, 0, sz * 0.5, 0, 6.283); c.stroke();
      rr(c, sz * 0.28, -sz * 0.1, sz * 0.36, sz * 0.2, sz * 0.1); c.fillStyle = "#ffffff"; c.fill();
      disc(c, 0, 0, sz * 0.4, "#ffffff"); disc(c, 0, 0, sz * 0.32, "#6b3f22");
      c.strokeStyle = "#d3a877"; c.lineWidth = sz * 0.06; c.lineCap = "round";
      c.beginPath(); c.arc(0, 0, sz * 0.17, 0.4, 3.4); c.stroke(); c.beginPath(); c.arc(sz * 0.02, 0, sz * 0.06, 3.4, 6.6); c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.4)"; c.lineWidth = sz * 0.07;
      [-1, 1].forEach(function (s) { var sw = Math.sin(t * 2 + s) * sz * 0.08; c.beginPath(); c.moveTo(s * sz * 0.12, -sz * 0.2); c.quadraticCurveTo(s * sz * 0.12 + sz * 0.14 + sw, -sz * 0.5, s * sz * 0.12 - sw, -sz * 0.85); c.stroke(); });
    },
    guitar: function (c, sz, t, o) {
      c.save(); c.rotate(o.rot - 0.6);
      disc(c, -sz * 0.2, sz * 0.26, sz * 0.46, shade(0.22)); disc(c, sz * 0.22, sz * 0.26, sz * 0.36, shade(0.22));
      c.fillStyle = "#5a3a22"; c.fillRect(sz * 0.2, -sz * 0.07, sz * 1.0, sz * 0.14);
      rr(c, sz * 1.15, -sz * 0.11, sz * 0.25, sz * 0.22, sz * 0.04); c.fillStyle = "#3a2616"; c.fill();
      disc(c, -sz * 0.35, 0, sz * 0.46, "#a8621f"); disc(c, sz * 0.1, 0, sz * 0.36, "#a8621f");
      disc(c, -sz * 0.35, 0, sz * 0.41, "#e09a45"); disc(c, sz * 0.1, 0, sz * 0.31, "#e09a45");
      disc(c, sz * 0.02, 0, sz * 0.12, "#3a2616"); c.fillStyle = "#3a2616"; c.fillRect(-sz * 0.52, -sz * 0.12, sz * 0.07, sz * 0.24);
      c.strokeStyle = "rgba(255,255,255,0.65)"; c.lineWidth = Math.max(0.6, sz * 0.015);
      [-0.04, 0, 0.04].forEach(function (y) { c.beginPath(); c.moveTo(-sz * 0.47, y * sz); c.lineTo(sz * 1.2, y * sz); c.stroke(); });
      c.restore();
    },
    football: function (c, sz, t, o) {
      disc(c, sz * 0.16, sz * 0.22, sz * 0.5, shade(0.24));
      disc(c, 0, 0, sz * 0.5, "#ffffff");
      c.save(); c.beginPath(); c.arc(0, 0, sz * 0.5, 0, 6.283); c.clip(); c.rotate(o.rot);
      c.fillStyle = "#2a2d33"; c.strokeStyle = "#2a2d33"; c.lineWidth = sz * 0.03;
      poly(c, sz * 0.19, 5, -1.571); c.fill();
      for (var i = 0; i < 5; i++) { var a = -1.571 + i * 1.2566; c.beginPath(); c.moveTo(Math.cos(a) * sz * 0.19, Math.sin(a) * sz * 0.19); c.lineTo(Math.cos(a) * sz * 0.36, Math.sin(a) * sz * 0.36); c.stroke(); c.save(); c.translate(Math.cos(a) * sz * 0.5, Math.sin(a) * sz * 0.5); poly(c, sz * 0.18, 5, a + 3.1416); c.fill(); c.restore(); }
      c.restore();
      c.strokeStyle = "#c9ccd1"; c.lineWidth = sz * 0.03; c.beginPath(); c.arc(0, 0, sz * 0.5, 0, 6.283); c.stroke();
    },
    car: function (c, sz, t, o) {
      var w = sz * 0.9, h = sz * 0.45;
      c.save(); c.rotate(o.rot);
      rr(c, -w + sz * 0.2, -h + sz * 0.28, w * 2, h * 2, sz * 0.2); c.fillStyle = shade(0.26); c.fill();
      c.fillStyle = "#22252a"; [-0.72, 0.42].forEach(function (x) { c.fillRect(x * w, -h - sz * 0.05, sz * 0.3, sz * 0.12); c.fillRect(x * w, h - sz * 0.07, sz * 0.3, sz * 0.12); });
      rr(c, -w, -h, w * 2, h * 2, sz * 0.2); c.fillStyle = "#e04a3a"; c.fill();
      rr(c, -w * 0.45, -h * 0.8, w, h * 1.6, sz * 0.12); c.fillStyle = "#f06a5a"; c.fill();
      c.fillStyle = "#2c4a66"; rr(c, w * 0.3, -h * 0.72, w * 0.26, h * 1.44, sz * 0.06); c.fill(); rr(c, -w * 0.62, -h * 0.68, w * 0.2, h * 1.36, sz * 0.06); c.fill();
      c.fillStyle = "#ffe58a"; c.fillRect(w - sz * 0.08, -h * 0.78, sz * 0.08, sz * 0.16); c.fillRect(w - sz * 0.08, h * 0.78 - sz * 0.16, sz * 0.08, sz * 0.16);
      c.fillStyle = "#8f1d12"; c.fillRect(-w, -h * 0.78, sz * 0.07, sz * 0.16); c.fillRect(-w, h * 0.78 - sz * 0.16, sz * 0.07, sz * 0.16);
      c.restore();
    }
  };


  var api = {
    THEMES: THEMES, KEYS: KEYS, rgb: rgb, KIND: KIND, SCALE: SCALE, SIZES: SIZES, DRAW: DRAW,
    GROUPS: ["Nature", "Buildings", "Home", "Food", "Work", "Sport", "Travel", "Animals", "Mood"],
    useTheme: function (name) { theme = THEMES[name] || THEMES.Lagoon; return theme; },
    shade: shade, disc: disc, oval: oval
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.IslandObjects = api;
})(typeof window !== "undefined" ? window : globalThis);
