// Small plants: gorse bushes along the meadow's edge, heather, and dune grass on the sand.
(function (H) {
  'use strict';
  const { disc, shade } = H;
  H.Gorse = class extends H.Entity {
    static clicks = 'one';
    static sound = 'rustle';
    constructor(world, o) { super(world); Object.assign(this, o); this.shake = 0; }   // o: x, y, r, rot
    update(dt) { this.shake = Math.max(0, this.shake - dt * 0.9); }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.01; }
    click() { this.shake = 1; this.world.burst(this.x, this.y, 5, 0.04, '246,217,59', 0.002, 0.7); }
    draw(c, t) {
      const r = this.r, s = this.world.sway(this.x, this.y), sx = this.shake * 0.0015 * Math.sin(t * 30) + s[0] * r, y = this.y - r * 0.25;
      disc(c, this.x + r * 0.4, this.y + r * 0.35, r, shade(0.2)); disc(c, this.x, y + r * 0.12, r, '#3c7439'); disc(c, this.x + sx * 0.5, y, r * 0.95, '#4b8a45'); disc(c, this.x - r * 0.2 + sx, y - r * 0.2, r * 0.6, '#63a352');
      for (let i = 0; i < 5; i++) disc(c, this.x + Math.cos(this.rot + i * 1.9) * r * 0.55 + sx, y + Math.sin(this.rot + i * 1.9) * r * 0.5, r * 0.2, '#f6d93b');
    }
  };

  // One entity paints all the heather, one all the dune grass: they are background, not things you click.
  H.Heather = class extends H.Entity {
    static passes = { ground: 'draw' };
    constructor(world, tufts) { super(world); this.tufts = tufts; }
    draw(c) { this.tufts.forEach(h => { for (let b = 0; b < 4; b++) disc(c, h.x + Math.cos(h.rot + b * 1.7) * h.r * 0.7, h.y + Math.sin(h.rot + b * 1.7) * h.r * 0.5, h.r * 0.55, b % 2 ? 'rgba(176,132,196,0.75)' : 'rgba(150,108,176,0.7)'); }); }
  };
  H.DuneGrass = class extends H.Entity {
    static passes = { ground: 'draw' };
    constructor(world, tufts) { super(world); this.tufts = tufts; }
    draw(c, t) {
      const w = this.world;
      c.strokeStyle = '#a9bd7c'; c.lineWidth = 0.0011;
      this.tufts.forEach(m => {
        const s = w.sway(m.x, m.y)[0] * 6;
        for (let b = -1; b <= 1; b++) { const a = -1.571 + b * 0.5 + s + 0.06 * Math.sin(t * 1.5 + m.x * 60); c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(m.x + Math.cos(a) * m.r, m.y + Math.sin(a) * m.r); c.stroke(); }
      });
    }
  };
})(window.Harbour);
