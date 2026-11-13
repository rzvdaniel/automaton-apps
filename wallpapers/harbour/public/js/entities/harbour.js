// The roads and footpath, and the harbour: the quay wall around the cove and the pier.
import { shade, disc, line, Entity } from '../core/index.js';

export class Roads extends Entity {
  static passes = { roads: 'draw' };
  draw(c) {
    const m = this.world.map;
    m.roads.forEach(r => { line(c, r.pts); c.strokeStyle = 'rgba(150,120,80,0.38)'; c.lineWidth = r.w + 0.003; c.stroke(); });
    m.roads.forEach(r => { line(c, r.pts); c.strokeStyle = '#ecdfbe'; c.lineWidth = r.w; c.stroke(); });
    line(c, m.path); c.strokeStyle = '#f1e7cb'; c.lineWidth = 0.0032; c.setLineDash([0.007, 0.005]); c.stroke(); c.setLineDash([]);
  }
}
export class Quay extends Entity {
  static passes = { roads: 'draw' };
  draw(c) {
    const quay = this.world.map.quay, pier = this.world.map.pier;
    c.save(); c.translate(0.002, 0.003); line(c, quay); c.strokeStyle = shade(0.22); c.lineWidth = 0.014; c.stroke(); c.restore();
    line(c, quay); c.strokeStyle = '#a9a498'; c.lineWidth = 0.014; c.stroke(); line(c, quay); c.strokeStyle = '#d6d0c2'; c.lineWidth = 0.0098; c.stroke();
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    c.save(); c.translate(0.003, 0.0042); line(c, pier); c.strokeStyle = shade(0.26); c.lineWidth = 0.013; c.stroke(); c.restore();
    line(c, pier); c.strokeStyle = '#9d988c'; c.lineWidth = 0.013; c.stroke(); line(c, pier); c.strokeStyle = '#cfc9bb'; c.lineWidth = 0.009; c.stroke();
    c.lineCap = 'round'; c.lineJoin = 'round';
    [0.25, 0.5, 0.75].forEach(k => disc(c, pier[0][0] + (pier[1][0] - pier[0][0]) * k, pier[0][1] + (pier[1][1] - pier[0][1]) * k, 0.0011, '#5c564c'));
    disc(c, pier[2][0], pier[2][1], 0.0034, '#f7f2e8'); disc(c, pier[2][0], pier[2][1], 0.002, '#e2553f');
  }
}
