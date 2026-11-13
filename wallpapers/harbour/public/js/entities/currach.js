// A currach: the tarred canvas rowing boat of the west of Ireland, with one man at the oars and a lobster pot in the stern.
// He rows along the coast, each stroke leaving a pair of puddles behind. Click the boat and he pulls harder for a while.
// new Currach(world, { x, y, a })
import { TAU, shade, angDiff, disc, oval, rrect, sprite, fillPath, strokePath, Entity } from '../core/index.js';

const U = 0.0003;
const HULL = new Path2D('M54,0 C45,-9 26,-13.5 4,-13.5 L-40,-11.5 C-47,-10.5 -49,-6 -49,0 C-49,6 -47,10.5 -40,11.5 L4,13.5 C26,13.5 45,9 54,0 Z');
const INSIDE = new Path2D('M46,0 C39,-7 24,-10.5 4,-10.5 L-38,-8.8 C-44,-8 -45.5,-5 -45.5,0 C-45.5,5 -44,8 -38,8.8 L4,10.5 C24,10.5 39,7 46,0 Z');
export class Currach extends Entity {
  static passes = { water: 'draw' };
  static ownScale = true;
  static clicks = 'many';
  constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.a = o.a || 0; this.stroke = Math.random() * TAU; this.rush = 0; this.rest = 0; this.puddles = []; this.seed = Math.random() * 9; }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.025 * this.scale; }
  click() { this.rush = 4; this.rest = 0; }
  // Where the tip of an oar is, in the world. side: -1 or 1.
  blade(side) { const th = 0.62 * Math.cos(this.stroke), ox = 2 - Math.sin(th) * 36, oy = side * (12.5 + Math.cos(th) * 36), ca = Math.cos(this.a), sa = Math.sin(this.a); return [this.x + (ox * ca - oy * sa) * U * this.scale, this.y + (ox * sa + oy * ca) * U * this.scale]; }
  update(dt) {
    const w = this.world, g = w.grad(this.x, this.y); this.rush = Math.max(0, this.rush - dt);
    for (let i = this.puddles.length - 1; i >= 0; i--) { this.puddles[i].t += dt; if (this.puddles[i].t > 3) this.puddles.splice(i, 1); }
    if (this.rest > 0) { this.rest -= dt; return; }
    let turn = Math.sin(w.clock * 0.13 + this.seed) * 0.15;
    if (g.d < 0.07) turn = angDiff(Math.atan2(g.gy, g.gx), this.a) * 1.6; else if (g.d > 0.16) turn = angDiff(Math.atan2(-g.gy, -g.gx), this.a) * 0.6;
    if (Math.abs(this.x) > w.hw - 0.06 || Math.abs(this.y) > w.hh - 0.06) turn = angDiff(Math.atan2(-this.y, -this.x), this.a) * 1.5;
    const pace = this.rush > 0 ? 1.8 : 1, before = Math.sin(this.stroke);
    this.stroke += dt * 2.6 * pace; this.a += turn * dt;
    const pull = Math.max(0, Math.sin(this.stroke)), v = (0.006 + 0.016 * pull) * pace;   // the boat surges on each pull and glides between
    this.x += Math.cos(this.a) * v * dt; this.y += Math.sin(this.a) * v * dt;
    if (before > 0 && Math.sin(this.stroke) <= 0) { [-1, 1].forEach(s => { const b = this.blade(s); this.puddles.push({ x: b[0], y: b[1], t: 0 }); }); if (this.rush === 0 && Math.random() < 0.04) this.rest = 4 + Math.random() * 6; }
  }
  draw(c, t) {
    this.puddles.forEach(p => { const u = p.t / 3; c.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - u)) + ')'; c.lineWidth = 0.0007; c.beginPath(); c.ellipse(p.x, p.y, 0.002 + u * 0.007, 0.0015 + u * 0.005, 0, 0, TAU); c.stroke(); });
    sprite(c, this.x, this.y, this.a + 0.02 * Math.sin(t * 1.1 + this.seed), U * this.scale, () => {
      const th = this.rest > 0 ? 0.5 : 0.62 * Math.cos(this.stroke), deep = this.rest > 0 ? 0 : Math.max(0, Math.sin(this.stroke)), lean = this.rest > 0 ? 0 : -3 * Math.cos(this.stroke);
      c.save(); c.translate(7, 10); fillPath(c, HULL, shade(0.26)); c.restore();
      // tarred hull, wooden gunwale, ribs and seats inside
      fillPath(c, HULL, '#1d2126'); strokePath(c, HULL, '#a57f4e', 2.2);
      fillPath(c, INSIDE, '#43362c');
      c.save(); c.clip(INSIDE);
      c.strokeStyle = 'rgba(190,150,100,0.5)'; c.lineWidth = 0.9; for (let x = -40; x <= 40; x += 7) { c.beginPath(); c.moveTo(x, -12); c.lineTo(x, 12); c.stroke(); }
      c.strokeStyle = 'rgba(190,150,100,0.35)'; c.lineWidth = 0.7; [-5, 0, 5].forEach(y => { c.beginPath(); c.moveTo(-46, y); c.lineTo(46, y); c.stroke(); });
      c.fillStyle = '#b78f5c'; c.fillRect(11, -12, 5, 24); c.fillRect(-16, -12, 5, 24); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(11, -12, 1.4, 24); c.fillRect(-16, -12, 1.4, 24);
      oval(c, 0, 8, 46, 4, 'rgba(0,0,0,0.25)');
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-40, -11.5); c.lineTo(4, -13.5); c.quadraticCurveTo(30, -13, 50, -3); c.stroke();
      // the lobster pot and a coil of rope in the stern
      c.fillStyle = '#7b5d38'; rrect(c, -40, -5.5, 12, 11, 2.5); c.fill(); c.fillStyle = '#9c7848'; rrect(c, -40, -6.5, 12, 11, 2.5); c.fill();
      c.strokeStyle = 'rgba(60,40,20,0.5)'; c.lineWidth = 0.6; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-40 + i * 3, -6.5); c.lineTo(-40 + i * 3, 4.5); c.stroke(); } c.beginPath(); c.moveTo(-40, -1); c.lineTo(-28, -1); c.stroke();
      c.strokeStyle = '#d9c9a3'; c.lineWidth = 0.9; c.beginPath(); c.arc(28, 0, 3.4, 0, TAU); c.stroke(); c.beginPath(); c.arc(28, 0, 1.8, 0, TAU); c.stroke(); disc(c, 34, 3, 2, '#f08a3c');
      // the oars: long and thin, pivoting on the gunwale; the outer end darkens when it is in the water
      [-1, 1].forEach(s => {
        const px = 2, py = s * 12.5, ox = -Math.sin(th), oy = s * Math.cos(th);
        c.lineCap = 'round'; c.strokeStyle = '#d0ad72'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px - ox * 9, py - oy * 9); c.lineTo(px + ox * 36, py + oy * 36); c.stroke();
        c.strokeStyle = 'rgba(40,80,100,' + (0.55 * deep) + ')'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(px + ox * 26, py + oy * 26); c.lineTo(px + ox * 36, py + oy * 36); c.stroke();
        if (deep > 0.2) oval(c, px + ox * 33, py + oy * 33, 3.2, 1.6, 'rgba(255,255,255,' + (0.5 * deep) + ')');
        disc(c, px, py, 1.1, '#4a3622');
        c.strokeStyle = '#2f4a6b'; c.lineWidth = 3.2; c.beginPath(); c.moveTo(-2 + lean, s * 6); c.lineTo(px - ox * 8.5, py - oy * 8.5); c.stroke();   // arms
        disc(c, px - ox * 8.5, py - oy * 8.5, 1.5, '#e9c9a6');
      });
      // the rower, back to the bow: jumper, cap
      oval(c, -2 + lean, 0, 5.4, 9.2, '#253d5a'); oval(c, -2.8 + lean, -1.2, 4.2, 7.4, '#3a5c85');
      disc(c, -3.2 + lean * 1.2, 0, 4.1, '#6f6150'); disc(c, -3.6 + lean * 1.2, -0.6, 3.1, '#8d7c66'); oval(c, -6.6 + lean * 1.2, 0, 1.8, 3.2, '#57493a');
    });
  }
}
