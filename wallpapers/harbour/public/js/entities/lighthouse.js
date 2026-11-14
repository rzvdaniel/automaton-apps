// The lighthouse, seen from slightly to the south like the houses: a banded tower that narrows towards the lantern.
// At night its lantern is lit and a beam sweeps out to sea (see drawLights). Click it to switch the light on or off.
import { TAU, shade, lerp, disc, oval, rrect, glow, Entity } from '../core/index.js';

const TALL = 0.03, R0 = 0.0098, R1 = 0.0064, SLICES = 36;
const BEAM = 0.45, SWEEP = 0.35;   // how far the beam reaches (world units) and how fast it turns (radians a second)
export class Lighthouse extends Entity {
  static passes = { upright: 'draw', lights: 'drawLights' };
  static clicks = 'one';
  static cullRadius = 0.46;   // its beam reaches that far
  constructor(world, x, y) { super(world); this.x = x; this.y = y; this.off = false; }
  hit(x, y) { return Math.abs(x - this.x) < 0.014 && y > this.y - TALL - 0.014 && y < this.y + 0.013; }
  click() { this.off = !this.off; }
  draw(c) {
    const x = this.x, y = this.y, top = y - TALL;
    // the shadow lies across the rocks, away from the sun
    const foot = this.castShadow(0.0057), tip = this.castShadow(0.0394);   // from the foot of the tower to the shadow of its top
    c.strokeStyle = shade(0.2 * tip.a); c.lineWidth = R0 * 1.7; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + foot.x, y + foot.y); c.lineTo(x + tip.x, y + tip.y); c.stroke();
    // stone plinth
    oval(c, x, y + 0.0022, 0.0145, 0.0118, '#7f8a90'); oval(c, x, y, 0.0145, 0.0118, '#aab3b7'); oval(c, x - 0.001, y - 0.001, 0.0125, 0.0098, '#c4cbce');
    // the tower: stacked rounds, red and white bands, then one wash of light and shade across it
    c.save(); c.beginPath();
    for (let i = 0; i <= SLICES; i++) { const u = i / SLICES; c.moveTo(x + lerp(R0, R1, u), y - TALL * u); c.arc(x, y - TALL * u, lerp(R0, R1, u), 0, TAU); }
    c.clip();
    for (let i = 0; i <= SLICES; i++) { const u = i / SLICES; disc(c, x, y - TALL * u, lerp(R0, R1, u), Math.floor(u * 4.999) % 2 ? '#fbf7ee' : '#d8493b'); }
    const wash = c.createLinearGradient(x - R0, 0, x + R0, 0); wash.addColorStop(0, 'rgba(255,255,255,0.22)'); wash.addColorStop(0.45, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(22,48,70,0.3)');
    c.fillStyle = wash; c.fillRect(x - 0.02, top - 0.02, 0.04, TALL + 0.04);
    c.restore();
    disc(c, x, top, R1, '#f3eee3');
    // a small door at the foot
    c.fillStyle = '#3d5564'; rrect(c, x - 0.0014, y + 0.0048, 0.0028, 0.0042, 0.0012); c.fill();
    // gallery, lantern and roof
    disc(c, x, top + 0.0012, 0.0088, '#2f3b45'); disc(c, x, top, 0.0088, '#4c5a65'); disc(c, x, top - 0.0004, 0.0074, '#69777f');
    const glass = this.off ? '#aebac2' : '#ffe9a3';
    for (let i = 0; i <= 9; i++) disc(c, x, top - 0.0008 - i * 0.0008, 0.0044, i === 9 ? glass : (this.off ? '#93a0a9' : '#f6cf6a'));
    c.strokeStyle = '#3a4650'; c.lineWidth = 0.0005; [-0.0024, 0, 0.0024].forEach(dx => { c.beginPath(); c.moveTo(x + dx, top - 0.0006); c.lineTo(x + dx, top - 0.0078); c.stroke(); });
    disc(c, x, top - 0.0078, 0.0054, '#a8332b');   // the roof: a low cone, a rim and a point
    for (let i = 0; i <= 5; i++) disc(c, x - i * 0.00012, top - 0.0084 - i * 0.0008, 0.005 - i * 0.0008, i < 2 ? '#c93f33' : i < 4 ? '#dc5445' : '#ec7260');
    disc(c, x, top - 0.0132, 0.0007, '#2f3b45');
  }
  /**
   * After dark: the lantern glows and a long beam sweeps slowly round, out over the sea. Off by day (and when clicked off).
   * Drawn in the lights pass, above the night's tint; the beam's gradient is made once and reused.
   */
  drawLights(c, t) {
    const dark = this.darkness;
    if (this.off || dark <= 0) return;
    const y = this.y - TALL - 0.004;
    glow(c, this.x, y, 0.03, dark, '255,226,150');
    glow(c, this.x, y, 0.009, dark);
    if (!this.beam || this.beamFor !== c) {   // made in the beam's own frame, so the same gradient serves every frame
      this.beamFor = c; this.beam = c.createLinearGradient(0, 0, BEAM, 0);
      this.beam.addColorStop(0, 'rgba(255,238,184,0.55)'); this.beam.addColorStop(0.4, 'rgba(255,238,184,0.2)'); this.beam.addColorStop(1, 'rgba(255,238,184,0)');
    }
    c.translate(this.x, y); c.rotate(t * SWEEP);
    c.globalAlpha = dark; c.fillStyle = this.beam;
    c.beginPath(); c.moveTo(0, -0.002); c.lineTo(BEAM, -BEAM * 0.13); c.lineTo(BEAM, BEAM * 0.13); c.lineTo(0, 0.002); c.closePath(); c.fill();
  }
}
