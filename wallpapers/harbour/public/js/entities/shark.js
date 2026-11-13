// A shark seen as a shadow under the water, swimming with its whole body. Mostly it cruises. Now and then it goes for a school
// of fish, which scatters. Click it and it dives for a while.
import { TAU, lerp, angDiff, Entity } from '../core/index.js';
import { FishSchool } from './fish.js';

const L = 0.07, N = 16, WIDTH = [[0, 0.05], [0.07, 0.6], [0.22, 1], [0.45, 0.86], [0.7, 0.42], [0.9, 0.16], [1, 0.08]];
const widthAt = u => { for (let i = 1; i < WIDTH.length; i++) if (u <= WIDTH[i][0]) return lerp(WIDTH[i - 1][1], WIDTH[i][1], (u - WIDTH[i - 1][0]) / (WIDTH[i][0] - WIDTH[i - 1][0])); return 0.08; };
// The tail, in its own units with +x pointing away from the body: a narrow stalk that opens into two swept lobes, the upper one longer,
// with a concave edge between them. One painting unit is TAIL_U in world units.
const TAIL = new Path2D('M-4,-2.4 C3,-8 12,-22 34,-40 C30,-28 24,-14 17,-3 C16,-1 16,1 17,3 C21,10 24,20 26,30 C14,22 4,10 -4,2.4 Z'), TAIL_U = 0.00026;
export class Shark extends Entity {
  static passes = { deep: 'drawBody' };
  static clicks = 'many';
  static sound = 'thump';
  constructor(world, G, size) { super(world); this.size = size || 1;   // 1 is the usual shark; the island adds a smaller and a bigger one
     this.ph = G() * 9; this.swim = 0; this.alpha = 0; this.dive = false; this.away = 0; this.hunt = null; this.mood = 10 + G() * 14; this.x = this.y = this.a = 0; this.surface(); }
  // Come up somewhere in deep water.
  surface() {
    const w = this.world;
    for (let k = 0; k < 40; k++) { const x = (Math.random() - 0.5) * 2 * (w.hw - 0.1), y = (Math.random() - 0.5) * 2 * (w.hh - 0.1); if (w.field(x, y) > 0.2) { this.x = x; this.y = y; this.a = Math.random() * TAU; this.dive = false; return; } }
    this.away = 5;
  }
  hit(x, y) { return !this.away && !this.dive && Math.hypot(this.x - x, this.y - y) < 0.045 * this.size; }
  click() { const w = this.world; this.dive = true; this.hunt = null; w.ripple(this.x, this.y, 0.9); w.burst(this.x, this.y, 16, 0.1, '255,255,255', 0.004, 1); w.sound.play('plop'); }
  update(dt) {
    const w = this.world;
    if (this.away > 0) { this.away -= dt; if (this.away <= 0) { this.away = 0; this.surface(); } return; }
    this.alpha += ((this.dive ? 0 : 1) - this.alpha) * Math.min(1, dt * 1.6);
    if (this.dive && this.alpha < 0.03) { this.away = 14 + Math.random() * 22; this.mood = 10 + Math.random() * 15; return; }
    const g = w.grad(this.x, this.y); let turn = Math.sin(w.clock * 0.17 + this.ph) * 0.22;
    if (this.hunt) {
      const s = this.hunt, d = Math.hypot(s.x - this.x, s.y - this.y); this.chase -= dt;
      turn = angDiff(Math.atan2(s.y - this.y, s.x - this.x), this.a) * 1.7;
      if (d < 0.075 * this.size) { s.flee(this.x, this.y, 0.22 * this.size, 0.6); w.ripple(this.x, this.y, 0.45); this.hunt = null; this.mood = 22 + Math.random() * 30; }
      else if (this.chase <= 0 || g.d < 0.1) { this.hunt = null; this.mood = 15 + Math.random() * 20; }
    } else {
      this.mood -= dt;
      if (this.mood <= 0) { let best = null, bd = 0.7; w.all(FishSchool).forEach(s => { const d = Math.hypot(s.x - this.x, s.y - this.y); if (d < bd) { bd = d; best = s; } }); this.hunt = best; this.chase = 14; this.mood = 12; }
    }
    if (g.d < 0.15) turn = angDiff(Math.atan2(g.gy, g.gx), this.a) * 2.2;
    else if (Math.abs(this.x) > w.hw - 0.08 || Math.abs(this.y) > w.hh - 0.08) turn = angDiff(Math.atan2(-this.y, -this.x), this.a) * 1.8;
    this.a += turn * dt; this.turn = turn;
    // the big one is a little slower
    const v = 0.02 * Math.pow(this.size, -0.3) * (this.hunt ? 2.1 : 1); this.x += Math.cos(this.a) * v * dt; this.y += Math.sin(this.a) * v * dt;
    this.swim += dt * (this.hunt ? 7.5 : 3.6);
  }
  // The spine bends in a wave that grows towards the tail.
  spine(i) { const u = i / N; return [L * (0.5 - u), 0.0042 * Math.pow(u, 1.5) * Math.sin(this.swim - u * 3.4) + (this.turn || 0) * 0.006 * u * u]; }
  drawBody(c) {
    if (this.away || this.alpha < 0.02) return;
    const col = 'rgba(14,44,66,' + (0.4 * this.alpha) + ')', Wd = 0.0078, left = [], right = [];
    c.save(); c.translate(this.x, this.y); c.rotate(this.a); c.scale(this.size, this.size); c.fillStyle = col;
    for (let i = 0; i <= N; i++) { const p = this.spine(i), q = this.spine(Math.min(N, i + 1)), o = this.spine(Math.max(0, i - 1)), tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1, hw = Wd * widthAt(i / N); left.push([p[0] - ty / tl * hw, p[1] + tx / tl * hw]); right.push([p[0] + ty / tl * hw, p[1] - tx / tl * hw]); }
    c.beginPath(); left.forEach((p, n) => c[n ? 'lineTo' : 'moveTo'](p[0], p[1])); right.reverse().forEach(p => c.lineTo(p[0], p[1])); c.closePath(); c.fill();
    // pectoral fins, swept back
    const sh = this.spine(5);
    [-1, 1].forEach(s => { c.beginPath(); c.moveTo(sh[0] + 0.004, sh[1] + s * Wd * 0.8); c.quadraticCurveTo(sh[0] - 0.004, sh[1] + s * Wd * 2.3, sh[0] - 0.015, sh[1] + s * Wd * 2.7); c.quadraticCurveTo(sh[0] - 0.009, sh[1] + s * Wd * 1.5, sh[0] - 0.008, sh[1] + s * Wd * 0.7); c.closePath(); c.fill(); });
    // the tail grows out of the end of the spine, facing away from the body, and swings a little further than the body does
    const e = this.spine(N), b = this.spine(N - 3);
    c.translate(e[0], e[1]); c.rotate(Math.atan2(e[1] - b[1], e[0] - b[0]) + 0.3 * Math.sin(this.swim - 3.7)); c.scale(TAIL_U, TAIL_U); c.fill(TAIL);
    c.restore();
  }
}
