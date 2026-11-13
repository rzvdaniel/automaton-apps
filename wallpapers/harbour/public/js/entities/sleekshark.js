// The sleek shark: same habits as Shark (cruising, hunting fish schools, diving when clicked), a different shape.
// A smooth torpedo body with a lighter ridge along the back, gill slits, small pelvic fins and a proper two-lobed tail.
// new SleekShark(world, G, size)   size 1 is the usual length; the island adds one smaller and one bigger shark.
import { lerp, sprite } from '../core/index.js';
import { Shark } from './shark.js';

const U = 0.00037, N = 30, K = 1.5;   // one painting unit in world units; spine segments; resolution of the shadow buffer
const WIDTH = [[0, 0], [0.012, 0.4], [0.04, 0.64], [0.1, 0.84], [0.22, 0.98], [0.3, 1], [0.45, 0.9], [0.6, 0.66], [0.75, 0.4], [0.88, 0.2], [1, 0.11]];
const widthAt = u => { for (let i = 1; i < WIDTH.length; i++) if (u <= WIDTH[i][0]) return lerp(WIDTH[i - 1][1], WIDTH[i][1], (u - WIDTH[i - 1][0]) / (WIDTH[i][0] - WIDTH[i - 1][0])); return 0.11; };
const PECTORAL = new Path2D('M10,-1 C10,14 -2,32 -20,46 C-14,32 -14,16 -16,3 Z');
const PELVIC = new Path2D('M5,0 C4,6 -2,13 -10,17 C-6,10 -6,5 -7,1 Z');
const TAIL = new Path2D('M-4,-2.4 C3,-8 12,-22 34,-40 C30,-28 24,-14 17,-3 C16,-1 16,1 17,3 C21,10 24,20 26,30 C14,22 4,10 -4,2.4 Z');
export class SleekShark extends Shark {
  /** The small canvas the shadow is painted on, made the first time it is needed (so a world with no page can still hold one). */
  get buf() { if (!this._buf) { this._buf = document.createElement('canvas'); this._buf.width = 340; this._buf.height = 200; } return this._buf; }
  // The spine bends in a wave that grows towards the tail.
  spine(i) { const u = i / N; return [92 - 164 * u, 9 * Math.pow(u, 1.5) * Math.sin(this.swim - u * 3.2) + (this.turn || 0) * 14 * u * u]; }
  // A smooth closed outline round the spine, at a fraction of the full width.
  outline(g, m) {
    const left = [], right = [];
    for (let i = 0; i <= N; i++) { const p = this.spine(i), q = this.spine(Math.min(N, i + 1)), o = this.spine(Math.max(0, i - 1)), tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1, hw = 17 * m * widthAt(i / N); left.push([p[0] - ty / tl * hw, p[1] + tx / tl * hw]); right.push([p[0] + ty / tl * hw, p[1] - tx / tl * hw]); }
    const pts = left.concat(right.reverse()), n = pts.length, mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], st = mid(pts[n - 1], pts[0]);
    g.beginPath(); g.moveTo(st[0], st[1]); for (let i = 0; i < n; i++) { const m2 = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i][0], pts[i][1], m2[0], m2[1]); } g.closePath();
  }
  drawBody(c) {
    if (this.away || this.alpha < 0.02) return;
    const g = this.buf.getContext('2d'), sw = this.swim;
    // the whole shadow is painted opaque in a small buffer and laid on the sea once, so the overlaps do not show
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 340, 200); g.setTransform(K, 0, 0, K, 176, 100); g.lineCap = 'round';
    // tail, following the last bend of the spine and swinging a little further than the body
    const e = this.spine(N), b = this.spine(N - 3);
    g.save(); g.translate(e[0], e[1]); g.rotate(Math.atan2(e[1] - b[1], e[0] - b[0]) + 0.3 * Math.sin(sw - 3.7)); g.fillStyle = '#0c3550'; g.fill(TAIL); g.restore();
    // pelvic and pectoral fins
    const pv = this.spine(17), sh = this.spine(9);
    [-1, 1].forEach(s => { g.save(); g.translate(pv[0], pv[1] + s * 10); g.scale(1, s); g.rotate(0.1 * Math.sin(sw + 1)); g.fillStyle = '#0c3550'; g.fill(PELVIC); g.restore(); });
    [-1, 1].forEach(s => { g.save(); g.translate(sh[0], sh[1] + s * 14); g.scale(1, s); g.rotate(0.14 * Math.sin(sw * 0.8 + s)); g.fillStyle = '#0c3550'; g.fill(PECTORAL); g.restore(); });
    // the body, with a lighter ridge along the back and the gill slits behind the head
    this.outline(g, 1); g.fillStyle = '#0f3d5a'; g.fill();
    this.outline(g, 0.55); g.fillStyle = '#17506e'; g.fill();
    this.outline(g, 0.22); g.fillStyle = '#1d5d7c'; g.fill();
    g.strokeStyle = '#0a2c42'; g.lineWidth = 0.9;
    for (let k = 0; k < 5; k++) { const p = this.spine(7 + k), hw = 17 * widthAt((7 + k) / N); [-1, 1].forEach(s => { g.beginPath(); g.moveTo(p[0], p[1] + s * hw * 0.5); g.quadraticCurveTo(p[0] - 1.2, p[1] + s * hw * 0.78, p[0] - 2.4, p[1] + s * hw * 0.95); g.stroke(); }); }
    c.globalAlpha = 0.42 * this.alpha; sprite(c, this.x, this.y, this.a, U * this.size / K, () => c.drawImage(this.buf, -176, -100)); c.globalAlpha = 1;
  }
}
