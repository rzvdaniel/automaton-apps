// A humpback whale that crosses the deep water now and then, sometimes with a calf at her side.
// She swims with her whole body, steers with long white-edged flippers, and blows when she surfaces. Click her and she dives.
(function (H) {
  'use strict';
  const { lerp, disc, oval, fillPath } = H;
  const U = 0.00085, N = 28, HALF = 25;   // one painting unit in world units; spine segments; half the body's width
  const WIDTH = [[0, 0], [0.015, 0.4], [0.05, 0.72], [0.12, 0.92], [0.28, 1], [0.5, 0.84], [0.7, 0.5], [0.86, 0.24], [1, 0.13]];
  const widthAt = u => { for (let i = 1; i < WIDTH.length; i++) if (u <= WIDTH[i][0]) return lerp(WIDTH[i - 1][1], WIDTH[i][1], (u - WIDTH[i - 1][0]) / (WIDTH[i][0] - WIDTH[i - 1][0])); return 0.13; };
  const FLIPPER = new Path2D('M0,-6 C12,-12 30,-11 46,-7 C56,-5 66,-1 70,3 C62,6 50,8 38,8 C24,9 10,8 0,7 Z');
  const FLIPPER_EDGE = new Path2D('M6,-8 C20,-11 34,-10 46,-7 C56,-5 66,-1 70,3 C60,1 48,-2 36,-3 C24,-4 14,-5 6,-4 Z');
  const FLUKE = new Path2D('M0,-5 C8,-8 16,-20 34,-38 C36,-30 34,-20 30,-12 C28,-7 27,-3 26,0 C27,3 28,7 30,12 C34,20 36,30 34,38 C16,20 8,8 0,5 Z');
  const FLUKE_EDGE = new Path2D('M30,-12 C34,-20 36,-30 34,-38 C31,-30 29,-21 27,-12 Z M30,12 C34,20 36,30 34,38 C31,30 29,21 27,12 Z');

  H.Whale = class extends H.Entity {
    static passes = { deep: 'draw', water: 'drawSpout' };
    static clicks = 'many';
    static sound = 'whale';
    constructor(world, G) { super(world); this.at = world.clock + 20 + G() * 30; this.on = false; this.x = this.y = this.a = 0; this.alpha = 0; this.dive = false; this.swim = 0; this.calf = false; this.blow = 9; this.spout = 9; }
    hit(x, y) { return this.on && !this.dive && Math.hypot(this.x - x, this.y - y) < 0.08; }
    click() { const w = this.world; this.dive = true; w.burst(this.x - Math.cos(this.a) * 0.07, this.y - Math.sin(this.a) * 0.07, 26, 0.16, '255,255,255', 0.006, 1.3); w.ripple(this.x, this.y, 1); w.sound.plop(); }
    // Set off on a straight course from (x1, y1) to (x2, y2).
    cross(x1, y1, x2, y2) { this.on = true; this.x = x1; this.y = y1; this.a = Math.atan2(y2 - y1, x2 - x1); this.alpha = 0; this.dive = false; this.calf = this.world.debug || Math.random() < 0.45; this.blow = 4 + Math.random() * 5; this.child = null; }   // some whales have a calf; in ?debug all do
    update(dt) {
      const w = this.world, hw = w.hw, hh = w.hh;
      if (!this.on) {
        if (w.clock < this.at) return;
        this.at = w.clock + (w.debug ? 12 : 35 + Math.random() * 75);   // random; every 12 s in ?debug
        for (let i = 0; i < 90 && !this.on; i++) {   // a course across the screen that keeps clear of land; she steers round anything close
          const dir = Math.random() < 0.5 ? 1 : -1, span = hh * (i < 60 ? 1.9 : 1.7), y1 = (Math.random() - 0.5) * span, y2 = (Math.random() - 0.5) * span, x1 = -dir * (hw + 0.15), x2 = dir * (hw + 0.15), need = i < 60 ? 0.1 : 0.05;
          let free = true; for (let k = 0; k <= 24 && free; k++) free = w.field(x1 + (x2 - x1) * k / 24, y1 + (y2 - y1) * k / 24) > need;
          if (free) this.cross(x1, y1, x2, y2);
        }
        return;
      }
      this.swim += dt * 1.25; this.spout += dt;
      const g = w.grad(this.x, this.y); if (g.d < 0.12) this.a += H.angDiff(Math.atan2(g.gy, g.gx), this.a) * Math.min(1, dt * 1.2);   // bear away from the shore
      this.x += Math.cos(this.a) * 0.03 * dt; this.y += Math.sin(this.a) * 0.03 * dt;
      this.alpha += ((this.dive ? 0 : 1) - this.alpha) * Math.min(1, dt * 1.5);
      if (this.calf) this.follow(dt);
      this.blow -= dt;
      if (this.blow <= 0 && !this.dive && Math.abs(this.x) < hw && Math.abs(this.y) < hh) { this.blow = 9 + Math.random() * 7; this.spout = 0; const h = this.head(); w.ripple(h[0], h[1], 0.5); }
      if (Math.abs(this.x) > hw + 0.2 || (this.dive && this.alpha < 0.03)) this.on = false;
    }
    // The calf keeps to a station beside her flank and a little behind; it weaves about it, drifts under her now and then,
    // and turns to match her heading a moment late. It keeps its own swimming rhythm.
    follow(dt) {
      const t = this.world.clock, ca = Math.cos(this.a), sa = Math.sin(this.a), side = 0.042 + 0.014 * Math.sin(t * 0.45) - Math.max(0, Math.sin(t * 0.17 + 1)) * 0.03, back = 0.026 + 0.012 * Math.sin(t * 0.31);
      const tx = this.x - ca * back - sa * side, ty = this.y - sa * back + ca * side, k = this.child || (this.child = { x: tx, y: ty, a: this.a, swim: Math.random() * 6 });
      const pull = Math.min(1, dt * 2.6); k.x += (tx - k.x) * pull; k.y += (ty - k.y) * pull;
      k.a += H.angDiff(this.a + 0.12 * Math.sin(t * 0.45), k.a) * Math.min(1, dt * 2.2); k.swim += dt * 1.9;
    }
    head() { return [this.x + Math.cos(this.a) * 0.06, this.y + Math.sin(this.a) * 0.06]; }
    // The spine bends in a slow wave that grows towards the tail.
    spine(i, swim) { const u = i / N; return [100 - 200 * u, 7 * Math.pow(u, 1.6) * Math.sin(swim - u * 2.6)]; }
    body(c, swim, m) {
      const left = [], right = [];
      for (let i = 0; i <= N; i++) { const p = this.spine(i, swim), q = this.spine(Math.min(N, i + 1), swim), o = this.spine(Math.max(0, i - 1), swim), tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1, hw = HALF * widthAt(i / N) * m; left.push([p[0] - ty / tl * hw, p[1] + tx / tl * hw]); right.push([p[0] + ty / tl * hw, p[1] - tx / tl * hw]); }
      c.beginPath(); left.forEach((p, n) => c[n ? 'lineTo' : 'moveTo'](p[0], p[1])); right.reverse().forEach(p => c.lineTo(p[0], p[1])); c.closePath();
    }
    paint(c, x, y, size, swim) {
      H.sprite(c, x, y, this.a, U * size, () => {
        // her shadow on the seabed
        c.save(); c.translate(9, 13); this.body(c, swim, 1); c.fillStyle = H.shade(0.16); c.fill(); c.restore();
        // flippers: a third as long as she is, pale and knobbly along the leading edge
        const sh = this.spine(8, swim);
        [-1, 1].forEach(s => {
          c.save(); c.translate(sh[0], sh[1] + s * HALF * 0.82); c.scale(1, s); c.rotate(2.02 + 0.13 * Math.sin(swim * 0.8 + s));
          fillPath(c, FLIPPER, '#2d5a77'); fillPath(c, FLIPPER_EDGE, 'rgba(226,240,246,0.72)');
          [[16, -10.5], [28, -11], [40, -9], [52, -6], [62, -2.5]].forEach(k => disc(c, k[0], k[1], 2.3, 'rgba(226,240,246,0.72)'));
          c.restore();
        });
        // flukes, following the last bend of the spine
        const e = this.spine(N, swim), b = this.spine(N - 3, swim);
        c.save(); c.translate(e[0], e[1]); c.rotate(Math.atan2(e[1] - b[1], e[0] - b[0]) + 0.28 * Math.sin(swim - 3));
        fillPath(c, FLUKE, '#2a5470'); c.save(); c.translate(3, 0); c.scale(0.78, 0.78); fillPath(c, FLUKE, '#3a6b88'); c.restore(); fillPath(c, FLUKE_EDGE, 'rgba(226,240,246,0.5)');
        c.restore();
        // the body, rounded with three tones from flank to back
        this.body(c, swim, 1); c.fillStyle = '#24506c'; c.fill();
        this.body(c, swim, 0.8); c.fillStyle = '#35688a'; c.fill();
        this.body(c, swim, 0.5); c.fillStyle = '#4a82a1'; c.fill();
        this.body(c, swim, 0.2); c.fillStyle = 'rgba(126,172,196,0.7)'; c.fill();
        // the knobs on her head, the blowholes, the small fin far down her back, old scars
        for (let i = 1; i <= 4; i++) { const p = this.spine(i, swim), wd = HALF * widthAt(i / N); [-0.62, 0, 0.62].forEach(k => disc(c, p[0], p[1] + k * wd, 1.7, 'rgba(150,190,210,0.8)')); }
        const bl = this.spine(5, swim); oval(c, bl[0], bl[1] - 1.6, 3, 0.9, '#173a52', 0.25); oval(c, bl[0], bl[1] + 1.6, 3, 0.9, '#173a52', -0.25);
        const fin = this.spine(19, swim); oval(c, fin[0], fin[1], 7, 2.2, '#1e4660');
        [[10, 0.3, 4], [13, -0.4, 3], [16, 0.2, 2.4], [7, -0.3, 2]].forEach(k => { const p = this.spine(k[0], swim); oval(c, p[0], p[1] + k[1] * HALF, k[2] * 1.6, k[2] * 0.5, 'rgba(210,232,242,0.22)', 0.4); });
      });
    }
    draw(c) {
      if (!this.on) return;
      c.globalAlpha = 0.9 * this.alpha;
      if (this.calf && this.child) { const k = this.child, a = this.a; this.a = k.a; this.paint(c, k.x, k.y, 0.46, k.swim); this.a = a; }
      this.paint(c, this.x, this.y, 1, this.swim);
      c.globalAlpha = 1;
    }
    // The blow: a burst of mist that rises, spreads and drifts off on the wind.
    drawSpout(c) {
      if (!this.on || this.spout > 2.2) return;
      const k = this.spout / 2.2, h = this.head(), w = this.world.wind, a = this.alpha * Math.pow(1 - k, 1.4);
      for (let i = 0; i < 7; i++) { const g = i * 2.4 + this.swim * 0.2, d = 0.004 + 0.012 * k; disc(c, h[0] + Math.cos(g) * d * (i % 3) * 0.5 + w[0] * 0.02 * k, h[1] + Math.sin(g) * d * 0.5 - 0.016 * Math.sqrt(k) * (0.6 + (i % 4) * 0.2) + w[1] * 0.02 * k, 0.003 + 0.007 * k, 'rgba(255,255,255,' + (0.42 * a) + ')'); }
    }
  };
})(window.Harbour);
