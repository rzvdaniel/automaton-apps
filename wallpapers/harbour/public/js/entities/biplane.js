// A vintage biplane on a lazy tour of the island: yellow wings, a red body, an open cockpit and a pilot whose scarf streams behind.
// It banks into its turns. Click it for a barrel roll and a puff of smoke.
// new Biplane(world, { x, y, a })
import { TAU, shade, clamp, angDiff, disc, oval, rrect, sprite, fillPath, glow, Entity, AIRBORNE } from '../core/index.js';

const U = 0.0007;
const NAV_RED = '255,60,50', NAV_GREEN = '70,255,120', NAV_WHITE = '235,245,255';   // navigation light colours, as 'r,g,b'
const STROBE = 1.1;   // strobe flashes a second
const BODY = new Path2D('M32,0 C32,-6 28,-7.6 22,-7.6 L4,-7 C-14,-6 -30,-3.4 -45,-1.4 L-45,1.4 C-30,3.4 -14,6 4,7 L22,7.6 C28,7.6 32,6 32,0 Z');
const TAIL = new Path2D('M-33,-2 C-31,-10 -34,-17 -40,-18 C-45,-18 -47,-12 -46,0 C-47,12 -45,18 -40,18 C-34,17 -31,10 -33,2 Z');
const upper = c => { rrect(c, -1, -50, 18, 100, 8); }, lower = c => { rrect(c, -9, -45, 16, 90, 7); };
export class Biplane extends Entity {
  static passes = { skyShadow: 'drawShadow', clouds: 'draw', lights: 'drawLights' };
  static clicks = 'top';
  static presence = { day: 1, night: 0.5 };   // flies about every other night, with its navigation lights (see engine/presence.js)
  constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.a = o.a || 0; this.bank = 0; this.roll = 0; this.seed = Math.random() * 9; this.puff = 0; this.goal = this.pick(); }
  pick() { const w = this.world; return [(Math.random() - 0.5) * 2 * (w.hw + 0.1), (Math.random() - 0.5) * 2 * (w.hh + 0.1)]; }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.04; }
  click() { if (!this.roll) this.roll = 0.001; }
  update(dt) {
    const w = this.world;
    if (Math.hypot(this.goal[0] - this.x, this.goal[1] - this.y) < 0.15) this.goal = this.pick();
    const turn = clamp(angDiff(Math.atan2(this.goal[1] - this.y, this.goal[0] - this.x), this.a), -0.5, 0.5);
    this.a += turn * dt; this.bank += (turn * 1.3 - this.bank) * Math.min(1, dt * 2);
    this.x += Math.cos(this.a) * 0.085 * dt; this.y += Math.sin(this.a) * 0.085 * dt;
    if (this.roll) {
      this.roll += dt * 4.2; if (this.roll > TAU) this.roll = 0;
      this.puff -= dt; if (this.puff <= 0) { this.puff = 0.05; w.burst(this.x - Math.cos(this.a) * 0.03, this.y - Math.sin(this.a) * 0.03, 1, 0.01, '255,255,255', 0.005, 1.4); }
    }
  }
  /** A point on the plane, (along, across) in drawing units, in world units: it follows the plane's heading and bank. */
  at(along, across) {
    const tilt = Math.cos(this.bank + this.roll), cos = Math.cos(this.a), sin = Math.sin(this.a), y = across * tilt;
    return [this.x + (cos * along - sin * y) * U, this.y + (sin * along + cos * y) * U];
  }
  /**
   * Its navigation lights after dark, as real planes carry them: red on the left wingtip, green on the right and a white
   * strobe on the tail that blinks about once a second. They grow with the darkness, so by day nothing is drawn.
   */
  drawLights(c, t) {
    const a = this.darkness * this.visible;
    if (a <= 0.004) return;
    const [lx, ly] = this.at(4, -49), [rx, ry] = this.at(4, 49), [sx, sy] = this.at(-46, 0);
    glow(c, lx, ly, 0.008, a * 0.9, NAV_RED);
    glow(c, rx, ry, 0.008, a * 0.9, NAV_GREEN);
    if ((t * STROBE + this.seed) % 1 < 0.08) glow(c, sx, sy, 0.014, a, NAV_WHITE);
  }
  drawShadow(c) {
    const s = this.castShadow(0.078, 0, AIRBORNE);
    sprite(c, this.x + s.x, this.y + s.y, this.a, U * 0.92, () => { c.scale(1, Math.cos(this.bank + this.roll)); c.fillStyle = shade(0.18 * s.a); upper(c); c.fill(); c.fill(BODY); c.fill(TAIL); });
  }
  wing(c, shape, dark) {
    c.save(); shape(c); c.clip();
    const g = c.createLinearGradient(18, 0, -10, 0); g.addColorStop(0, dark ? '#e0a52a' : '#fadb72'); g.addColorStop(0.5, dark ? '#d39a22' : '#f2bf42'); g.addColorStop(1, dark ? '#bd861a' : '#e0a62c');
    c.fillStyle = g; c.fillRect(-12, -52, 32, 104);
    c.fillStyle = dark ? '#a8301f' : '#d2402f'; c.fillRect(-12, -52, 32, 8); c.fillRect(-12, 44, 32, 8);                 // red tips
    c.fillStyle = '#fbf1d6'; c.fillRect(-12, -44, 32, 2); c.fillRect(-12, 42, 32, 2);
    c.strokeStyle = 'rgba(110,70,10,0.16)'; c.lineWidth = 0.5; for (let y = -40; y <= 40; y += 6.5) { c.beginPath(); c.moveTo(-12, y); c.lineTo(20, y); c.stroke(); }   // ribs under the fabric
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16, -50); c.lineTo(16, 50); c.stroke();    // light along the leading edge
    c.restore();
  }
  draw(c, t) {
    sprite(c, this.x, this.y, this.a, U, () => {
      const tilt = Math.cos(this.bank + this.roll); c.scale(1, tilt);
      [-11, 11].forEach(y => { c.fillStyle = '#2a2f36'; rrect(c, 9, y - 2, 8, 4, 2); c.fill(); });                              // wheels, ahead of the lower wing
      c.save(); c.translate(-2, 0); c.fillStyle = shade(0.25); c.translate(-1.5, 0); lower(c); c.fill(); c.translate(1.5, 0); this.wing(c, lower, true); c.restore();
      // tailplane and body
      fillPath(c, TAIL, '#f2bf42'); c.save(); c.clip(TAIL); c.fillStyle = '#d2402f'; c.fillRect(-48, -19, 16, 5); c.fillRect(-48, 14, 16, 5); c.restore();
      c.save(); c.clip(BODY);
      const g = c.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, '#e2574a'); g.addColorStop(0.45, '#cf3d30'); g.addColorStop(1, '#9d2a20');
      c.fillStyle = g; c.fillRect(-46, -8, 80, 16); c.fillStyle = '#fbf1d6'; c.fillRect(-46, -0.7, 68, 1.4);
      const metal = c.createLinearGradient(0, -8, 0, 8); metal.addColorStop(0, '#eef2f4'); metal.addColorStop(0.5, '#b6c0c6'); metal.addColorStop(1, '#7d8990');
      c.fillStyle = metal; c.fillRect(22, -8, 12, 16); c.fillStyle = 'rgba(40,50,60,0.35)'; c.fillRect(22, -8, 0.9, 16);
      c.restore();
      c.fillStyle = '#b3271d'; rrect(c, -48, -1.1, 15, 2.2, 1.1); c.fill();                                                    // the fin, edge on
      // struts between the wings, then the upper wing with its cut-out over the cockpit
      c.strokeStyle = '#6b4a2b'; c.lineWidth = 1.3; c.lineCap = 'round'; [-36, -22, 22, 36].forEach(y => { c.beginPath(); c.moveTo(-5, y); c.lineTo(11, y); c.stroke(); });
      this.wing(c, upper, false);
      disc(c, -1, 0, 5.2, '#cf3d30');
      // cockpits, windscreens, the pilot and the scarf
      oval(c, 4, 0, 4.4, 3.7, '#23272d'); oval(c, -9, 0, 4.6, 3.8, '#23272d');
      c.strokeStyle = 'rgba(210,235,245,0.9)'; c.lineWidth = 1.1; [8.2, -4.6].forEach(x => { c.beginPath(); c.arc(x - 3, 0, 4.2, -0.8, 0.8); c.stroke(); });
      c.strokeStyle = '#fffdf6'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-10.5, 1);
      for (let i = 1; i <= 8; i++) c.lineTo(-10.5 - i * 2.6, 1 + Math.sin(t * 14 - i * 0.9) * (0.5 + i * 0.32));
      c.stroke();
      disc(c, -9, 0, 3, '#6b4a32'); disc(c, -8.4, -0.4, 2.1, '#845e40'); disc(c, -6.9, -1.1, 0.8, '#dfeef4'); disc(c, -6.9, 1.1, 0.8, '#dfeef4');
      // the propeller: a hub and a blur
      const flick = 0.5 + 0.5 * Math.sin(t * 60);
      oval(c, 35, 0, 1.3, 23, 'rgba(255,255,255,' + (0.1 + 0.07 * flick) + ')'); oval(c, 35, 0, 0.8, 23 * (0.55 + 0.4 * flick), 'rgba(60,45,30,0.3)');
      disc(c, 34.5, 0, 2.3, '#8e9aa1'); disc(c, 34.9, -0.5, 1.1, '#e8edf0');
    });
  }
}
