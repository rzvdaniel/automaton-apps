// A child on the grass flying a kite. The kite swings in a slow figure of eight downwind, its tail of bows fluttering.
// Click the kite and it loops the loop; click the child and they jump.
// new Kite(world, { x, y })   x, y: where the child stands
import { TAU, shade, angDiff, disc, oval, sprite, Entity, AIRBORNE } from '../core/index.js';

const U = 0.0002;
export class Kite extends Entity {
  static passes = { upright: 'drawChild', skyShadow: 'drawShadow', birds: 'drawKite' };
  static clicks = 'many';
  static active = 'day';   // goes home at dusk (see engine/presence.js)
  static cullRadius = 0.2;   // the kite flies that far from the child
  constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.seed = Math.random() * 9; this.loop = 0; this.hop = 0; this.kx = o.x; this.ky = o.y; this.ka = 0; this.place(0); }
  place(dt) {
    const w = this.world, t = w.clock * 0.7 + this.seed, wl = Math.hypot(w.wind[0], w.wind[1]) || 1, ux = w.wind[0] / wl, uy = w.wind[1] / wl;
    const along = 0.062 + 0.006 * Math.sin(t * 2), across = 0.022 * Math.sin(t), px = this.kx, py = this.ky;
    let x = this.x + ux * along - uy * across, y = this.y - 0.03 + uy * along + ux * across + 0.006 * Math.sin(t * 2);
    if (this.loop) { const g = this.loop * TAU; x += Math.sin(g) * 0.012; y += (Math.cos(g) - 1) * 0.012; }
    this.kx = x; this.ky = y;
    if (dt) this.ka += angDiff(Math.atan2(uy, ux) + 0.9 * Math.cos(t) + (this.loop ? this.loop * TAU : 0), this.ka) * Math.min(1, dt * 6);
    void px; void py;
  }
  hit(x, y) { return Math.hypot(this.kx - x, this.ky - y) < 0.016 || Math.hypot(this.x - x, this.y - y) < 0.01; }
  click(x, y) { if (Math.hypot(this.x - x, this.y - y) < 0.01) this.hop = 1; else if (!this.loop) this.loop = 0.001; }
  update(dt) { this.hop = Math.max(0, this.hop - dt); if (this.loop) { this.loop += dt / 1.3; if (this.loop >= 1) this.loop = 0; } this.place(dt); }
  drawChild(c) {
    const lift = this.hop > 0 ? Math.abs(Math.sin(this.hop * 12)) * 0.003 : 0, x = this.x, y = this.y - lift;
    const s = this.castShadow(0.0024); oval(c, this.x + s.x, this.y + s.y, 0.0022, 0.0028, shade(0.24 * s.a));
    oval(c, x, y, 0.002, 0.0027, '#e2553f'); oval(c, x - 0.0003, y - 0.0004, 0.0016, 0.002, '#f0776a');
    disc(c, x, y - 0.0009, 0.0016, '#f3e2b3'); disc(c, x - 0.0002, y - 0.0014, 0.0015, '#7a4a2a');   // hair
    c.strokeStyle = '#f0776a'; c.lineWidth = 0.0008; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 0.001, y - 0.0004); c.lineTo(x + 0.003, y - 0.0028); c.stroke();   // the arm holding the line
  }
  drawShadow(c) { const s = this.castShadow(0.052, 0, AIRBORNE); sprite(c, this.kx + s.x, this.ky + s.y, this.ka, U * 0.9, () => { c.fillStyle = shade(0.16 * s.a); c.beginPath(); c.moveTo(50, 0); c.lineTo(12, -30); c.lineTo(-50, 0); c.lineTo(12, 30); c.closePath(); c.fill(); }); }
  drawKite(c, t) {
    // the line sags between the hand and the kite
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.0005; c.beginPath(); c.moveTo(this.x + 0.003, this.y - 0.0028); c.quadraticCurveTo((this.x + this.kx) / 2 + 0.004, (this.y + this.ky) / 2 + 0.012, this.kx, this.ky); c.stroke();
    sprite(c, this.kx, this.ky, this.ka, U, () => {
      // the tail: a ribbon with bows, streaming behind and rippling
      const pts = []; for (let i = 0; i <= 14; i++) pts.push([-50 - i * 7.5, Math.sin(t * 7 - i * 0.7) * (1.5 + i * 0.75)]);
      c.strokeStyle = '#fffaf0'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke();
      [3, 6, 9, 12].forEach((i, n) => { const p = pts[i], q = pts[i - 1], g = Math.atan2(p[1] - q[1], p[0] - q[0]); c.save(); c.translate(p[0], p[1]); c.rotate(g); c.fillStyle = ['#f3c148', '#2fa7a0', '#e2553f', '#f3c148'][n]; c.beginPath(); c.moveTo(0, 0); c.lineTo(-5, -5); c.lineTo(-5, 5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0); c.lineTo(5, -5); c.lineTo(5, 5); c.closePath(); c.fill(); c.restore(); });
      // the sail: four panels, the cloth bellying between the spars
      const panel = (a, b, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(12, 0); c.lineTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2 * 0.9 + 1.2, (a[1] + b[1]) / 2 * 0.9, b[0], b[1]); c.closePath(); c.fill(); };
      const N = [50, 0], L = [12, -30], T = [-50, 0], Rr = [12, 30];
      panel(N, L, '#ee6a55'); panel(L, T, '#f6cf5a'); panel(T, Rr, '#e2553f'); panel(Rr, N, '#f3bd3a');
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(12, 0); c.lineTo(50, 0); c.lineTo(12, -30); c.closePath(); c.fill();
      c.fillStyle = 'rgba(40,20,30,0.14)'; c.beginPath(); c.moveTo(12, 0); c.lineTo(-50, 0); c.lineTo(12, 30); c.closePath(); c.fill();
      c.strokeStyle = '#6b4a2b'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(50, 0); c.lineTo(-50, 0); c.moveTo(12, -30); c.lineTo(12, 30); c.stroke();
      disc(c, 12, 0, 1.8, '#fffaf0');
    });
  }
}
