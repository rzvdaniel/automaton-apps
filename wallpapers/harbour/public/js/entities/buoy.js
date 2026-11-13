// A red channel buoy rocking on the swell, its lamp blinking, its reflection wobbling on the water.
// Click it and it rocks hard and throws a ring of ripples.
// new H.Buoy(world, { x, y })   Place it in open water, off the harbour mouth.
(function (H) {
  'use strict';
  const { TAU, disc, oval, fillPath } = H, U = 0.00023;
  const TOWER = new Path2D('M-12,6 C-10,-6 -5.5,-22 -3.6,-30 L3.6,-30 C5.5,-22 10,-6 12,6 C6,10.5 -6,10.5 -12,6 Z');
  H.Buoy = class extends H.Entity {
    static clicks = 'one';
    constructor(world, o) { super(world); this.x = o.x; this.y = o.y; this.rock = 0; this.seed = Math.random() * 9; }
    hit(x, y) { return Math.hypot(this.x - x, this.y - 0.004 - y) < 0.012; }
    click() { this.rock = 1; this.world.ripple(this.x, this.y, 0.8); this.world.sound.plop(); }
    update(dt) { this.rock = Math.max(0, this.rock - dt * 0.45); }
    draw(c, t) {
      const lean = (0.1 + 0.4 * this.rock) * Math.sin(t * (1.3 + this.rock * 4) + this.seed), heave = Math.sin(t * 0.9 + this.seed) * 1.6, lit = (t * 0.5 + this.seed) % 2 < 0.35;
      H.sprite(c, this.x, this.y, 0, U, () => {
        // its reflection, broken by the ripples, and the foam it stirs
        for (let i = 0; i < 6; i++) oval(c, Math.sin(t * 2 + i * 1.3) * (1.5 + i * 0.6) - lean * i * 2, 16 + i * 4.4, 9 - i * 1.1, 1.5, 'rgba(200,50,40,' + (0.3 - i * 0.04) + ')');
        for (let i = 0; i < 2; i++) { const p = (t * 0.35 + this.seed + i * 0.5) % 1; c.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - p)) + ')'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 9, 16 + p * 26, 6 + p * 10, 0, 0, TAU); c.stroke(); }
        oval(c, 0, 10, 18, 6.5, 'rgba(255,255,255,0.55)');
        c.translate(0, 8 + heave); c.rotate(lean); c.translate(0, -8);
        // the float, the tapering tower with its white band, the lamp in its cage
        oval(c, 0, 8.5, 16, 6.6, '#8e221a'); oval(c, 0, 6, 16, 6.6, '#c5372b'); oval(c, -1, 4.6, 12.5, 4.6, '#dc4e40');
        fillPath(c, TOWER, '#d9402f');
        c.save(); c.clip(TOWER);
        c.fillStyle = '#fbf6ea'; c.fillRect(-14, -16, 28, 8);
        const round = c.createLinearGradient(-12, 0, 12, 0); round.addColorStop(0, 'rgba(255,255,255,0.35)'); round.addColorStop(0.4, 'rgba(255,255,255,0)'); round.addColorStop(1, 'rgba(50,8,20,0.45)');
        c.fillStyle = round; c.fillRect(-14, -32, 28, 44);
        c.restore();
        oval(c, 0, -30, 3.6, 1.4, '#a82c22');
        c.strokeStyle = '#3a4650'; c.lineWidth = 0.9; c.lineCap = 'round'; [-3.2, 0, 3.2].forEach(x => { c.beginPath(); c.moveTo(x, -30); c.lineTo(x * 0.8, -40); c.stroke(); }); c.beginPath(); c.moveTo(-2.8, -40); c.lineTo(2.8, -40); c.stroke();
        disc(c, 0, -35, 2.5, lit ? '#fff6c2' : '#e9d98a'); disc(c, 0, -41.5, 1.5, '#d9402f');
        if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(0, -35, 0, 0, -35, 16); g.addColorStop(0, 'rgba(255,240,170,0.75)'); g.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = g; c.fillRect(-16, -51, 32, 32); c.restore(); }
      });
    }
  };
})(window.Harbour);
