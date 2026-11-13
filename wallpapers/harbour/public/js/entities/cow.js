// A cow grazing in the meadow: it wanders around its spot, head down, tail flicking. Click it and it trots off.
// new H.Cow(world, { x, y, a, kind })   kind: 'friesian' (black and white), 'red' (red and white) or 'kerry' (all black)
(function (H) {
  'use strict';
  const { TAU, disc, oval, shade, fillPath } = H, U = 0.00017;
  const BODY = new Path2D('M30,-14.5 C37,-13.5 39,-7 39,0 C39,7 37,13.5 30,14.5 L-27,15.5 C-38,14.5 -43,8 -43,0 C-43,-8 -38,-14.5 -27,-15.5 Z');
  const HEAD = new Path2D('M45,-7.5 C52,-8.5 62,-6.5 66.5,-4.2 C69.5,-2.2 69.5,2.2 66.5,4.2 C62,6.5 52,8.5 45,7.5 Z');
  const COATS = { friesian: ['#f8f5ee', '#232327'], red: ['#f8f2e6', '#9c5a32'], kerry: ['#2c2c31', '#1c1c20'] };
  H.Cow = class extends H.Entity {
    static passes = { ground: 'draw' };
    static clicks = 'many';
    constructor(world, o) {
      super(world); this.x = this.hx = o.x; this.y = this.hy = o.y; this.a = o.a || 0; this.kind = o.kind || 'friesian'; this.tx = o.x; this.ty = o.y; this.wait = Math.random() * 6; this.fear = 0; this.seed = Math.random() * 9; this.step = 0;
      this.patches = []; for (let i = 0; i < 5; i++) this.patches.push([-36 + Math.random() * 68, -12 + Math.random() * 24, 7 + Math.random() * 9, 5 + Math.random() * 6, Math.random() * TAU]);
    }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.03; }
    click(x, y) { const d = Math.hypot(this.x - x, this.y - y) || 0.001; this.aim(this.x + (this.x - x) / d * 0.03, this.y + (this.y - y) / d * 0.03); this.fear = 2; }
    aim(x, y) { if (this.world.field(x, y) < -0.03) { this.tx = x; this.ty = y; } }
    update(dt) {
      this.fear = Math.max(0, this.fear - dt);
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      if (d < 0.002) { this.wait -= dt; if (this.wait <= 0) { const g = Math.random() * TAU, r = Math.random() * 0.03; this.aim(this.hx + Math.cos(g) * r, this.hy + Math.sin(g) * r); this.wait = 5 + Math.random() * 12; } return; }
      const v = this.fear > 0 ? 0.03 : 0.004, s = Math.min(d, v * dt); this.x += dx / d * s; this.y += dy / d * s; this.step += dt * (this.fear > 0 ? 14 : 4);
      this.a += H.angDiff(Math.atan2(dy, dx), this.a) * Math.min(1, dt * (this.fear > 0 ? 6 : 1.5));
    }
    draw(c, t) {
      const coat = COATS[this.kind], moving = Math.hypot(this.tx - this.x, this.ty - this.y) > 0.002, graze = this.fear > 0 ? 0 : 1, nod = graze * Math.sin(t * 2.2 + this.seed) * 1.6;
      oval(c, this.x + 0.002, this.y + 0.003, 0.0085, 0.0034, shade(0.22), this.a);
      H.sprite(c, this.x, this.y, this.a, U, () => {
        // hooves showing past the body, and the tail
        [[25, 13], [25, -13], [-30, 14], [-30, -14]].forEach((k, i) => oval(c, k[0] + (moving ? Math.sin(this.step + i * 1.6) * 4 : 0), k[1], 4.5, 2.6, '#3a2f28'));
        const sw = Math.sin(t * 2.6 + this.seed) * (this.fear > 0 ? 3 : 9);
        c.strokeStyle = coat[1]; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-42, 0); c.quadraticCurveTo(-52, sw * 0.4, -58, sw); c.stroke(); oval(c, -60, sw * 1.1, 3.6, 2, coat[1], 0.3);
        // the barrel of the body: patches, hip bones, light along the spine
        c.save(); c.clip(BODY);
        c.fillStyle = coat[0]; c.fillRect(-45, -17, 86, 34);
        this.patches.forEach(p => oval(c, p[0], p[1], p[2], p[3], coat[1], p[4]));
        const round = c.createLinearGradient(0, -16, 0, 16); round.addColorStop(0, 'rgba(255,255,255,0.12)'); round.addColorStop(0.35, 'rgba(255,255,255,0)'); round.addColorStop(1, 'rgba(20,30,45,0.32)');
        c.fillStyle = round; c.fillRect(-45, -17, 86, 34);
        c.restore();
        oval(c, -31, -9.5, 5, 3, 'rgba(255,255,255,0.16)'); oval(c, -31, 9.5, 5, 3, 'rgba(255,255,255,0.1)');
        c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-34, -1); c.quadraticCurveTo(0, -3, 30, -1); c.stroke();
        // neck and head, lowered to the grass
        c.translate(nod, 0);
        c.fillStyle = coat[0]; c.beginPath(); c.moveTo(32, -9); c.lineTo(48, -6.5); c.lineTo(48, 6.5); c.lineTo(32, 9); c.closePath(); c.fill();
        [-1, 1].forEach(s => { c.save(); c.translate(48, s * 8.5); c.rotate(s * 0.9); oval(c, 0, 0, 5.4, 2.6, coat[1]); oval(c, 0.6, 0, 3.4, 1.3, '#e3a59c'); c.restore(); });
        fillPath(c, HEAD, coat[0]);
        c.save(); c.clip(HEAD); if (this.kind !== 'kerry') { oval(c, 54, -9, 9, 5, coat[1]); oval(c, 54, 9, 9, 5, coat[1]); } c.fillStyle = 'rgba(20,30,45,0.18)'; c.fillRect(44, 3, 28, 6); c.restore();
        oval(c, 65.5, 0, 4.2, 4.6, '#eab0a6'); disc(c, 66.6, -1.9, 0.8, '#5a3a36'); disc(c, 66.6, 1.9, 0.8, '#5a3a36');
        disc(c, 56, -5.6, 1.2, '#121214'); disc(c, 56, 5.6, 1.2, '#121214');
        oval(c, 47.5, 0, 2.6, 4, this.kind === 'kerry' ? '#3a3a40' : coat[0]);
      });
    }
  };
})(window.Harbour);
