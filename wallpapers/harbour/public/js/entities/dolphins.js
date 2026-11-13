// A pod of dolphins travelling through deep water. Each swims just under the surface and leaps clear in its turn.
// Click near them and the whole pod leaps.
// new H.DolphinPod(world, { x, y, a, count })
(function (H) {
  'use strict';
  const { disc, oval, shade, fillPath } = H, U = 0.00034;
  const BODY = new Path2D('M50,0 C45,-2.6 40,-4.6 34,-5.6 C28,-12 14,-13 0,-11 C-16,-9 -30,-5 -41,-2 L-41,2 C-30,5 -16,9 0,11 C14,13 28,12 34,5.6 C40,4.6 45,2.6 50,0 Z');
  const FLUKE = new Path2D('M2,0 C-4,-3 -8,-12 -19,-17 C-18,-10 -16,-5 -13,0 C-16,5 -18,10 -19,17 C-8,12 -4,3 2,0 Z');
  const FLIPPER = new Path2D('M2,0 C0,6 -7,13 -16,17 C-13,10 -11,5 -9,-1 Z');
  const BACK = new Path2D('M40,0 C30,-6 14,-7.5 0,-6.5 C-16,-5 -30,-2.5 -40,0 C-30,2.5 -16,5 0,6.5 C14,7.5 30,6 40,0 Z');
  const FIN = new Path2D('M8,0 C2,-1.8 -8,-3 -15,-1 L-15,1 C-8,3 2,1.8 8,0 Z');
  H.DolphinPod = class extends H.Entity {
    static passes = { deep: 'drawUnder', water: 'drawLeaping' };
    static clicks = 'many';
    static sound = 'dolphin';
    constructor(world, o) {
      super(world); this.x = o.x; this.y = o.y; this.a = o.a || 0; this.seed = Math.random() * 9; this.sniff = 0; this.pod = [];
      for (let i = 0; i < (o.count || 4); i++) this.pod.push({ ox: -i * 0.022 + (Math.random() - 0.5) * 0.012, oy: (i % 2 ? 1 : -1) * (0.012 + Math.random() * 0.014) * Math.ceil(i / 2 + 0.5), x: 0, y: 0, a: this.a, leap: 0, wait: 1 + Math.random() * 7, ph: Math.random() * 9, size: 0.85 + Math.random() * 0.25 });
      const ca = Math.cos(this.a), sa = Math.sin(this.a); this.pod.forEach(d => { d.x = o.x + d.ox * ca - d.oy * sa; d.y = o.y + d.ox * sa + d.oy * ca; });
    }
    hit(x, y) { return this.pod.some(d => Math.hypot(d.x - x, d.y - y) < 0.05); }
    click() { this.pod.forEach((d, i) => { if (!d.leap) d.wait = i * 0.18; }); }
    update(dt) {
      const w = this.world, g = w.grad(this.x, this.y);
      let turn = Math.sin(w.clock * 0.16 + this.seed) * 0.25;
      if (g.d < 0.16) turn = H.angDiff(Math.atan2(g.gy, g.gx), this.a) * 2.2; else if (Math.abs(this.x) > w.hw - 0.1 || Math.abs(this.y) > w.hh - 0.1) turn = H.angDiff(Math.atan2(-this.y, -this.x), this.a) * 1.8;
      this.a += turn * dt; this.x += Math.cos(this.a) * 0.034 * dt; this.y += Math.sin(this.a) * 0.034 * dt;
      this.sniff -= dt;
      if (this.sniff <= 0 && H.FishSchool) {   // fish bolt from dolphins swimming or leaping near them
        this.sniff = 0.35; const schools = w.all(H.FishSchool);
        this.pod.forEach(d => schools.forEach(s => { if (Math.hypot(s.x - d.x, s.y - d.y) < 0.13) s.flee(d.x, d.y, 0.2, d.leap ? 0.5 : 0.28); }));
      }
      const ca = Math.cos(this.a), sa = Math.sin(this.a);
      this.pod.forEach(d => {
        const tx = this.x + d.ox * ca - d.oy * sa, ty = this.y + d.ox * sa + d.oy * ca, px = d.x, py = d.y, pull = Math.min(1, dt * 1.6);
        d.x += (tx - d.x) * pull + ca * 0.034 * dt * (1 - pull); d.y += (ty - d.y) * pull + sa * 0.034 * dt * (1 - pull);
        d.a += H.angDiff(Math.atan2(d.y - py + sa * 1e-5, d.x - px + ca * 1e-5), d.a) * Math.min(1, dt * 5); d.ph += dt * 7;
        if (d.leap) { const before = d.leap; d.leap += dt / 1.05; if (before < 0.9 && d.leap >= 0.9) this.splash(d, 0.75); if (d.leap >= 1) { d.leap = 0; d.wait = 4 + Math.random() * 9; } }
        else { d.wait -= dt; if (d.wait <= 0) { d.leap = 0.001; this.splash(d, 0.5); } }
      });
    }
    splash(d, k) { const w = this.world; w.ripple(d.x, d.y, k); w.burst(d.x, d.y, 8, 0.06, '255,255,255', 0.003, 0.7); }
    paint(c, d, t, clear) {
      c.save(); c.translate(-41, 0); c.rotate(0.3 * Math.sin(d.ph)); fillPath(c, FLUKE, clear ? '#4d6f86' : '#123a55'); c.restore();
      [-1, 1].forEach(s => { c.save(); c.translate(16, s * 9.5); c.scale(1, s); fillPath(c, FLIPPER, clear ? '#4d6f86' : '#123a55'); c.restore(); });
      if (!clear) { fillPath(c, BODY, '#123a55'); fillPath(c, BACK, 'rgba(60,110,140,0.55)'); return; }
      // out of the water: pale flanks, a slate back, a shine along it
      c.save(); c.clip(BODY);
      const g = c.createLinearGradient(0, -13, 0, 13); g.addColorStop(0, '#c4d6e0'); g.addColorStop(0.28, '#7c9db2'); g.addColorStop(0.5, '#587b93'); g.addColorStop(0.72, '#6f91a7'); g.addColorStop(1, '#a9c1cf');
      c.fillStyle = g; c.fillRect(-45, -14, 100, 28); c.restore();
      fillPath(c, BACK, 'rgba(62,92,112,0.55)'); fillPath(c, FIN, '#3d5a70');
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-26, -3.2); c.quadraticCurveTo(2, -7.5, 28, -5.5); c.stroke();
      disc(c, 35, -4.6, 1, '#16242e'); disc(c, 35, 4.6, 1, '#16242e'); oval(c, 22, 0, 2.2, 0.9, '#2f4658');
    }
    drawUnder(c, t) { this.pod.forEach(d => { if (!d.leap) { c.globalAlpha = 0.5; H.sprite(c, d.x, d.y, d.a, U * d.size, () => this.paint(c, d, t, false)); c.globalAlpha = 1; } }); }
    drawLeaping(c, t) {
      this.pod.forEach(d => {
        if (!d.leap) return;
        const h = Math.sin(d.leap * Math.PI);
        oval(c, d.x + h * 0.007, d.y + h * 0.006, 0.014 * d.size, 0.005 * d.size, shade(0.22 * h), d.a);   // its shadow on the water
        H.sprite(c, d.x, d.y - h * 0.013, d.a + (0.5 - d.leap) * 0.5, U * d.size * (1 + 0.22 * h), () => this.paint(c, d, t, true));
      });
    }
  };
})(window.Harbour);
