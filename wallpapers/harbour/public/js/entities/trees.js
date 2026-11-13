// Trees. Each kind paints its own crown; all of them lean and spring back as the gusts cross the island.
// The crown sits a little above the foot of the trunk, so the tree reads as standing up. Click one to shake it.
import { TAU, shade, disc, oval, Entity } from '../core/index.js';
import { Gull } from './gulls.js';

export class Tree extends Entity {
  static clicks = 'one';
  static leaf = '86,166,91';
  constructor(world, o) { super(world); Object.assign(this, o); this.shake = 0; }   // o: x, y, r, rot
  update(dt) { this.shake = Math.max(0, this.shake - dt * 0.9); }
  hit(x, y) { return Math.hypot(this.x - x, this.y - this.r * 0.35 - y) < this.r + 0.004; }
  click() {
    const w = this.world; this.shake = 1; w.burst(this.x, this.y - this.r * 0.4, 7, 0.05, this.constructor.leaf, 0.003, 0.8);
    if (w.count(Gull) < 12 && Math.random() < 0.4) { const b = w.add(new Gull(w, this.x, this.y, Math.random() * TAU)); b.rush = 1.5; }
  }
  // The crown's offset right now, in world units, for a part that moves `much` (the top moves more than the bottom).
  lean(t, much) { const s = this.world.sway(this.x, this.y), k = this.r * much; return [s[0] * k + this.shake * 0.0025 * Math.sin(t * 30) * much, s[1] * k]; }
  trunk(c, tx, ty, col, width) { c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(tx, ty); c.stroke(); }
}

// Broad and round, built from clumps of leaves in three greens.
export class Oak extends Tree {
  draw(c, t) {
    const r = this.r, x = this.x, top = this.y - r * 0.45, a = this.lean(t, 1), b = this.lean(t, 1.5), d = this.lean(t, 2);
    oval(c, x + r * 0.5, this.y + r * 0.3, r * 1.02, r * 0.74, shade(0.22));
    this.trunk(c, x + a[0] * 0.5, top + r * 0.5, '#6b4f38', r * 0.2);
    const clump = (cx, cy, rad, n, spread, col) => { disc(c, cx, cy, rad, col); for (let i = 0; i < n; i++) { const g = this.rot + i * TAU / n; disc(c, cx + Math.cos(g) * rad * spread, cy + Math.sin(g) * rad * spread * 0.9, rad * 0.52, col); } };
    clump(x + a[0], top + r * 0.12 + a[1], r * 0.86, 7, 0.62, '#2f7340');
    clump(x + a[0] - r * 0.03, top + a[1], r * 0.8, 7, 0.6, '#3d8a4d');
    clump(x - r * 0.14 + b[0], top - r * 0.17 + b[1], r * 0.58, 6, 0.6, '#56a65b');
    clump(x - r * 0.3 + d[0], top - r * 0.36 + d[1], r * 0.28, 5, 0.62, '#80c570');
    disc(c, x - r * 0.4 + d[0], top - r * 0.48 + d[1], r * 0.11, '#a8dc8c');
  }
}

// A conifer: tiers of dark needles, each smaller and higher than the one below.
export class Pine extends Tree {
  static leaf = '61,127,86';
  draw(c, t) {
    const r = this.r * 0.9, x = this.x, cols = ['#1f4f3a', '#2a6347', '#387a55', '#4f9468', '#73b283'];
    oval(c, x + r * 0.55, this.y + r * 0.35, r * 0.9, r * 0.6, shade(0.22));
    this.trunk(c, x, this.y - r * 0.3, '#5d4532', r * 0.16);
    for (let i = 0; i < 5; i++) {
      const s = this.lean(t, 0.5 + i * 0.5), rad = r * (0.98 - i * 0.19), cx = x + s[0], cy = this.y - r * 0.22 - i * r * 0.27 + s[1], n = 9;
      c.fillStyle = cols[i]; c.beginPath();
      for (let k = 0; k < n * 2; k++) { const g = this.rot + i * 0.5 + k * Math.PI / n, rr = rad * (k % 2 ? 0.66 : 1); c[k ? 'lineTo' : 'moveTo'](cx + Math.cos(g) * rr, cy + Math.sin(g) * rr * 0.92); }
      c.closePath(); c.fill();
    }
  }
}

// Slim and airy: a pale trunk and a few light crowns that move the most in the wind.
export class Birch extends Tree {
  static leaf = '169,214,124';
  draw(c, t) {
    const r = this.r * 0.9, x = this.x, s = this.lean(t, 2.2), tx = x + s[0] * 0.8, ty = this.y - r * 1.35 + s[1];
    oval(c, x + r * 0.5, this.y + r * 0.28, r * 0.72, r * 0.46, shade(0.19));
    this.trunk(c, tx, ty + r * 0.3, '#f3eee2', r * 0.17);
    c.strokeStyle = '#5a5a55'; c.lineWidth = r * 0.05; [0.25, 0.5].forEach(u => { const px = x + (tx - x) * u, py = this.y + (ty + r * 0.3 - this.y) * u; c.beginPath(); c.moveTo(px - r * 0.07, py); c.lineTo(px + r * 0.05, py); c.stroke(); });
    [[0.3, 0.3, 0.42], [-0.36, 0.2, 0.44], [0, -0.02, 0.56], [0.1, -0.4, 0.4]].forEach((p, i) => {
      const q = this.lean(t, 2.2 + i * 0.5), cx = tx + p[0] * r + q[0] - s[0], cy = ty + p[1] * r, rad = p[2] * r;
      disc(c, cx + rad * 0.12, cy + rad * 0.16, rad, '#5f9f4c'); disc(c, cx, cy, rad * 0.96, '#86c063'); disc(c, cx - rad * 0.2, cy - rad * 0.22, rad * 0.62, '#a9d67c'); disc(c, cx - rad * 0.34, cy - rad * 0.38, rad * 0.26, '#cdeb9e');
    });
  }
}
