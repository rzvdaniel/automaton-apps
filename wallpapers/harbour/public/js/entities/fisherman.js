// A fisherman in a yellow oilskin, sitting on a rock at the water's edge with his float out in the shallows.
// Now and then he lands a fish; click him (or his float) and he strikes at once. Sometimes it's an old boot.
import { TAU, shade, lerp, disc, oval, Entity } from '../core/index.js';

export class Fisherman extends Entity {
  static clicks = 'one';
  static ownScale = true;   // drawn in his own unscaled frame; effects are mapped back into the world
  constructor(world, o) {   // o: x, y (where he sits), dx, dy (the way out to sea)
    super(world); Object.assign(this, o);
    this.fx = this.x + this.dx * 0.046; this.fy = this.y + this.dy * 0.046;          // the float
    this.bx = this.x - this.dy * 0.0075 - this.dx * 0.002; this.by = this.y + this.dx * 0.0075 - this.dy * 0.002 - 0.003;   // the bucket
    this.strike = 0; this.boot = false; this.next = 12 + Math.random() * 30; this.seed = Math.random() * 9;
  }
  // a point in his own frame -> the world (and back), at the current scale
  toWorld(px, py) { return [this.x + (px - this.x) * this.scale, this.y + (py - this.y) * this.scale]; }
  hit(x, y) { const s = this.scale; x = this.x + (x - this.x) / s; y = this.y + (y - this.y) / s; return Math.hypot(this.x - x, this.y - 0.004 - y) < 0.014 || Math.hypot(this.fx - x, this.fy - y) < 0.011; }
  click() { if (!this.strike) this.land(); }
  land() { const w = this.world; this.strike = 0.001; this.boot = Math.random() < 0.2; const f = this.toWorld(this.fx, this.fy); w.ripple(f[0], f[1], 0.7); w.burst(f[0], f[1], 9, 0.05, '255,255,255', 0.0028, 0.7); }
  update(dt) {
    if (this.strike) { this.strike += dt; if (this.strike > 2.4) { this.strike = 0; this.next = 25 + Math.random() * 40; } return; }
    this.next -= dt; if (this.next <= 0) this.land();
  }
  draw(c, t) { const s = this.scale; c.save(); c.translate(this.x, this.y); c.scale(s, s); c.translate(-this.x, -this.y); this.paint(c, t); c.restore(); }
  paint(c, t) {
    const x = this.x, y = this.y - 0.0046, s = this.strike, lift = s ? Math.sin(Math.min(1, s / 0.5) * Math.PI / 2) * (s > 1.6 ? Math.max(0, 1 - (s - 1.6) / 0.6) : 1) : 0;
    // bucket, legs, body, sou'wester
    oval(c, this.bx + 0.001, this.by + 0.0018, 0.002, 0.0015, shade(0.22)); disc(c, this.bx, this.by + 0.0006, 0.0019, '#2f5b9a'); disc(c, this.bx, this.by, 0.0019, '#4a7fc4'); disc(c, this.bx, this.by, 0.0012, '#243f66');
    oval(c, x + 0.0016, y + 0.0026, 0.0032, 0.0034, shade(0.24));
    [-1, 1].forEach(k => disc(c, x + this.dx * 0.0032 - this.dy * 0.0013 * k, y + this.dy * 0.0032 + this.dx * 0.0013 * k + 0.0012, 0.0011, '#2b3a4a'));
    oval(c, x, y + 0.0006, 0.003, 0.0036, '#d9a52b'); oval(c, x - 0.0003, y, 0.0028, 0.0033, '#f3c148');
    disc(c, x, y - 0.0032, 0.0019, '#f1d6b8'); disc(c, x, y - 0.0038, 0.0025, '#b8322a'); disc(c, x - 0.0002, y - 0.0041, 0.0016, '#e0614f');   // a red sou'wester
    // rod and line
    const tipx = x + this.dx * 0.021, tipy = y + this.dy * 0.021 - 0.008 - lift * 0.007;
    c.strokeStyle = '#5a4632'; c.lineWidth = 0.001; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + this.dx * 0.002, y - 0.001); c.quadraticCurveTo(x + this.dx * 0.012, y + this.dy * 0.012 - 0.007 - lift * 0.006, tipx, tipy); c.stroke();
    // the catch flies from the water to the bucket
    let fx = this.fx, fy = this.fy + Math.sin(t * 2 + this.seed) * 0.0007, floatOn = true;
    if (s > 0.25 && s <= 1.25) {
      const u = (s - 0.25), k = u * u * (3 - 2 * u); fx = lerp(this.fx, this.bx, k); fy = lerp(this.fy, this.by, k) - Math.sin(k * Math.PI) * 0.026; floatOn = false;
      c.save(); c.translate(fx, fy); c.rotate(t * 9);
      if (this.boot) { c.fillStyle = '#6b4a32'; c.fillRect(-0.0012, -0.002, 0.0018, 0.0034); c.fillRect(-0.0012, 0.0006, 0.0034, 0.0014); }
      else { oval(c, 0, 0, 0.003, 0.0012, '#e8f0f4'); c.fillStyle = '#c3d2db'; c.beginPath(); c.moveTo(-0.0026, 0); c.lineTo(-0.0042, -0.0013); c.lineTo(-0.0042, 0.0013); c.closePath(); c.fill(); }
      c.restore();
    } else if (s > 1.25) { const u = Math.min(1, (s - 1.25) / 0.9), k = u * u * (3 - 2 * u); fx = lerp(this.bx, this.fx, k); fy = lerp(this.by, this.fy, k) - Math.sin(k * Math.PI) * 0.03; }   // casting out again
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.00055; c.beginPath(); c.moveTo(tipx, tipy); c.quadraticCurveTo((tipx + fx) / 2, (tipy + fy) / 2 + (s ? 0.001 : 0.006), fx, fy); c.stroke();
    if (floatOn) {
      if (!s) for (let i = 0; i < 2; i++) { const p = (t * 0.3 + this.seed + i * 0.5) % 1; c.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - p)) + ')'; c.lineWidth = 0.0007; c.beginPath(); c.ellipse(this.fx, this.fy + 0.0006, 0.002 + p * 0.008, 0.0015 + p * 0.0055, 0, 0, TAU); c.stroke(); }
      disc(c, fx, fy, 0.0014, '#e2553f'); disc(c, fx, fy - 0.0006, 0.0008, '#ffffff');
    }
  }
}
