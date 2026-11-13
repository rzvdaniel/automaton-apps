// A seal hauled out on a rock or the sand. It dozes, breathes and now and then lifts its head.
// Click it and it wriggles down to the sea, swims about with just its head showing, then comes back to its spot.
// new H.Seal(world, { x, y, a, kind })   kind: 'grey', 'brown' or 'pup' (white and fluffy). Place it on land within reach of the water.
(function (H) {
  'use strict';
  const { TAU, disc, oval, shade, fillPath } = H, U = 0.0002;
  const BODY = new Path2D('M46,-2 C46,-12 36,-17 24,-17 C6,-18 -14,-16 -30,-10 C-38,-7 -46,-3 -52,2 C-46,6 -38,9 -30,11 C-14,15 6,18 24,16 C36,15 46,8 46,-2 Z');
  const FORE = new Path2D('M-4,0 C4,1 12,7 15,17 C9,17 2,13 -5,6 Z');
  const HIND = new Path2D('M2,0 C-8,-7 -17,-9 -24,-6 C-19,-3 -14,-1 -10,1 C-14,2 -19,5 -23,10 C-16,11 -7,7 2,3 Z');
  const SHEEN = new Path2D('M-30,-8 C-12,-13 8,-14 28,-12');
  const COATS = {
    grey: { light: '#c9cfd3', base: '#8f979e', dark: '#626a73', spot: 'rgba(70,78,88,0.55)', flipper: '#5b636c' },
    brown: { light: '#d2c2ab', base: '#9c866a', dark: '#6c5943', spot: 'rgba(84,66,46,0.5)', flipper: '#5f4d3a' },
    pup: { light: '#ffffff', base: '#f4f0e7', dark: '#d3ccbd', spot: null, flipper: '#c9c1b1' }
  };

  H.Seal = class extends H.Entity {
    static clicks = 'one';
    constructor(world, o) {
      super(world); this.x = this.hx = o.x; this.y = this.hy = o.y; this.a = this.ha = o.a || 0; this.kind = o.kind || 'grey';
      this.state = 'bask'; this.seed = Math.random() * 9; this.timer = 0; this.look = 0;
      this.spots = []; for (let i = 0; i < 16; i++) this.spots.push([-40 + Math.random() * 74, -13 + Math.random() * 26, 1.6 + Math.random() * 3.4, Math.random() * TAU]);
    }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.016; }
    click() { if (this.state === 'bask') this.state = 'flee'; else this.look = 1; }
    get wet() { return this.world.field(this.x, this.y) > 0.004; }
    update(dt) {
      const w = this.world, turn = (to, rate) => { this.a += H.angDiff(to, this.a) * Math.min(1, dt * rate); };
      this.look = Math.max(0, this.look - dt * 0.6);
      if (this.state === 'bask') { if (Math.sin(w.clock * 0.13 + this.seed) > 0.97) this.look = 1; return; }
      const g = w.grad(this.x, this.y), go = v => { this.x += Math.cos(this.a) * v * dt; this.y += Math.sin(this.a) * v * dt; };
      if (this.state === 'flee') {   // down the shore, belly first
        turn(Math.atan2(g.gy, g.gx) + 0.25 * Math.sin(w.clock * 9), 6); go(0.028);
        if (g.d > 0.03) { this.state = 'swim'; this.timer = 12 + Math.random() * 10; w.ripple(this.x, this.y, 0.7); w.burst(this.x, this.y, 10, 0.05, '255,255,255', 0.003, 0.8); w.sound.plop(); }
      } else if (this.state === 'swim') {
        let to = this.a + Math.sin(w.clock * 0.6 + this.seed) * 0.8;
        if (g.d < 0.03) to = Math.atan2(g.gy, g.gx); else if (g.d > 0.09) to = Math.atan2(-g.gy, -g.gx);
        turn(to, 1.5); go(0.011); this.timer -= dt; if (this.timer <= 0) this.state = 'home';
      } else {   // back to its spot
        const dx = this.hx - this.x, dy = this.hy - this.y, d = Math.hypot(dx, dy);
        if (d < 0.002) { this.state = 'bask'; this.a = this.ha; return; }
        turn(Math.atan2(dy, dx) + (this.wet ? 0 : 0.2 * Math.sin(w.clock * 8)), 4); go(Math.min(d / dt, this.wet ? 0.014 : 0.012));
      }
    }
    face(c, coat) {
      oval(c, 42, -1, 12.5, 11, coat.base); oval(c, 40, -3, 9, 7, coat.light);
      oval(c, 52, -1, 6, 5.2, coat.light); oval(c, 53, 0.5, 5, 3.6, coat.kind === 'pup' ? '#efe9dc' : coat.base);
      c.fillStyle = '#23262b'; c.beginPath(); c.moveTo(55.5, -2.6); c.quadraticCurveTo(59.5, -1, 55.5, 1.2); c.quadraticCurveTo(54, -0.8, 55.5, -2.6); c.fill();
      const big = this.kind === 'pup' ? 2.6 : 2.1;
      [-7, 5].forEach(y => { disc(c, 45, y, big, '#17191d'); disc(c, 45.7, y - 0.8, big * 0.32, 'rgba(255,255,255,0.9)'); });
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.5; c.lineCap = 'round';
      [[53, -3.5, 61, -10], [53.5, -2.8, 62.5, -6.5], [53, 2.5, 61, 9], [53.5, 1.8, 62.5, 5.5]].forEach(k => { c.beginPath(); c.moveTo(k[0], k[1]); c.lineTo(k[2], k[3]); c.stroke(); });
    }
    draw(c, t) {
      const coat = Object.assign({ kind: this.kind }, COATS[this.kind]), breathe = 1 + 0.035 * Math.sin(t * 1.4 + this.seed), size = U * (this.kind === 'pup' ? 0.72 : 1);
      if (this.wet) {   // swimming: head and shoulders, the rest a shape under the water
        for (let i = 0; i < 2; i++) { const p = (t * 0.45 + this.seed + i * 0.5) % 1; c.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - p)) + ')'; c.lineWidth = 0.0007; c.beginPath(); c.ellipse(this.x, this.y, 0.004 + p * 0.011, 0.003 + p * 0.008, 0, 0, TAU); c.stroke(); }
        H.sprite(c, this.x, this.y + Math.sin(t * 2 + this.seed) * 0.0004, this.a, size, () => { oval(c, 6, 0, 34, 13, shade(0.3)); oval(c, 30, -1, 13, 11, coat.dark); this.face(c, coat); });
        return;
      }
      const moving = this.state !== 'bask', hump = moving ? 1 + 0.08 * Math.sin(t * 16) : 1;
      oval(c, this.x + 0.002, this.y + 0.003, 0.0105, 0.0042, shade(0.22), this.a);
      H.sprite(c, this.x, this.y, this.a, size, () => {
        c.scale(hump, breathe / hump);
        c.save(); c.translate(-52, 2); c.rotate(0.12 * Math.sin(t * (moving ? 14 : 0.9) + this.seed)); fillPath(c, HIND, coat.flipper); c.restore();
        [-1, 1].forEach(s => { c.save(); c.translate(18, s * 15); c.scale(1, s); c.rotate(moving ? 0.35 * Math.sin(t * 16) : 0.05); fillPath(c, FORE, coat.flipper); c.restore(); });
        // the body: light along the back, dark towards the ground, spots, and the wet shine
        c.save(); c.clip(BODY);
        const fur = c.createLinearGradient(-10, -18, 6, 18); fur.addColorStop(0, coat.light); fur.addColorStop(0.45, coat.base); fur.addColorStop(1, coat.dark);
        c.fillStyle = fur; c.fillRect(-60, -24, 120, 48);
        if (coat.spot) this.spots.forEach(k => oval(c, k[0], k[1], k[2], k[2] * 0.62, coat.spot, k[3]));
        oval(c, -4, 17, 46, 6, 'rgba(20,34,48,0.2)');
        c.restore();
        c.lineCap = 'round'; H.strokePath(c, SHEEN, 'rgba(255,255,255,' + (this.kind === 'pup' ? 0.5 : 0.38) + ')', 2.4);
        c.save(); c.translate(38, -1); c.rotate(-0.5 * this.look * Math.sin(this.look * 3.1)); c.translate(-38, 1); this.face(c, coat); c.restore();
      });
    }
  };
})(window.Harbour);
