// Harbour wallpaper: shared constants, maths and drawing helpers, and the Entity base class.
// Every other file adds its classes to window.Harbour. Plain scripts, so the page also runs from file://.
window.Harbour = (function () {
  'use strict';
  const H = { TAU: Math.PI * 2, SHADE: '16,48,70' };

  // The name a class is known by in H (classes made with H.X = class {...} have no name of their own).
  const names = new Map(); H.nameOf = cls => { if (!names.has(cls)) names.set(cls, Object.keys(H).find(k => H[k] === cls) || cls.name || 'Entity'); return names.get(cls); };
  H.shade = a => 'rgba(' + H.SHADE + ',' + a + ')';
  H.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  H.lerp = (a, b, u) => a + (b - a) * u;
  H.angDiff = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  H.smin = (a, b, k) => { const h = H.clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  // A seeded random source: the same seed builds the same island.
  H.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // A few corner points become one smooth, closely sampled line (roads are drawn and travelled along it).
  H.dense = pts => {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]]; let prev = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = i === pts.length - 2 ? pts[i + 1] : [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      for (let k = 1; k <= 8; k++) { const u = k / 8, v = 1 - u; out.push([v * v * prev[0] + 2 * v * u * pts[i][0] + u * u * mid[0], v * v * prev[1] + 2 * v * u * pts[i][1] + u * u * mid[1]]); }
      prev = mid;
    }
    return out;
  };
  H.distTo = (pts, x, y) => {
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0] - ax, by = pts[i + 1][1] - ay, t = H.clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1), 0, 1); best = Math.min(best, Math.hypot(x - ax - bx * t, y - ay - by * t)); }
    return best;
  };

  // Drawing helpers; c is the 2D context, in world units.
  H.disc = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, H.TAU); c.fill(); };
  H.oval = (c, x, y, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, H.TAU); c.fill(); };
  H.line = (c, pts) => { c.beginPath(); pts.forEach((p, n) => c[n ? 'lineTo' : 'moveTo'](p[0], p[1])); };
  H.rrect = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

  // Painted sprites are drawn in their own roomy units: move to (x, y), turn, scale, then paint.
  H.sprite = (c, x, y, rot, scale, paint) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(scale, scale); paint(); c.restore(); };
  H.fillPath = (c, path, col) => { c.fillStyle = col; c.fill(path); };
  H.strokePath = (c, path, col, width) => { c.strokeStyle = col; c.lineWidth = width; c.stroke(path); };

  // Everything in the scene is an Entity. A class says in which drawing passes it appears (passes: layer -> method)
  // and how it takes clicks: 'top' swallows the click, 'one' lets only the topmost such thing react, 'many' lets all react.
  H.Entity = class {
    static passes = { upright: 'draw' };
    static clicks = null;
    static sound = null;   // the name of the sound made when this is clicked (see sounds.js); or give the class a soundFor(x, y) method
    static ownScale = false;   // true for a class that applies its own scale (it has several anchor points, or draws in screen space)
    constructor(world) { this.world = world; this.dead = false; this.scale = 1; }   // scale: 1 is as designed; the world draws and clicks it at any other size, about its x, y
    update(dt) {}
    hit(x, y) { return false; }
    click(x, y) {}
  };
  return H;
})();
