// A puffin standing on the cliff top: black back, white front, and that great striped beak.
// It looks about and shuffles. Click it (or frighten it) and it whirrs out over the sea and back to its spot.
// new H.Puffin(world, { x, y, flip })   flip: faces left instead of right. Place a few together near the shore.
(function (H) {
  'use strict';
  const { TAU, disc, oval, shade, fillPath } = H, U = 0.00028;
  const BEAK = new Path2D('M12,-21 C19,-22.5 26,-19.5 28,-14.5 C24,-11 18,-10 12,-11 Z');
  const BEAK_BASE = new Path2D('M12,-21 C14.5,-21.6 16.5,-21.4 18,-20.8 L17.2,-10.4 C15.2,-10.3 13.5,-10.6 12,-11 Z');
  const WING = new Path2D('M-8,-8 C-15,-2 -17,10 -12,20 C-7,17 -3,10 -2,0 C-2,-4 -4,-7 -8,-8 Z');
  const FOOT = new Path2D('M0,0 L7,2.5 L4.5,3.6 L8,6 L4,6.2 L5,9 L-1,5 Z');
  H.Puffin = class extends H.Entity {
    static passes = { upright: 'draw', birds: 'drawFlying' };
    static clicks = 'one';
    static sound = 'puffin';
    constructor(world, o) { super(world); this.x = this.hx = o.x; this.y = this.hy = o.y; this.flip = o.flip ? -1 : 1; this.fly = 0; this.seed = Math.random() * 9; this.a = 0; this.out = [1, 0]; }
    hit(x, y) { return !this.fly && Math.hypot(this.x - x, this.y - 0.006 - y) < 0.014; }
    click() { this.takeOff(); }
    onScare(x, y, reach) { if (Math.hypot(this.x - x, this.y - y) < reach * 0.5) this.takeOff(); }
    takeOff() { if (this.fly) return; const g = this.world.grad(this.hx, this.hy); this.out = [g.gx, g.gy]; this.fly = 0.001; this.span = 5 + Math.random() * 2.5; this.world.burst(this.hx, this.hy, 3, 0.02, '255,255,255', 0.0012, 0.5); }
    update(dt) {
      if (!this.fly) { if (Math.sin(this.world.clock * 0.31 + this.seed) > 0.995) this.flip = -this.flip; return; }
      this.fly += dt / this.span;
      if (this.fly >= 1) { this.fly = 0; this.x = this.hx; this.y = this.hy; return; }
      // a long loop: out over the sea and round again
      const g = this.fly * TAU, far = 0.11 * (1 - Math.cos(g)) / 2, wide = 0.05 * Math.sin(g), px = this.x, py = this.y;
      this.x = this.hx + this.out[0] * far - this.out[1] * wide; this.y = this.hy + this.out[1] * far + this.out[0] * wide;
      this.a = Math.atan2(this.y - py, this.x - px);
    }
    draw(c, t) {
      if (this.fly) return;
      const bob = Math.sin(t * 1.7 + this.seed) * 0.6, peer = Math.sin(t * 0.9 + this.seed * 2) * 0.12;
      oval(c, this.x + 0.0024, this.y + 0.0012, 0.0056, 0.0026, shade(0.24));
      H.sprite(c, this.x, this.y - 0.0064, 0, U, () => {
        c.scale(this.flip, 1);
        [[-3, 18], [6, 19]].forEach(k => { c.save(); c.translate(k[0], k[1]); fillPath(c, FOOT, '#f08a2e'); c.restore(); });
        oval(c, 0, 2 + bob * 0.3, 14.5, 19, '#17191d');                       // back
        oval(c, 5.5, 5 + bob * 0.3, 9.5, 14.5, '#fbfaf5'); oval(c, 8, 9, 6, 9, 'rgba(190,200,210,0.35)');   // white front, shaded low
        fillPath(c, WING, '#22252b'); c.strokeStyle = 'rgba(120,135,150,0.5)'; c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-9, -3); c.quadraticCurveTo(-13, 6, -10, 15); c.stroke();
        c.translate(3, -15 + bob); c.rotate(peer); c.translate(-3, 15);
        disc(c, 3, -16, 10.2, '#17191d');                                      // head
        oval(c, 7.5, -15, 7.4, 7.8, '#efece4'); oval(c, 9, -12.5, 5, 4, 'rgba(160,165,170,0.35)');          // pale cheek
        fillPath(c, BEAK, '#ef5a2c'); fillPath(c, BEAK_BASE, '#4f6079');
        c.strokeStyle = '#ffd866'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(18, -20.9); c.lineTo(17.2, -10.4); c.stroke();
        c.strokeStyle = 'rgba(150,30,10,0.5)'; c.lineWidth = 0.6; [21, 24].forEach(x => { c.beginPath(); c.moveTo(x, -20.6 + (x - 21) * 0.5); c.quadraticCurveTo(x + 1, -15, x - 0.6, -10.6 - (x - 21) * 0.25); c.stroke(); });
        c.strokeStyle = 'rgba(60,20,10,0.6)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(12.5, -15.2); c.lineTo(27.4, -14.8); c.stroke();
        disc(c, 12.2, -11.2, 1.3, '#ffcf4a');                                  // the rosette at the corner of the beak
        c.fillStyle = '#3b4a5c'; c.beginPath(); c.moveTo(6.5, -19.6); c.lineTo(11, -17.6); c.lineTo(6.5, -16.6); c.closePath(); c.fill();
        disc(c, 8.6, -18, 1.9, '#c8392b'); disc(c, 8.6, -18, 1.25, '#111316'); disc(c, 9, -18.5, 0.4, '#ffffff');
      });
    }
    drawFlying(c, t) {
      if (!this.fly) return;
      const beat = Math.sin(t * 55);
      oval(c, this.x + 0.012, this.y + 0.017, 0.0064, 0.0028, shade(0.16), this.a);
      H.sprite(c, this.x, this.y, this.a, U * 1.1, () => {
        [-1, 1].forEach(s => { oval(c, -1, s * 12, 5, 11 + beat * 2, 'rgba(23,25,29,0.55)', s * 0.25); oval(c, -1, s * 10, 4, 8, '#17191d', s * (0.25 + beat * 0.3)); });
        fillPath(c, new Path2D('M-16,-3 L-24,-4.5 L-24,-1.5 Z M-16,3 L-24,4.5 L-24,1.5 Z'), '#f08a2e');   // feet trailing
        oval(c, -2, 0, 14, 6.5, '#17191d'); oval(c, 9, 0, 6.5, 6, '#17191d'); oval(c, 10.5, -3.6, 3.4, 2.4, '#efece4'); oval(c, 10.5, 3.6, 3.4, 2.4, '#efece4');
        c.fillStyle = '#ef5a2c'; c.beginPath(); c.moveTo(14, -2.6); c.quadraticCurveTo(21, -1.5, 22, 0); c.quadraticCurveTo(21, 1.5, 14, 2.6); c.closePath(); c.fill(); oval(c, 14.6, 0, 1.2, 2.6, '#4f6079');
      });
    }
  };
})(window.Harbour);
