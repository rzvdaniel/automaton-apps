// A red fox, out only at night (see engine/presence.js). Now and then it trots off across the island to somewhere new,
// then sits a while. Click it and it jumps and yips.
// new Fox(world)   it finds its own spot on the land
import { TAU, shade, angDiff, disc, oval, sprite, Entity } from '../core/index.js';

const U = 0.00016;   // world units per drawing unit: the fox is drawn about 60 units long, nose to tail tip
const RUSSET = '#c4642c', DARK = '#7a3a1a', CREAM = '#f4ead8';
const TROT = 0.022, DASH = 0.05;   // world units a second, trotting and running off after a click

export class Fox extends Entity {
  static active = 'night';
  static clicks = 'one';
  static sound = 'yip';

  /** @param {World} world @param {() => number} [random] where it starts and roams (not the island's random source) */
  constructor(world, random = Math.random) {
    super(world); this.random = random;
    this.x = this.y = 0; this.a = random() * TAU;
    this.findLand(0, 0, 0.4); this.tx = this.x; this.ty = this.y;
    this.wait = 2 + random() * 6; this.step = 0; this.jump = 0; this.rush = 0;
  }

  /** Moves the fox (or its goal, with `goal`) to a random spot on the land within `reach` of (x, y). */
  findLand(x, y, reach, goal = false) {
    for (let i = 0; i < 40; i++) {
      const g = this.random() * TAU, r = this.random() * reach, px = x + Math.cos(g) * r, py = y + Math.sin(g) * r;
      if (this.world.field(px, py) < -0.03) { if (goal) { this.tx = px; this.ty = py; } else { this.x = px; this.y = py; } return true; }
    }
    return false;
  }

  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.012; }
  click() { this.jump = 1; this.rush = 2; this.findLand(this.x, this.y, 0.12, true); }

  update(dt) {
    this.jump = Math.max(0, this.jump - dt * 2.2); this.rush = Math.max(0, this.rush - dt);
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    if (d < 0.002) {   // sitting: after a while, off it goes again
      this.wait -= dt;
      if (this.wait <= 0) { this.findLand(this.x, this.y, 0.18, true); this.wait = 4 + this.random() * 10; }
      return;
    }
    const s = Math.min(d, (this.rush > 0 ? DASH : TROT) * dt);
    this.x += dx / d * s; this.y += dy / d * s; this.step += dt * (this.rush > 0 ? 22 : 12);
    this.a += angDiff(Math.atan2(dy, dx), this.a) * Math.min(1, dt * 6);
  }

  draw(c, t) {
    const moving = Math.hypot(this.tx - this.x, this.ty - this.y) >= 0.002;
    const lift = Math.sin(this.jump * Math.PI) * 0.006;   // the jump: up and down again
    const s = this.castShadow(0.0018 + lift);
    oval(c, this.x + s.x, this.y + s.y, 0.0052, 0.0022, shade(0.24 * s.a), this.a);
    sprite(c, this.x, this.y - lift, this.a, U, () => {
      // legs, trotting in pairs
      [[9, 5], [9, -5], [-11, 5], [-11, -5]].forEach((k, i) => oval(c, k[0] + (moving ? Math.sin(this.step + (i % 3 ? Math.PI : 0)) * 3 : 0), k[1] * 1.1, 3, 1.6, DARK));
      // the brush: a thick tail with a white tip, swinging
      const swing = Math.sin(t * (moving ? 9 : 2)) * (moving ? 3 : 1.5);
      c.save(); c.translate(-17, 0); c.rotate(swing * 0.05);
      oval(c, -11, 0, 12, 4.2, RUSSET); oval(c, -11, 0.8, 10, 2.6, '#b2551f'); oval(c, -21, 0, 4.2, 3.2, CREAM);
      c.restore();
      // the body, lighter down the back
      oval(c, 0, 0, 18, 6.6, RUSSET); oval(c, 1, -1.2, 14, 3, '#d9783c');
      // the head: cream cheeks, a dark snout, pointed ears
      c.save(); c.translate(19, 0);
      oval(c, 0, 0, 6.2, 5.4, RUSSET); oval(c, 2, 0, 4, 3.6, CREAM);
      c.fillStyle = RUSSET; c.beginPath(); c.moveTo(3, -2.2); c.lineTo(11, 0); c.lineTo(3, 2.2); c.closePath(); c.fill();
      disc(c, 11, 0, 1.1, '#1d1712');
      [-1, 1].forEach(k => { c.fillStyle = DARK; c.beginPath(); c.moveTo(-3, k * 2.5); c.lineTo(-5.5, k * 7.5); c.lineTo(0, k * 4.5); c.closePath(); c.fill(); });
      c.restore();
    });
  }
}
