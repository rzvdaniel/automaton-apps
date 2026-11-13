// A bloom of moon jellies under the surface: glassy bells with four pale rings, pulsing along with their frills trailing.
// They shy away from a click in the water and from the pointer.
// new JellyBloom(world, { x, y, count })   Place it in shallow or deep water.
import { TAU, disc, sprite, Entity } from '../core/index.js';

const U = 0.00042, TINTS = [['235,246,255', '190,170,235'], ['255,236,246', '240,150,190'], ['236,255,250', '140,205,215']];
export class JellyBloom extends Entity {
  static passes = { deep: 'draw' };
  static clicks = 'many';
  hit(x, y) { return this.jellies.some(j => Math.hypot(j.x - x, j.y - y) < 0.016 * j.size); }
  click(x, y) { this.onScare(x, y, 0.2, true); }
  constructor(world, o) {
    super(world); this.x = o.x; this.y = o.y; this.jellies = [];
    for (let i = 0; i < (o.count || 6); i++) { const g = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.045; this.jellies.push({ x: o.x + Math.cos(g) * d, y: o.y + Math.sin(g) * d * 0.8, hx: Math.cos(g) * d, hy: Math.sin(g) * d * 0.8, a: Math.random() * TAU, ph: Math.random() * TAU, size: 0.6 + Math.random() * 0.7, tint: TINTS[i % 3], vx: 0, vy: 0 }); }
  }
  onScare(x, y, reach, water) { if (water) this.jellies.forEach(j => { const dx = j.x - x, dy = j.y - y, d = Math.hypot(dx, dy) || 0.001; if (d < 0.12) { j.vx += dx / d * 0.05; j.vy += dy / d * 0.05; j.a = Math.atan2(dy, dx); } }); }
  update(dt) {
    const w = this.world, m = w.mouse;
    this.jellies.forEach(j => {
      j.ph += dt * 2.1; const push = Math.max(0, Math.sin(j.ph)) * 0.006;   // each squeeze of the bell moves it on a little
      j.a += Math.sin(w.clock * 0.2 + j.ph * 0.1) * 0.25 * dt;
      let ax = (this.x + j.hx - j.x) * 0.15, ay = (this.y + j.hy - j.y) * 0.15;
      if (m.on) { const dx = j.x - m.x, dy = j.y - m.y, d = Math.hypot(dx, dy) || 0.001; if (d < 0.06) { ax += dx / d * (0.06 - d) * 3; ay += dy / d * (0.06 - d) * 3; } }
      const damp = Math.exp(-dt * 1.2); j.vx = (j.vx + ax * dt) * damp; j.vy = (j.vy + ay * dt) * damp;
      j.x += (j.vx + Math.cos(j.a) * push) * dt; j.y += (j.vy + Math.sin(j.a) * push) * dt;
    });
  }
  draw(c, t) {
    this.jellies.forEach(j => {
      const squeeze = Math.sin(j.ph), R = 20 * (1 - 0.1 * squeeze);
      sprite(c, j.x, j.y, j.a, U * j.size, () => {
        // the frill and the long arms trail behind
        c.lineCap = 'round';
        for (let i = 0; i < 9; i++) { const y0 = (i - 4) * 4.2, len = 26 + (i % 3) * 9 + 6 * squeeze; c.strokeStyle = 'rgba(' + j.tint[0] + ',' + (0.2 + (i % 2) * 0.12) + ')'; c.lineWidth = i % 2 ? 1.6 : 0.8; c.beginPath(); c.moveTo(-R * 0.6, y0); for (let k = 1; k <= 6; k++) c.lineTo(-R * 0.6 - len * k / 6, y0 * (1 - k * 0.07) + Math.sin(t * 2.4 + j.ph + i + k * 0.9) * (0.6 + k * 0.5)); c.stroke(); }
        // the bell: clear in the middle, milky at the rim, a soft glow around it
        const glow = c.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.5); glow.addColorStop(0, 'rgba(' + j.tint[0] + ',0.22)'); glow.addColorStop(1, 'rgba(' + j.tint[0] + ',0)');
        c.fillStyle = glow; c.beginPath(); c.arc(0, 0, R * 1.5, 0, TAU); c.fill();
        const bell = c.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.1, 0, 0, R); bell.addColorStop(0, 'rgba(' + j.tint[0] + ',0.3)'); bell.addColorStop(0.7, 'rgba(' + j.tint[0] + ',0.4)'); bell.addColorStop(0.93, 'rgba(' + j.tint[0] + ',0.78)'); bell.addColorStop(1, 'rgba(' + j.tint[0] + ',0.2)');
        c.fillStyle = bell; c.beginPath(); c.ellipse(0, 0, R * (1 + 0.06 * squeeze), R, 0, 0, TAU); c.fill();
        for (let i = 0; i < 24; i++) { const g = i * TAU / 24; disc(c, Math.cos(g) * R * 0.97, Math.sin(g) * R * 0.97, 1.1, 'rgba(' + j.tint[0] + ',0.5)'); }   // the scalloped rim
        // the four rings at its heart, and fine lines out to the rim
        c.strokeStyle = 'rgba(' + j.tint[0] + ',0.18)'; c.lineWidth = 0.5; for (let i = 0; i < 16; i++) { const g = i * TAU / 16; c.beginPath(); c.moveTo(Math.cos(g) * R * 0.5, Math.sin(g) * R * 0.5); c.lineTo(Math.cos(g) * R * 0.92, Math.sin(g) * R * 0.92); c.stroke(); }
        for (let i = 0; i < 4; i++) { const g = i * TAU / 4 + 0.78; c.strokeStyle = 'rgba(' + j.tint[1] + ',0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(Math.cos(g) * R * 0.3, Math.sin(g) * R * 0.3, R * 0.19, g + 0.9, g + TAU - 0.9); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.ellipse(-R * 0.35, -R * 0.4, R * 0.3, R * 0.14, -0.7, 0, TAU); c.fill();
      });
    });
  }
}
