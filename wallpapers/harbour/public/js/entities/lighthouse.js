// The lighthouse, seen from slightly to the south like the houses: a banded tower that narrows towards the lantern.
// Click it to switch the light on or off.
(function (H) {
  'use strict';
  const { TAU, disc, oval, lerp } = H;
  const TALL = 0.03, R0 = 0.0098, R1 = 0.0064, SLICES = 36;
  H.Lighthouse = class extends H.Entity {
    static passes = { upright: 'draw', air: 'drawBeam' };
    static clicks = 'one';
    static sound = 'horn';
    constructor(world, x, y) { super(world); this.x = x; this.y = y; this.off = false; }
    hit(x, y) { return Math.abs(x - this.x) < 0.014 && y > this.y - TALL - 0.014 && y < this.y + 0.013; }
    click() { this.off = !this.off; }
    draw(c) {
      const x = this.x, y = this.y, top = y - TALL;
      // the shadow lies across the rocks, away from the sun
      c.strokeStyle = H.shade(0.2); c.lineWidth = R0 * 1.7; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 0.004, y + 0.004); c.lineTo(x + 0.026, y + 0.03); c.stroke();
      // stone plinth
      oval(c, x, y + 0.0022, 0.0145, 0.0118, '#7f8a90'); oval(c, x, y, 0.0145, 0.0118, '#aab3b7'); oval(c, x - 0.001, y - 0.001, 0.0125, 0.0098, '#c4cbce');
      // the tower: stacked rounds, red and white bands, then one wash of light and shade across it
      c.save(); c.beginPath();
      for (let i = 0; i <= SLICES; i++) { const u = i / SLICES; c.moveTo(x + lerp(R0, R1, u), y - TALL * u); c.arc(x, y - TALL * u, lerp(R0, R1, u), 0, TAU); }
      c.clip();
      for (let i = 0; i <= SLICES; i++) { const u = i / SLICES; disc(c, x, y - TALL * u, lerp(R0, R1, u), Math.floor(u * 4.999) % 2 ? '#fbf7ee' : '#d8493b'); }
      const wash = c.createLinearGradient(x - R0, 0, x + R0, 0); wash.addColorStop(0, 'rgba(255,255,255,0.22)'); wash.addColorStop(0.45, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(22,48,70,0.3)');
      c.fillStyle = wash; c.fillRect(x - 0.02, top - 0.02, 0.04, TALL + 0.04);
      c.restore();
      disc(c, x, top, R1, '#f3eee3');
      // a small door at the foot
      c.fillStyle = '#3d5564'; H.rrect(c, x - 0.0014, y + 0.0048, 0.0028, 0.0042, 0.0012); c.fill();
      // gallery, lantern and roof
      disc(c, x, top + 0.0012, 0.0088, '#2f3b45'); disc(c, x, top, 0.0088, '#4c5a65'); disc(c, x, top - 0.0004, 0.0074, '#69777f');
      const glass = this.off ? '#aebac2' : '#ffe9a3';
      for (let i = 0; i <= 9; i++) disc(c, x, top - 0.0008 - i * 0.0008, 0.0044, i === 9 ? glass : (this.off ? '#93a0a9' : '#f6cf6a'));
      c.strokeStyle = '#3a4650'; c.lineWidth = 0.0005; [-0.0024, 0, 0.0024].forEach(dx => { c.beginPath(); c.moveTo(x + dx, top - 0.0006); c.lineTo(x + dx, top - 0.0078); c.stroke(); });
      disc(c, x, top - 0.0078, 0.0054, '#a8332b');   // the roof: a low cone, a rim and a point
      for (let i = 0; i <= 5; i++) disc(c, x - i * 0.00012, top - 0.0084 - i * 0.0008, 0.005 - i * 0.0008, i < 2 ? '#c93f33' : i < 4 ? '#dc5445' : '#ec7260');
      disc(c, x, top - 0.0132, 0.0007, '#2f3b45');
    }
    drawBeam(c, t) {
      if (this.off) return;
      const y = this.y - TALL - 0.003;
      c.save(); c.globalCompositeOperation = 'lighter';
      const glow = c.createRadialGradient(this.x, y, 0, this.x, y, 0.022); glow.addColorStop(0, 'rgba(255,236,170,0.45)'); glow.addColorStop(1, 'rgba(255,236,170,0)');
      c.fillStyle = glow; c.fillRect(this.x - 0.022, y - 0.022, 0.044, 0.044);
      c.translate(this.x, y); c.rotate(t * 0.6);
      const beam = c.createLinearGradient(0, 0, 0.22, 0); beam.addColorStop(0, 'rgba(255,236,170,0.34)'); beam.addColorStop(1, 'rgba(255,236,170,0)');
      c.fillStyle = beam; c.beginPath(); c.moveTo(0, 0); c.lineTo(0.22, -0.045); c.lineTo(0.22, 0.045); c.closePath(); c.fill(); c.restore();
    }
  };
})(window.Harbour);
