// A school of fish: the school wanders, each fish circles inside it, and all of them bolt from a fright or the pointer.
import { shade, angDiff, Entity } from '../core/index.js';

export class FishSchool extends Entity {
  static passes = { deep: 'draw' };
  static clicks = 'many';
  static sound = 'plop';
  hit(x, y) { return this.fish.some(f => Math.hypot(f.x - x, f.y - y) < 0.02); }
  click(x, y) { this.flee(x, y, 0.15, 0.5); }
  constructor(world, o) { super(world); Object.assign(this, o); this.rush = 0; }   // o: x, y, a, ph, bright, fish[]
  // Every fish within `range` of (x, y) darts away from it.
  flee(x, y, range, power) {
    let near = false;
    this.fish.forEach(f => { const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 0.001; if (d < range) { const k = power * (1 - d / range); f.vx += dx / d * k; f.vy += dy / d * k; near = true; } });
    if (near) { this.a = Math.atan2(this.y - y, this.x - x); this.rush = 2.2; }
    return near;
  }
  onScare(x, y, reach, water) { if (water) this.flee(x, y, 0.32, 0.55); }
  update(dt) {
    const w = this.world, t = w.clock, m = w.mouse; this.rush = Math.max(0, this.rush - dt);
    const g = w.grad(this.x, this.y); let turn = Math.sin(t * 0.2 + this.ph) * 0.3;
    if (g.d < 0.14) turn = angDiff(Math.atan2(g.gy, g.gx), this.a) * 2.5; else if (Math.abs(this.x) > w.hw - 0.1 || Math.abs(this.y) > w.hh - 0.1) turn = angDiff(Math.atan2(-this.y, -this.x), this.a) * 2;
    this.a += turn * dt;
    const speed = 0.018 * (1 + 4 * Math.min(1, this.rush)); this.x += Math.cos(this.a) * speed * dt; this.y += Math.sin(this.a) * speed * dt;
    this.fish.forEach(f => {
      let ax = (this.x + Math.cos(t * 0.5 + f.ph) * f.rad - f.x) * 3, ay = (this.y + Math.sin(t * 0.4 + f.ph * 1.7) * f.rad - f.y) * 3;
      if (m.on) { const dx = f.x - m.x, dy = f.y - m.y, d = Math.hypot(dx, dy) || 0.001; if (d < 0.11) { const k = (0.11 - d) * 28; ax += dx / d * k; ay += dy / d * k; } }
      const gf = w.grad(f.x, f.y); if (gf.d < 0.03) { ax += gf.gx * 1.2; ay += gf.gy * 1.2; }
      const damp = Math.exp(-dt * 2.4); f.vx = (f.vx + ax * dt) * damp; f.vy = (f.vy + ay * dt) * damp; f.x += f.vx * dt; f.y += f.vy * dt;
    });
  }
  draw(c, t) {
    this.fish.forEach(f => {
      const sz = 0.0062 * f.sz, v = Math.hypot(f.vx, f.vy), a = Math.atan2(f.vy + Math.sin(this.a) * 0.03, f.vx + Math.cos(this.a) * 0.03);
      const beat = Math.sin(t * (7 + v * 130) + f.ph), glint = Math.sin(t * 1.7 + f.ph * 7) > 0.965;
      c.save(); c.translate(f.x, f.y); c.rotate(a + beat * 0.08);
      c.fillStyle = glint ? 'rgba(255,255,255,0.6)' : this.bright ? 'rgba(255,142,84,0.9)' : shade(0.42);
      c.beginPath(); c.moveTo(sz, 0); c.quadraticCurveTo(sz * 0.35, -sz * 0.36, -sz * 0.55, -sz * 0.07 + beat * sz * 0.1); c.lineTo(-sz * 0.55, sz * 0.07 + beat * sz * 0.1); c.quadraticCurveTo(sz * 0.35, sz * 0.36, sz, 0); c.fill();
      c.translate(-sz * 0.5, beat * sz * 0.1); c.rotate(-beat * 0.5);
      c.beginPath(); c.moveTo(sz * 0.05, 0); c.lineTo(-sz * 0.62, -sz * 0.34); c.lineTo(-sz * 0.42, 0); c.lineTo(-sz * 0.62, sz * 0.34); c.closePath(); c.fill();
      c.restore();
    });
  }
}
