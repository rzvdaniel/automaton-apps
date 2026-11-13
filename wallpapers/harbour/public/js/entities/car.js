// A small car that potters around the island's roads: it parks for a while at the end of a road,
// and picks a new road at the crossroads. Click it and it toots and speeds off.
import { shade, clamp, angDiff, disc, rrect, Entity } from '../core/index.js';

const L = 0.0125, Wd = 0.0062, PAINT = [['#d9473a', '#ee7563'], ['#f0b93a', '#f8d778'], ['#2b8089', '#58aab1'], ['#f3ede0', '#ffffff'], ['#5d86b4', '#8fb0d6']];
export class Car extends Entity {
  static clicks = 'one';
  constructor(world, G) {
    super(world); this.roads = world.map.roads; this.r = 1; this.s = G() * (this.roads[1].pts.length - 2); this.dir = G() < 0.5 ? 1 : -1;
    this.paint = PAINT[Math.floor(G() * PAINT.length)]; this.wait = 0; this.rush = 0; this.a = 0; this.dust = 0; this.x = this.y = 0; this.bounce = 0;
    this.place(); this.a = this.heading;
  }
  place() {
    const p = this.roads[this.r].pts, n = clamp(Math.floor(this.s), 0, p.length - 2), u = this.s - n;
    this.x = p[n][0] + (p[n + 1][0] - p[n][0]) * u; this.y = p[n][1] + (p[n + 1][1] - p[n][1]) * u;
    this.seg = Math.hypot(p[n + 1][0] - p[n][0], p[n + 1][1] - p[n][1]) || 0.01;
    this.heading = Math.atan2((p[n + 1][1] - p[n][1]) * this.dir, (p[n + 1][0] - p[n][0]) * this.dir);
  }
  hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.014; }
  click() { this.rush = 2.5; this.wait = 0; this.bounce = 1; }
  update(dt) {
    this.rush = Math.max(0, this.rush - dt); this.bounce = Math.max(0, this.bounce - dt * 2);
    this.a += angDiff(this.heading, this.a) * Math.min(1, dt * 5);
    if (this.wait > 0) { this.wait -= dt; return; }
    const last = this.roads[this.r].pts.length - 1;
    this.s += this.dir * 0.03 * (this.rush > 0 ? 2.4 : 1) * dt / this.seg;
    if (this.s >= last || this.s <= 0) {
      const atHub = this.r === 0 ? this.s >= last : this.s <= 0;   // road 0 ends at the crossroads, the others start there
      if (atHub) { this.r = (this.r + 1 + Math.floor(Math.random() * 2)) % 3; this.dir = this.r === 0 ? -1 : 1; this.s = this.r === 0 ? this.roads[0].pts.length - 1.001 : 0.001; }
      else { this.s = clamp(this.s, 0, last); this.dir = -this.dir; this.wait = 3 + Math.random() * 7; }
    }
    this.place();
    this.dust -= dt; if (this.dust <= 0) { this.dust = this.rush > 0 ? 0.07 : 0.22; this.world.burst(this.x - Math.cos(this.a) * L * 0.5, this.y - Math.sin(this.a) * L * 0.5, 1, 0.006, '226,210,176', 0.0022, 0.7); }
  }
  draw(c, t) {
    const hop = this.bounce * Math.abs(Math.sin(this.bounce * 9)) * 0.002, idle = this.wait > 0 ? 0 : Math.sin(t * 30) * 0.00012;
    const body = (dy, len, wid, round, col) => { c.save(); c.translate(this.x, this.y + dy - hop + idle); c.rotate(this.a); rrect(c, -len / 2, -wid / 2, len, wid, round); c.fillStyle = col; c.fill(); c.restore(); };
    const at = (dx, dy) => [this.x + Math.cos(this.a) * dx - Math.sin(this.a) * dy, this.y + Math.sin(this.a) * dx + Math.cos(this.a) * dy];
    body(0.0036 + hop, L * 1.02, Wd * 1.05, 0.002, shade(0.24));                                   // shadow
    [[0.3, 0.42], [0.3, -0.42], [-0.3, 0.42], [-0.3, -0.42]].forEach(k => { const p = at(L * k[0], Wd * k[1]); disc(c, p[0], p[1] + 0.0014, 0.0012, '#2a2f36'); });   // wheels
    body(0.0012, L, Wd, 0.002, shade(0.45)); body(0.0008, L, Wd, 0.002, this.paint[0]);            // the side, a touch below the top
    body(-0.0004, L, Wd, 0.002, this.paint[0]);
    body(-0.001, L * 0.6, Wd * 0.86, 0.0017, '#27485c');                                           // glass all round the cabin
    body(-0.002, L * 0.44, Wd * 0.78, 0.0015, this.paint[1]);                                      // the roof, a little higher still
    [0.34, -0.34].forEach(k => { const p = at(L * 0.47, Wd * k); disc(c, p[0], p[1] - 0.0004 - hop, 0.0007, '#fff3bf'); });
    [0.34, -0.34].forEach(k => { const p = at(-L * 0.48, Wd * k); disc(c, p[0], p[1] - 0.0004 - hop, 0.0006, '#b8322a'); });
  }
}
