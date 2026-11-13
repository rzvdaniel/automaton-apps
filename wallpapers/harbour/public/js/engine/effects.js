import { TAU } from '../core/math.js';
import { disc } from '../core/draw.js';

/** Short-lived things that are not entities: ripples on the water, spray and dust, and the church bell's rings. */
export class Effects {
  static MAX_RIPPLES = 8;   // the shader can show this many at once

  constructor() { this.ripples = []; this.particles = []; this.rings = []; }
  clear() { this.ripples.length = this.particles.length = this.rings.length = 0; }

  ripple(x, y, strength) {
    this.ripples.push({ x, y, t: 0, k: strength });
    if (this.ripples.length > Effects.MAX_RIPPLES) this.ripples.shift();
  }
  /** A puff of `n` small dots flying out from (x, y). `color` is "r,g,b". */
  burst(x, y, n, speed, color, size, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, r: size * (0.6 + Math.random() * 0.8), col: color });
    }
  }
  /** A ring that spreads from (x, y), starting after `delay` seconds. */
  ring(x, y, delay) { this.rings.push({ x, y, t: -delay }); }

  update(dt) {
    const { ripples, rings, particles } = this;
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 2.8) ripples.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 1.6) rings.splice(i, 1); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.exp(-dt * 3); p.vx *= drag; p.vy *= drag;
    }
  }

  /** Draws the rings and the spray. (The ripples are painted by the shader.) */
  draw(c) {
    this.rings.forEach(r => {
      if (r.t < 0) return;
      c.strokeStyle = `rgba(255,246,200,${0.7 * (1 - r.t / 1.6)})`; c.lineWidth = 0.0022;
      c.beginPath(); c.arc(r.x, r.y, 0.012 + r.t * 0.075, 0, TAU); c.stroke();
    });
    this.particles.forEach(p => disc(c, p.x, p.y, p.r, `rgba(${p.col},${0.85 * p.life / p.max})`));
  }
}
