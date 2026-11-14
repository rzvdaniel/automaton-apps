// Boats: rowing boats at their moorings in the cove, and sailing boats out at sea. Click one to rock it or send it off.
import { shade, angDiff, disc, glow, switchOn, Entity } from '../core/index.js';

const hull = (c, L, Wd) => { c.beginPath(); c.moveTo(L, 0); c.quadraticCurveTo(L * 0.4, -Wd, -L * 0.75, -Wd * 0.85); c.lineTo(-L * 0.75, Wd * 0.85); c.quadraticCurveTo(L * 0.4, Wd, L, 0); c.closePath(); };
// Anything that moves through water can leave a wake: it remembers where it has been.
export const trail = (k, step, back) => { k.tick += step; if (k.tick > 0.3) { k.tick = 0; k.trail.push([k.x - Math.cos(k.a) * back, k.y - Math.sin(k.a) * back, k.a]); if (k.trail.length > 20) k.trail.shift(); } };
export const drawWake = (c, k, spread, size, strength) => { const n = k.trail.length; for (let i = 0; i < n; i++) { const p = k.trail[i], age = 1 - i / n, sp = spread * (0.25 + age), r = size * (1 - age * 0.5); [-1, 1].forEach(s => disc(c, p[0] - Math.sin(p[2]) * sp * s, p[1] + Math.cos(p[2]) * sp * s, r, 'rgba(255,255,255,' + ((1 - age) * 0.5 * (strength === undefined ? 1 : strength)) + ')')); } };

export class MooredBoat extends Entity {
  static passes = { water: 'draw', lights: 'drawLights' };
  static clicks = 'many';
  constructor(world, o) {   // o: x, y, a, col, mast
    super(world); Object.assign(this, o); this.rock = 0;
    this.lanternAt = Math.random() < 0.35 ? 0.2 + Math.random() * 0.4 : 2;   // a few have a lantern lit at night
  }
  drawLights(c) { glow(c, this.x, this.y, 0.006, switchOn(this.lanternAt, this.darkness) * 0.8); }
  update(dt) { this.rock = Math.max(0, this.rock - dt * 0.7); }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.014; }
  click() { this.rock = 1; this.world.ripple(this.x, this.y, 0.6); }
  draw(c, t) {
    const L = 0.0105, Wd = 0.0042;
    const turn = this.a + (0.12 + this.rock * 0.5) * Math.sin(t * (0.8 + this.rock * 6) + this.x * 40), s = this.castShadow(0.0036, turn);
    c.save(); c.translate(this.x, this.y); c.rotate(turn);
    c.save(); c.translate(s.x, s.y); hull(c, L, Wd); c.fillStyle = shade(0.24 * s.a); c.fill(); c.restore();
    hull(c, L, Wd); c.fillStyle = this.col; c.fill(); c.save(); c.scale(0.8, 0.7); hull(c, L, Wd); c.fillStyle = '#ecd9b0'; c.fill(); c.restore();
    c.fillStyle = this.col; c.fillRect(-L * 0.25, -Wd * 0.7, L * 0.14, Wd * 1.4);
    if (this.mast) { disc(c, L * 0.15, 0, 0.0011, '#5a4632'); c.strokeStyle = '#f7f2e8'; c.lineWidth = 0.0016; c.beginPath(); c.moveTo(L * 0.15, 0); c.lineTo(-L * 0.7, 0); c.stroke(); }
    c.restore();
  }
}

export class Sailboat extends Entity {
  static passes = { water: 'draw' };
  static ownScale = true;   // the wake is not scaled with the hull, only its spread
  static clicks = 'many';
  constructor(world, o) { super(world); Object.assign(this, o); this.rush = 0; this.trail = []; this.tick = 0; }   // o: x, y, a, sail
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.03 * this.scale; }
  click() { this.rush = 3; }
  update(dt) {
    const w = this.world, g = w.grad(this.x, this.y), hw = w.hw, hh = w.hh; this.rush = Math.max(0, this.rush - dt);
    if (g.d < 0.17) this.a += angDiff(Math.atan2(g.gy, g.gx), this.a) * Math.min(1, dt * 1.2); else this.a += Math.sin(w.clock * 0.15 + this.x * 5) * 0.05 * dt;
    const v = 0.013 * (1 + 2 * Math.min(1, this.rush));
    this.x += Math.cos(this.a) * v * dt; this.y += Math.sin(this.a) * v * dt;
    let wrapped = false;
    if (this.x > hw + 0.08) { this.x = -hw - 0.08; wrapped = true; } if (this.x < -hw - 0.08) { this.x = hw + 0.08; wrapped = true; } if (this.y > hh + 0.08) { this.y = -hh - 0.08; wrapped = true; } if (this.y < -hh - 0.08) { this.y = hh + 0.08; wrapped = true; }
    if (wrapped) this.trail = [];
    trail(this, dt * v / 0.013, 0.012 * this.scale);
  }
  draw(c, t) {
    const L = 0.015, Wd = 0.0052, heel = 0.004 + 0.001 * Math.sin(t * 0.9 + this.x * 20) + 0.002 * Math.min(1, this.rush);
    drawWake(c, this, 0.012 * this.scale, 0.0022 * this.scale);
    c.save(); c.translate(this.x, this.y); c.rotate(this.a); c.scale(this.scale, this.scale);
    const s = this.castShadow(0.005, this.a), sail = this.castShadow(0.0066, this.a);   // the sail stands taller than the hull
    c.save(); c.translate(s.x, s.y); hull(c, L, Wd); c.fillStyle = shade(0.25 * s.a); c.fill(); c.restore();
    hull(c, L, Wd); c.fillStyle = '#f7f2e8'; c.fill(); c.save(); c.scale(0.8, 0.68); hull(c, L, Wd); c.fillStyle = '#d6ad76'; c.fill(); c.restore();
    const cloth = (col, ox, oy) => {   // mainsail and jib, bellying to leeward, moved by (ox, oy)
      c.fillStyle = col;
      c.beginPath(); c.moveTo(L * 0.25 + ox, oy); c.quadraticCurveTo(-L * 0.3 + ox, heel * 3.4 + oy, -L * 0.95 + ox, heel * 1.4 + oy); c.quadraticCurveTo(-L * 0.3 + ox, heel * 1.2 + oy, L * 0.25 + ox, oy); c.fill();
      c.beginPath(); c.moveTo(L * 1.0 + ox, oy); c.quadraticCurveTo(L * 0.6 + ox, heel * 2.2 + oy, L * 0.28 + ox, heel * 0.6 + oy); c.quadraticCurveTo(L * 0.6 + ox, heel * 0.5 + oy, L * 1.0 + ox, oy); c.fill();
    };
    cloth(shade(0.2 * sail.a), sail.x, sail.y); cloth(this.sail, 0, 0);
    disc(c, L * 0.25, 0, 0.0011, '#5a4632');
    c.restore();
  }
}
