// The church behind the town. Click it and the bell rings three times and the gulls leave the tower.
import { TAU, shade, disc, Entity } from '../core/index.js';
import { Gull } from './gulls.js';

export class Church extends Entity {
  static clicks = 'one';
  constructor(world, o) { super(world); Object.assign(this, o); this.pop = 0; }   // o: x, y, a
  update(dt) { this.pop = Math.max(0, this.pop - dt * 1.5); }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.03; }
  click() {
    const w = this.world; this.pop = 1;
    for (let i = 0; i < 3; i++) w.ring(this.x, this.y, i * 0.45);
    for (let i = 0; i < 3 && w.count(Gull) < 12; i++) { const b = w.add(new Gull(w, this.x, this.y, Math.random() * TAU)); b.rush = 1.5; }
  }
  draw(c) {
    const grow = 1 + 0.15 * this.pop * Math.sin(this.pop * 10);
    const s = this.castShadow(0.015); c.save(); c.translate(this.x + s.x, this.y + s.y); c.rotate(this.a); c.fillStyle = shade(0.26 * s.a); c.fillRect(-0.03, -0.011, 0.056, 0.022); c.fillRect(-0.04, -0.016, 0.03, 0.03); c.restore();
    c.save(); c.translate(this.x, this.y); c.rotate(this.a); c.scale(grow, grow);
    c.fillStyle = '#e9e4d8'; c.fillRect(-0.03, -0.012, 0.058, 0.026);
    c.fillStyle = '#6b7a88'; c.fillRect(-0.03, -0.012, 0.058, 0.011); c.fillStyle = '#54626f'; c.fillRect(-0.03, -0.001, 0.058, 0.011);
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.0011; c.beginPath(); c.moveTo(-0.03, -0.001); c.lineTo(0.028, -0.001); c.stroke();
    c.fillStyle = '#ded8ca'; c.fillRect(-0.046, -0.011, 0.02, 0.02);
    const cols = ['#7d8c99', '#5e6d7a', '#4c5a66', '#6b7a88'], pts = [[-0.045, -0.01], [-0.027, -0.01], [-0.027, 0.008], [-0.045, 0.008]];
    for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.beginPath(); c.moveTo(-0.036, -0.001); c.lineTo(pts[i][0], pts[i][1]); c.lineTo(pts[(i + 1) % 4][0], pts[(i + 1) % 4][1]); c.fill(); }
    disc(c, -0.036, -0.001, 0.0014, '#f3c148');
    c.restore();
  }
}
