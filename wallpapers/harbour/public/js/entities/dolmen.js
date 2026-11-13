// A dolmen: three upright stones and a great capstone, older than anything else on the island.
// Moss on the north side, lichen on top, long grass at its feet. Click it and a hare bolts out from under it.
// new H.Dolmen(world, { x, y })
(function (H) {
  'use strict';
  const { disc, oval, shade, fillPath } = H, U = 0.00035;
  const CAP = new Path2D('M-47,-22 C-31,-35 14,-39 44,-29 C53,-25 51,-14 41,-8 C10,3 -25,3 -45,-6 C-53,-10 -53,-18 -47,-22 Z');
  const CAP_LIGHT = new Path2D('M-40,-22 C-26,-32 10,-35 36,-28 C42,-25 40,-19 32,-16 C8,-10 -20,-11 -36,-15 C-43,-17 -44,-20 -40,-22 Z');
  const LEFT = new Path2D('M-35,-6 C-37,10 -37,26 -33,34 C-27,38.5 -18,37.5 -14,33 C-12,22 -12,8 -14,-6 Z');
  const RIGHT = new Path2D('M14,-6 C12,10 13,26 16,34 C22,38.5 30,37.5 34,32 C36.5,20 36.5,8 34,-8 Z');
  const BACK = new Path2D('M-12,-10 L11,-10 L10,22 C4,25 -5,25 -11,22 Z');
  const HARE = new Path2D('M9,0 C9,-3 6,-4.5 2,-4.5 C-3,-5 -8,-3.5 -10,0 C-8,3.5 -3,5 2,4.5 C6,4.5 9,3 9,0 Z');
  H.Dolmen = class extends H.Entity {
    static clicks = 'one';
    constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.hare = 0; this.dir = 1; }
    hit(x, y) { return Math.hypot(this.x - x, this.y - 0.004 - y) < 0.02; }
    click() { if (!this.hare) { this.hare = 0.001; this.dir = Math.random() < 0.5 ? 1 : -1; } }
    update(dt) { if (this.hare) { this.hare += dt / 2.6; if (this.hare >= 1) this.hare = 0; } }
    draw(c, t) {
      const s = this.world.sway(this.x, this.y)[0] * 40;
      oval(c, this.x + 0.007, this.y + 0.009, 0.02, 0.009, shade(0.22));
      H.sprite(c, this.x, this.y, 0, U, () => {
        const tuft = (x, y, n) => { c.strokeStyle = '#6fa64f'; c.lineWidth = 1.1; c.lineCap = 'round'; for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(x + i * 2.2, y); c.quadraticCurveTo(x + i * 2.2 + s * 0.5, y - 5, x + i * 2.2 - 3 + i * 1.5 + s, y - 8 - (i % 2) * 3); c.stroke(); } };
        tuft(-44, 34, 4); tuft(36, 30, 3);
        // the back stone and the dark chamber, then the two portal stones
        fillPath(c, BACK, '#59646b'); c.fillStyle = 'rgba(14,24,34,0.72)'; c.fillRect(-14, -4, 28, 28);
        [[LEFT, -24], [RIGHT, 24]].forEach(k => {
          fillPath(c, k[0], '#7f8a90');
          c.save(); c.clip(k[0]);
          const g = c.createLinearGradient(k[1] - 12, 0, k[1] + 12, 0); g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(18,34,48,0.38)');
          c.fillStyle = g; c.fillRect(-40, -10, 80, 50);
          c.fillStyle = 'rgba(18,34,48,0.5)'; c.fillRect(-40, -10, 80, 9);                                  // the capstone's shadow on them
          oval(c, k[1] - 6, 30, 8, 9, 'rgba(120,160,90,0.7)'); oval(c, k[1] + 3, 12, 2.4, 3.4, 'rgba(214,207,138,0.7)');
          c.strokeStyle = 'rgba(40,52,62,0.35)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(k[1] - 2, 0); c.quadraticCurveTo(k[1] + 3, 12, k[1] - 1, 24); c.stroke();
          c.restore();
        });
        tuft(-20, 37, 3); tuft(10, 36, 4);
        // the capstone: its thick front edge, its weathered top
        c.save(); c.translate(0, 11); fillPath(c, CAP, '#5d686f'); c.restore(); c.save(); c.translate(0, 5.5); fillPath(c, CAP, '#6a757c'); c.restore();
        fillPath(c, CAP, '#9aa4a8');
        c.save(); c.clip(CAP);
        const top = c.createLinearGradient(-40, -36, 40, 0); top.addColorStop(0, 'rgba(255,255,255,0.3)'); top.addColorStop(0.6, 'rgba(255,255,255,0)'); top.addColorStop(1, 'rgba(18,34,48,0.2)');
        c.fillStyle = top; c.fillRect(-55, -40, 110, 46);
        c.restore();
        fillPath(c, CAP_LIGHT, 'rgba(214,222,224,0.6)');
        c.strokeStyle = 'rgba(50,62,72,0.4)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-6, -34); c.quadraticCurveTo(0, -22, -9, -6); c.stroke(); c.beginPath(); c.moveTo(24, -30); c.quadraticCurveTo(20, -22, 27, -13); c.stroke();
        [[-28, -20, 4.5, '#cfc77e'], [-22, -17, 2.6, '#dcd693'], [14, -26, 3.6, '#cfc77e'], [30, -17, 2.4, '#b9c98b'], [-2, -13, 2, '#dcd693'], [38, -22, 5.5, 'rgba(126,166,96,0.85)'], [43, -17, 3.4, 'rgba(126,166,96,0.85)']].forEach(k => oval(c, k[0], k[1], k[2], k[2] * 0.7, k[3]));
        // the hare: out from the chamber, away in three bounds
        if (this.hare) {
          const u = this.hare, x = this.dir * (u * 95), hop = Math.abs(Math.sin(u * Math.PI * 5)) * 7, a = Math.min(1, u * 8) * Math.min(1, (1 - u) * 5);
          c.globalAlpha = a; oval(c, x + 2, 36, 8, 2.4, shade(0.25));
          c.save(); c.translate(x, 30 - hop); c.scale(this.dir, 1); c.rotate(-0.25 * Math.cos(u * Math.PI * 5));
          fillPath(c, HARE, '#b08a62'); oval(c, -9.5, -1, 2.4, 2.2, '#f6f1e6'); oval(c, 9.5, -2.5, 4, 3.2, '#b08a62');
          c.save(); c.translate(8, -5); c.rotate(-0.9); oval(c, -4, 0, 5.5, 1.5, '#9c7852'); oval(c, -4, 2.4, 5.5, 1.4, '#b08a62'); c.restore(); disc(c, 11, -3, 0.7, '#1c1410');
          c.restore(); c.globalAlpha = 1;
        }
      });
    }
  };
})(window.Harbour);
