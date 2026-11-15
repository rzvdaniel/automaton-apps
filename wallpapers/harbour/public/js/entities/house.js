// A house: a pitched roof from above and a strip of painted front wall. Click it to light or put out the fire.
import { shade, Entity } from '../core/index.js';
import { WindowLights } from '../engine/window-lights.js';
import { Smoke } from './smoke.js';

const PANE = 'rgb(255, 222, 140)';   // a lit window: a flat warm pane, lighter than the wall, no halo
const DUSK = 0.3;                    // the darkness at which the lit windows are fully on: none by day, however late the clock

export class House extends Entity {
  static passes = { upright: 'draw', lights: 'drawLights' };
  static clicks = 'one';
  constructor(world, o) {   // o: x, y, a, wall, roof, w, smoke
    super(world); Object.assign(this, o); this.pop = 0;
    // at night its windows light up one by one, each on its own times of the evening (see WindowLights)
    this.windows = this.windowSpots().map(([lx, ly]) => [this.x + Math.cos(this.a) * lx - Math.sin(this.a) * ly, this.y + Math.sin(this.a) * lx + Math.cos(this.a) * ly]);
    this.lights = this.windows.map((p, n) => (world.windowLights ??= new WindowLights()).add(p[0], p[1], n));
    this.plume = world.add(new Smoke(world, this.x + this.w * 0.3 * Math.cos(this.a), this.y + this.w * 0.3 * Math.sin(this.a) - 0.0025, o.smoke));
  }
  /** Where its windows are, in its own turned frame (x along the house, y across it). */
  windowSpots() {
    const d = this.w * 0.68, y = Math.cos(this.a) >= 0 ? d / 2 + 0.0026 : -d / 2 - 0.0022;
    return [-0.3, 0, 0.3].map(k => [k * this.w, y]);
  }
  /** The size of a lit pane, along the house and across it. */
  paneSize() { return [0.0026, 0.0026]; }
  /** How bright window `n` is now (0..1): its own times by the clock, and only once it is dusk. */
  windowLight(n) {
    const clock = this.world?.skyClock, hour = clock ? clock.minutes() / 60 : 0;
    return this.world.windowLights.level(this.lights[n], hour) * Math.min(1, this.darkness / DUSK);
  }
  /** Each lit window as a flat warm pane (no halo, no glow on the ground), with a faint soft edge about 1 px wide. */
  drawLights(c) {
    if (this.darkness <= 0) return;
    const [pw, ph] = this.paneSize();
    for (let n = 0; n < this.windows.length; n++) {
      const a = this.windowLight(n), p = this.windows[n];
      if (a <= 0.01) continue;
      c.save(); c.globalCompositeOperation = 'source-over'; c.translate(p[0], p[1]); c.rotate(this.a); c.globalAlpha = a;
      c.fillStyle = PANE; c.strokeStyle = PANE; c.lineWidth = 0.0004;
      c.fillRect(-pw / 2, -ph / 2, pw, ph);
      c.globalAlpha = a * 0.35; c.strokeRect(-pw / 2 - 0.0002, -ph / 2 - 0.0002, pw + 0.0004, ph + 0.0004);
      c.restore();
    }
  }
  update(dt) { this.pop = Math.max(0, this.pop - dt * 1.5); }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.02; }
  click() { this.pop = 1; this.plume.on = !this.plume.on; this.world.burst(this.x, this.y, 5, 0.03, '255,255,255', 0.004, 0.7); }
  draw(c) {
    const w = this.w, d = w * 0.68, front = Math.cos(this.a) >= 0 ? 1 : -1, grow = 1 + 0.22 * this.pop * Math.sin(this.pop * 10);
    const s = this.castShadow(0.0084); c.save(); c.translate(this.x + s.x, this.y + s.y); c.rotate(this.a); c.fillStyle = shade(0.26 * s.a); c.fillRect(-w / 2, -d / 2, w, d + 0.004); c.restore();
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
