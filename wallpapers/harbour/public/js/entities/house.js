// A house: a pitched roof from above and a strip of painted front wall. Click it to light or put out the fire.
import { shade, glow, halo, switchOn, Entity } from '../core/index.js';
import { Smoke } from './smoke.js';

const WINDOW_STEP = 0.06;      // how much more darkness each next window of a house waits before it comes on
const HALO = 0.32, SPILL = 0.22;   // how bright the warm haze round a fully lit house is, and the light on the ground in front

export class House extends Entity {
  static passes = { upright: 'draw', lights: 'drawLights' };
  static clicks = 'one';
  constructor(world, o) {   // o: x, y, a, wall, roof, w, smoke
    super(world); Object.assign(this, o); this.pop = 0;
    // at night its windows light up, one house after another; about one in four stays dark
    this.lightsAt = Math.random() < 0.25 ? 2 : 0.15 + Math.random() * 0.45;
    this.windows = this.windowSpots().map(([lx, ly]) => [this.x + Math.cos(this.a) * lx - Math.sin(this.a) * ly, this.y + Math.sin(this.a) * lx + Math.cos(this.a) * ly]);
    this.spillY = this.y + (Math.cos(this.a) >= 0 ? 1 : -1) * this.w * 0.75;   // where its light falls on the ground, in front
    this.plume = world.add(new Smoke(world, this.x + this.w * 0.3 * Math.cos(this.a), this.y + this.w * 0.3 * Math.sin(this.a) - 0.0025, o.smoke));
  }
  /** Where its windows are, in its own turned frame (x along the house, y across it). */
  windowSpots() {
    const d = this.w * 0.68, y = Math.cos(this.a) >= 0 ? d / 2 + 0.0026 : -d / 2 - 0.0022;
    return [-0.3, 0, 0.3].map(k => [k * this.w, y]);
  }
  /** How bright window `n` is now (0..1): the windows of a lit house come on one after another, a little apart. */
  windowLight(n) { return switchOn(this.lightsAt + n * WINDOW_STEP, this.darkness); }
  /**
   * Warm light after dark: each lit window, and round the house a soft warm halo with a little light spilling on the ground
   * in front. The halo is as bright as its windows together, so a house with all its windows on glows most.
   */
  drawLights(c) {
    if (switchOn(this.lightsAt, this.darkness) <= 0) return;
    let lit = 0;
    for (let n = 0; n < this.windows.length; n++) { const a = this.windowLight(n), w = this.windows[n]; lit += a; glow(c, w[0], w[1], 0.006, a * 0.85); }
    const share = lit / this.windows.length;
    halo(c, this.x, this.y, this.w * 1.8, share * HALO);
    halo(c, this.x, this.spillY, this.w * 1.3, share * SPILL, undefined, 0.5);
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
