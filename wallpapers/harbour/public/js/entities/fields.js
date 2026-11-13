// Walled fields, and the sheep that graze in some of them. Sheep run from a click but stay inside their walls.
(function (H) {
  'use strict';
  const { line, oval, disc, shade } = H;
  H.Fields = class extends H.Entity {
    static passes = { ground: 'draw' };
    draw(c) {
      const cells = this.world.map.cells;
      cells.forEach(k => {
        line(c, k.quad); c.closePath(); c.globalAlpha = 0.8; c.fillStyle = k.col; c.fill(); c.globalAlpha = 1;
        if (k.rows) { c.save(); c.clip(); c.strokeStyle = 'rgba(70,110,40,0.22)'; c.lineWidth = 0.0012; c.translate(k.mx, k.my); c.rotate(k.ang); for (let r = -6; r <= 6; r++) { c.beginPath(); c.moveTo(-0.06, r * 0.0052); c.lineTo(0.06, r * 0.0052); c.stroke(); } c.restore(); }
      });
      cells.forEach(k => {   // dry-stone walls
        c.save(); c.translate(0.0012, 0.0016); line(c, k.quad); c.closePath(); c.strokeStyle = shade(0.2); c.lineWidth = 0.0022; c.stroke(); c.restore();
        line(c, k.quad); c.closePath(); c.strokeStyle = '#dcdfd6'; c.lineWidth = 0.002; c.setLineDash([0.006, 0.0012]); c.stroke(); c.setLineDash([]);
      });
    }
  };

  H.Sheep = class extends H.Entity {
    static passes = { ground: 'draw' };
    static clicks = 'many';
    static sound = 'sheep';
    constructor(world, o) { super(world); Object.assign(this, o); this.tx = this.x; this.ty = this.y; this.fear = 0; }   // o: x, y, a, cell, lamb, wait
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) <= 0.05; }
    click(x, y) {
      const d = Math.hypot(this.x - x, this.y - y) || 0.001, cell = this.cell;
      let fx = this.x + (this.x - x) / d * 0.035, fy = this.y + (this.y - y) / d * 0.035;
      const m = Math.hypot(fx - cell.mx, fy - cell.my);
      if (m > 0.026) { fx = cell.mx + (fx - cell.mx) / m * 0.026; fy = cell.my + (fy - cell.my) / m * 0.026; }
      this.tx = fx; this.ty = fy; this.fear = 1.6;
    }
    update(dt) {
      this.fear = Math.max(0, this.fear - dt);
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      if (d < 0.002) { this.wait -= dt; if (this.wait <= 0) { this.tx = this.cell.mx + (Math.random() - 0.5) * 0.036; this.ty = this.cell.my + (Math.random() - 0.5) * 0.028; this.wait = 3 + Math.random() * 9; } return; }
      const step = Math.min(d, (this.fear > 0 ? 0.05 : 0.005) * dt); this.x += dx / d * step; this.y += dy / d * step;
      this.a += H.angDiff(Math.atan2(dy, dx), this.a) * Math.min(1, dt * 8);
    }
    draw(c, t) {
      const m = this.lamb ? 0.65 : 1, lift = this.fear > 0 ? Math.abs(Math.sin(t * 22 + this.x * 90)) * 0.0012 : 0;
      oval(c, this.x + 0.0018, this.y + 0.0024, 0.0045 * m, 0.0034 * m, shade(0.22));
      c.save(); c.translate(this.x, this.y - lift); c.rotate(this.a); oval(c, 0, 0, 0.0046 * m, 0.0034 * m, '#fbf8f0'); disc(c, -0.001 * m, -0.0008 * m, 0.0022 * m, '#ffffff'); oval(c, 0.0048 * m, 0, 0.0017 * m, 0.0013 * m, '#2f2a2a'); c.restore();
    }
  };
})(window.Harbour);
