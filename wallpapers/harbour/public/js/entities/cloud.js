// A cloud drifting on the wind, with its shadow on the island below. Click it and it blows away; a new one drifts in.
(function (H) {
  'use strict';
  const { TAU } = H;
  H.Cloud = class extends H.Entity {
    static passes = { skyShadow: 'drawShadow', clouds: 'draw' };
    static clicks = 'top';
    constructor(world, rnd, x, y) { super(world); this.shape(rnd); this.x = x; this.y = y; }
    // A few large lumps and a ring of smaller ones on their edge: the outline carries the shape.
    shape(rnd) {
      const puffs = [{ x: 0, y: 0, r: 0.52 }], n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1, d = 0.5 + rnd() * 0.25 + Math.floor(i / 2) * 0.4; puffs.push({ x: s * d, y: (rnd() - 0.5) * 0.24, r: 0.36 - Math.floor(i / 2) * 0.08 + rnd() * 0.08 }); }
      const lumps = puffs.length;
      for (let i = 0; i < 5 + Math.floor(rnd() * 4); i++) { const base = puffs[Math.floor(rnd() * lumps)], a = rnd() * TAU; puffs.push({ x: base.x + Math.cos(a) * base.r * 0.9, y: base.y + Math.sin(a) * base.r * 0.8, r: 0.13 + rnd() * 0.12 }); }
      this.puffs = puffs; this.r = 0.05 + rnd() * 0.05; this.speed = 0.005 + rnd() * 0.005; this.alpha = 1; this.fade = false; this.sprite = null;
    }
    onResize() { this.sprite = null; }
    paint() {
      const w = this.world, Rp = this.r * w.S * w.dpr, wd = Math.ceil(Rp * 4.4), ht = Math.ceil(Rp * 2.8);
      const canvas = draw => { const cv = document.createElement('canvas'); cv.width = wd; cv.height = ht; const g = cv.getContext('2d'); g.translate(wd / 2, ht / 2); draw(g); return cv; };
      const puffs = (g, dx, dy, m, col) => { g.fillStyle = col; this.puffs.forEach(p => { g.beginPath(); g.arc((p.x + dx) * Rp, (p.y + dy) * Rp, p.r * Rp * m, 0, TAU); g.fill(); }); };
      // three flat tones, lit from the top left; nothing drawn inside the shape
      this.sprite = canvas(g => { puffs(g, 0, 0, 1, '#ffffff'); g.globalCompositeOperation = 'source-atop'; puffs(g, 0.055, 0.08, 0.99, '#e6ecf7'); puffs(g, 0.2, 0.27, 0.96, '#d5deef'); });
      this.shadow = canvas(g => puffs(g, 0, 0, 1, 'rgb(' + H.SHADE + ')'));
      this.w = wd / w.dpr; this.h = ht / w.dpr;
    }
    hit(x, y) { return !this.fade && this.puffs.some(p => Math.hypot(this.x + p.x * this.r - x, this.y + p.y * this.r - y) < p.r * this.r); }
    click(x, y) { this.fade = true; this.world.burst(x, y, 12, 0.1, '255,255,255', 0.009, 0.9); }
    update(dt) {
      const w = this.world, wind = w.wind, hw = w.hw, hh = w.hh;
      this.x += wind[0] * this.speed * dt; this.y += wind[1] * this.speed * dt;
      this.alpha += ((this.fade ? 0 : 1) - this.alpha) * Math.min(1, dt * 2.5);
      if (Math.abs(this.x) > hw + this.r * 2.6 || Math.abs(this.y) > hh + this.r * 2 || (this.fade && this.alpha < 0.02)) {   // a new one drifts in on the upwind side
        this.shape(Math.random);
        if (Math.abs(wind[0]) * hh > Math.abs(wind[1]) * hw) { this.x = -Math.sign(wind[0]) * (hw + this.r * 2.5); this.y = (Math.random() - 0.5) * 2 * hh; }
        else { this.y = -Math.sign(wind[1]) * (hh + this.r * 1.9); this.x = (Math.random() - 0.5) * 2 * hw; }
      }
    }
    blit(c, img, dx, dy, alpha) {
      const w = this.world; if (!this.sprite) this.paint();
      w.pixelSpace(); c.globalAlpha = alpha * this.alpha;
      c.drawImage(this[img], w.W / 2 + (this.x + dx) * w.S - this.w / 2, w.H / 2 + (this.y + dy) * w.S - this.h / 2, this.w, this.h);
      c.globalAlpha = 1; w.worldSpace();
    }
    drawShadow(c) { this.blit(c, 'shadow', 0.05, 0.072, 0.2); }
    draw(c) { this.blit(c, 'sprite', 0, 0, 0.96); }
  };
})(window.Harbour);
