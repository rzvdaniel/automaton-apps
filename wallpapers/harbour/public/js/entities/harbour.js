// The roads and footpath, and the harbour: the quay wall around the cove and the pier.
import { shade, disc, line, glow, switchOn, Entity } from '../core/index.js';

export class Roads extends Entity {
  static passes = { roads: 'draw' };
  draw(c) {
    const m = this.world.map;
    m.roads.forEach(r => { line(c, r.pts); c.strokeStyle = 'rgba(150,120,80,0.38)'; c.lineWidth = r.w + 0.003; c.stroke(); });
    m.roads.forEach(r => { line(c, r.pts); c.strokeStyle = '#ecdfbe'; c.lineWidth = r.w; c.stroke(); });
    line(c, m.path); c.strokeStyle = '#f1e7cb'; c.lineWidth = 0.0032; c.setLineDash([0.007, 0.005]); c.stroke(); c.setLineDash([]);
  }
}
const LAMP_EVERY = 0.022;   // world units between lamps along the quay and the pier

/** Points every `step` along a line of points: where the lamps stand. */
const along = (pts, step) => {
  const out = []; let left = step / 2;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0);
    let at = left;
    for (; at <= len; at += step) out.push([x0 + (x1 - x0) * at / len, y0 + (y1 - y0) * at / len]);
    left = at - len;
  }
  return out;
};

export class Quay extends Entity {
  static passes = { roads: 'draw', lights: 'drawLights' };
  /** The quay's and the pier's lamps: switched on in a row, one after the next, as the lamplighter walks along. */
  get lamps() {
    if (!this.lampList) {
      const m = this.world.map, spots = [...along(m.quay, LAMP_EVERY), ...along(m.pier, LAMP_EVERY)];
      this.lampList = spots.map(([x, y], n) => [x, y, 0.18 + 0.2 * n / Math.max(1, spots.length - 1)]);
    }
    return this.lampList;
  }
  drawLights(c) {
    const dark = this.darkness;
    for (const [x, y, at] of this.lamps) glow(c, x, y, 0.0075, switchOn(at, dark));
  }
  draw(c) {
    const quay = this.world.map.quay, pier = this.world.map.pier;
    const low = this.castShadow(0.0036), high = this.castShadow(0.0052);   // the pier stands a little higher than the quay
    c.save(); c.translate(low.x, low.y); line(c, quay); c.strokeStyle = shade(0.22 * low.a); c.lineWidth = 0.014; c.stroke(); c.restore();
    line(c, quay); c.strokeStyle = '#a9a498'; c.lineWidth = 0.014; c.stroke(); line(c, quay); c.strokeStyle = '#d6d0c2'; c.lineWidth = 0.0098; c.stroke();
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    c.save(); c.translate(high.x, high.y); line(c, pier); c.strokeStyle = shade(0.26 * high.a); c.lineWidth = 0.013; c.stroke(); c.restore();
    line(c, pier); c.strokeStyle = '#9d988c'; c.lineWidth = 0.013; c.stroke(); line(c, pier); c.strokeStyle = '#cfc9bb'; c.lineWidth = 0.009; c.stroke();
    c.lineCap = 'round'; c.lineJoin = 'round';
    [0.25, 0.5, 0.75].forEach(k => disc(c, pier[0][0] + (pier[1][0] - pier[0][0]) * k, pier[0][1] + (pier[1][1] - pier[0][1]) * k, 0.0011, '#5c564c'));
    disc(c, pier[2][0], pier[2][1], 0.0034, '#f7f2e8'); disc(c, pier[2][0], pier[2][1], 0.002, '#e2553f');
  }
}
