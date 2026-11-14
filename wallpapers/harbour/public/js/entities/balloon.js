// A red hot-air balloon drifting over the island on the wind, its shadow sliding across the ground below.
// Click it: the burner roars and it climbs for a while (it grows, and its shadow moves further away).
// new Balloon(world, { x, y })
import { TAU, shade, disc, oval, rrect, sprite, glow, Entity, AIRBORNE } from '../core/index.js';

const U = 0.00072, R = 50, GORES = 14, CROWN = [-3, -9];
export class Balloon extends Entity {
  static passes = { skyShadow: 'drawShadow', clouds: 'draw', skyLights: 'drawLights' };
  static clicks = 'top';
  static presence = { day: 1, night: 0.3 };   // some nights it drifts over, glowing from its burner (see engine/presence.js)
  constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.seed = Math.random() * 9; this.burn = 0; this.climb = 0; }
  get high() { return 1 + 0.04 * Math.sin(this.world.clock * 0.35 + this.seed) + 0.28 * this.climb; }   // 1 = cruising height
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < R * U * this.high; }
  click() { this.burn = 1.6; }
  update(dt) {
    const w = this.world, m = 0.08;
    this.burn = Math.max(0, this.burn - dt); this.climb += ((this.burn > 0 ? 1 : 0) - this.climb) * Math.min(1, dt * (this.burn > 0 ? 1.2 : 0.35));
    if (this.burn === 0 && Math.sin(w.clock * 0.21 + this.seed * 3) > 0.985) this.burn = 0.5;   // a short burst now and then keeps it up
    const v = 0.007 * (0.6 + 0.4 * (w.windPush ?? 1));
    this.x += w.wind[0] * v * dt; this.y += w.wind[1] * v * dt;
    if (this.x > w.hw + m) this.x = -w.hw - m; if (this.x < -w.hw - m) this.x = w.hw + m; if (this.y > w.hh + m) this.y = -w.hh - m; if (this.y < -w.hh - m) this.y = w.hh + m;
  }
  /** How much the burner is roaring now (0: idle, about 1: full flame after a click or a burst). */
  get flame() { return this.burn > 0 ? 0.75 + 0.25 * Math.sin(this.world.clock * 40) : 0; }
  /**
   * After dark the burner lights the envelope from inside: a warm glow over the basket, much brighter while it roars.
   * It grows with the darkness, so by day nothing is drawn.
   */
  drawLights(c) {
    const a = this.darkness * this.visible;
    if (a <= 0.004) return;
    const k = U * this.high, f = this.flame;
    glow(c, this.x, this.y + 30 * k, R * k * (1.1 + 0.5 * f), a * (0.35 + 0.55 * f), '255,170,80');
  }
  drawShadow(c) { const s = this.castShadow(0.095 * this.high, 0, AIRBORNE); oval(c, this.x + s.x, this.y + s.y, R * U * 0.95, R * U * 0.86, shade((0.2 - 0.07 * this.climb) * s.a)); }
  draw(c, t) {
    sprite(c, this.x, this.y, 0.03 * Math.sin(t * 0.5 + this.seed), U * this.high, () => {
      const flame = this.burn > 0 ? 0.75 + 0.25 * Math.sin(t * 40) : 0;
      // the basket hangs below, seen past the edge of the envelope
      c.strokeStyle = '#5a4632'; c.lineWidth = 0.8; [[-9, -12], [9, 12]].forEach(k => { c.beginPath(); c.moveTo(k[0] < 0 ? -8 : 8, 62); c.lineTo(k[1], 44); c.stroke(); });
      if (flame) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(0, 52, 0, 0, 52, 22); g.addColorStop(0, 'rgba(255,190,90,' + (0.9 * flame) + ')'); g.addColorStop(1, 'rgba(255,150,60,0)'); c.fillStyle = g; c.fillRect(-22, 30, 44, 44); c.restore(); }
      c.fillStyle = '#7a5a36'; rrect(c, -9, 60, 18, 13, 2.5); c.fill(); c.fillStyle = '#a27c4b'; rrect(c, -9, 58, 18, 12, 2.5); c.fill();
      c.strokeStyle = 'rgba(70,48,24,0.45)'; c.lineWidth = 0.6; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-9, 58 + i * 3); c.lineTo(9, 58 + i * 3); c.stroke(); c.beginPath(); c.moveTo(-9 + i * 4.5, 58); c.lineTo(-9 + i * 4.5, 70); c.stroke(); }
      c.fillStyle = '#5c4326'; rrect(c, -9.5, 57, 19, 2.4, 1.2); c.fill();
      disc(c, -3.5, 57.5, 2.6, '#f1d6b8'); disc(c, -3.5, 56.6, 2.7, '#3f6fb5'); disc(c, 3.5, 58, 2.5, '#e8c9a6'); disc(c, 3.5, 57.2, 2.6, '#f3c148');
      // the envelope from above: gores running from the crown to the rim, two reds and a cream band
      c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
      for (let i = 0; i < GORES; i++) { const a0 = i * TAU / GORES - 0.2, a1 = (i + 1) * TAU / GORES - 0.2; c.fillStyle = i % 2 ? '#c2281f' : '#e2473a'; c.beginPath(); c.moveTo(CROWN[0], CROWN[1]); c.lineTo(Math.cos(a0) * R * 1.3, Math.sin(a0) * R * 1.3); c.lineTo(Math.cos(a1) * R * 1.3, Math.sin(a1) * R * 1.3); c.closePath(); c.fill(); }
      // the band follows the curve of the balloon, so it is a ring around the crown, and zigzags gore by gore
      c.fillStyle = '#fbf1d6'; c.beginPath();
      for (let i = 0; i <= GORES * 2; i++) { const g = i * Math.PI / GORES - 0.2, rr = R * (i % 2 ? 0.7 : 0.6); c[i ? 'lineTo' : 'moveTo'](CROWN[0] * 0.5 + Math.cos(g) * rr, CROWN[1] * 0.5 + Math.sin(g) * rr); }
      for (let i = GORES * 2; i >= 0; i--) { const g = i * Math.PI / GORES - 0.2, rr = R * (i % 2 ? 0.56 : 0.46); c.lineTo(CROWN[0] * 0.6 + Math.cos(g) * rr, CROWN[1] * 0.6 + Math.sin(g) * rr); }
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90,10,6,0.28)'; c.lineWidth = 0.7; for (let i = 0; i < GORES; i++) { const g = i * TAU / GORES - 0.2; c.beginPath(); c.moveTo(CROWN[0], CROWN[1]); c.lineTo(Math.cos(g) * R * 1.3, Math.sin(g) * R * 1.3); c.stroke(); }
      // round it: light on the upper left, shade round the lower right, a darker rim
      const lit = c.createRadialGradient(-17, -22, 2, -10, -14, R * 0.95); lit.addColorStop(0, 'rgba(255,255,255,0.5)'); lit.addColorStop(0.5, 'rgba(255,255,255,0.08)'); lit.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lit; c.fillRect(-R, -R, R * 2, R * 2);
      const dim = c.createRadialGradient(-10, -14, R * 0.55, 0, 0, R * 1.02); dim.addColorStop(0, 'rgba(60,8,20,0)'); dim.addColorStop(1, 'rgba(60,8,20,0.5)');
      c.fillStyle = dim; c.fillRect(-R, -R, R * 2, R * 2);
      c.restore();
      disc(c, CROWN[0], CROWN[1], 4.2, '#a31f18'); disc(c, CROWN[0] - 0.6, CROWN[1] - 0.8, 2.6, '#f6e7c6');
    });
  }
}
