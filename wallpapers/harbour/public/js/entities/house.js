// A house: a pitched roof from above and a strip of painted front wall. Click it to light or put out the fire.
import { shade, Entity } from '../core/index.js';
import { Smoke } from './smoke.js';

export class House extends Entity {
  static clicks = 'one';
  constructor(world, o) {   // o: x, y, a, wall, roof, w, smoke
    super(world); Object.assign(this, o); this.pop = 0;
    this.plume = world.add(new Smoke(world, this.x + this.w * 0.3 * Math.cos(this.a), this.y + this.w * 0.3 * Math.sin(this.a) - 0.0025, o.smoke));
  }
  update(dt) { this.pop = Math.max(0, this.pop - dt * 1.5); }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.02; }
  click() { this.pop = 1; this.plume.on = !this.plume.on; this.world.burst(this.x, this.y, 5, 0.03, '255,255,255', 0.004, 0.7); }
  draw(c) {
    const w = this.w, d = w * 0.68, front = Math.cos(this.a) >= 0 ? 1 : -1, grow = 1 + 0.22 * this.pop * Math.sin(this.pop * 10);
    c.save(); c.translate(this.x + 0.005, this.y + 0.0068); c.rotate(this.a); c.fillStyle = shade(0.26); c.fillRect(-w / 2, -d / 2, w, d + 0.004); c.restore();
    c.save(); c.translate(this.x, this.y); c.rotate(this.a); c.scale(grow, grow);
    c.fillStyle = this.wall; c.fillRect(-w / 2, front > 0 ? d / 2 - 0.001 : -d / 2 - 0.0045, w, 0.0055);   // the painted front, on the side that faces the viewer
    c.fillStyle = 'rgba(40,50,70,0.75)'; [-0.3, 0, 0.3].forEach((k, n) => c.fillRect(k * w - 0.0011, front > 0 ? d / 2 + 0.0012 : -d / 2 - 0.0034, 0.0022, n === 1 ? 0.0032 : 0.0022));
    c.fillStyle = this.roof[0]; c.fillRect(-w / 2, -d / 2, w, d / 2); c.fillStyle = this.roof[1]; c.fillRect(-w / 2, 0, w, d / 2);
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.0011; c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 0.0007; [-0.5, 0.5].forEach(k => { c.beginPath(); c.moveTo(-w / 2, k * d / 2); c.lineTo(w / 2, k * d / 2); c.stroke(); });
    c.fillStyle = '#9b7a66'; c.fillRect(w * 0.27, -0.0028, 0.0052, 0.0056); c.fillStyle = '#4a3a34'; c.fillRect(w * 0.27 + 0.0012, -0.0016, 0.0028, 0.0032);
    c.restore();
  }
}
