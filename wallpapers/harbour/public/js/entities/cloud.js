// A cloud drifting on the wind, with its shadow on the island below. Click it and it blows away; a new one drifts in.
// Drawn as vector shapes (not a cached picture), so it stays sharp at any zoom.
import { TAU, SHADE, Entity } from '../core/index.js';

export class Cloud extends Entity {
  static passes = { skyShadow: 'drawShadow', clouds: 'draw' };
  static clicks = 'top';
  static cullRadius = 0.5;   // a big cloud and its shadow
  static ownScale = true;   // it scales through its own size r, not about a point
  constructor(world, rnd, x, y) { super(world); this.shape(rnd); this.x = x; this.y = y; }
  // A few large lumps and a ring of smaller ones on their edge: the outline carries the shape.
  shape(rnd) {
    const puffs = [{ x: 0, y: 0, r: 0.52 }], n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1, d = 0.5 + rnd() * 0.25 + Math.floor(i / 2) * 0.4; puffs.push({ x: s * d, y: (rnd() - 0.5) * 0.24, r: 0.36 - Math.floor(i / 2) * 0.08 + rnd() * 0.08 }); }
    const lumps = puffs.length;
    for (let i = 0; i < 5 + Math.floor(rnd() * 4); i++) { const base = puffs[Math.floor(rnd() * lumps)], a = rnd() * TAU; puffs.push({ x: base.x + Math.cos(a) * base.r * 0.9, y: base.y + Math.sin(a) * base.r * 0.8, r: 0.13 + rnd() * 0.12 }); }
    this.puffs = puffs; this.r = 0.05 + rnd() * 0.05; this.speed = 0.005 + rnd() * 0.005; this.alpha = 1; this.fade = false;
  }
  // The outline of all the lumps together, moved by (dx, dy) cloud-radii and grown by m. One path, so it fills as one shape.
  outline(c, dx, dy, m) {
    const s = this.scale * this.r; c.beginPath();
    this.puffs.forEach(p => { const x = this.x + (p.x + dx) * s, y = this.y + (p.y + dy) * s; c.moveTo(x + p.r * s * m, y); c.arc(x, y, p.r * s * m, 0, TAU); });
  }
  hit(x, y) { const s = this.scale * this.r; return !this.fade && this.puffs.some(p => Math.hypot(this.x + p.x * s - x, this.y + p.y * s - y) < p.r * s); }
  click(x, y) { this.fade = true; this.world.burst(x, y, 12, 0.1, '255,255,255', 0.009, 0.9); }
  update(dt) {
    const w = this.world, wind = w.wind, hw = w.hw, hh = w.hh;
    this.x += wind[0] * this.speed * dt; this.y += wind[1] * this.speed * dt;
    this.alpha += ((this.fade ? 0 : 1) - this.alpha) * Math.min(1, dt * 2.5);
    if (Math.abs(this.x) > hw + this.r * 2.6 || Math.abs(this.y) > hh + this.r * 2 || (this.fade && this.alpha < 0.02)) {   // a new one drifts in on the upwind side
      this.shape(Math.random);
      if (Math.abs(wind[0]) * hh > Math.abs(wind[1]) * hw) { this.x = -Math.sign(wind[0]) * (hw + this.r * 2.5); this.y = (Math.random() - 0.5) * 2 * hh; }
      else { this.y = -Math.sign(wind[1]) * (hh + this.r * 1.9); this.x = (Math.random() - 0.5) * 2 * hw; }
    }
  }
  drawShadow(c) { this.outline(c, 0.05 / this.r, 0.072 / this.r, 1); c.globalAlpha = 0.2 * this.alpha; c.fillStyle = 'rgb(' + SHADE + ')'; c.fill(); }
  // three flat tones, lit from the top left: the whole shape white, then two shifted copies clipped to it
  draw(c) {
    c.globalAlpha = 0.96 * this.alpha; c.fillStyle = '#ffffff';
    this.outline(c, 0, 0, 1); c.fill(); c.clip();
    this.outline(c, 0.055, 0.08, 0.99); c.fillStyle = '#e6ecf7'; c.fill();
    this.outline(c, 0.2, 0.27, 0.96); c.fillStyle = '#d5deef'; c.fill();
  }
}
