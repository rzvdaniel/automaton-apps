// Gulls: loners that wander the sky, and a loose flock that travels together. Both veer away from a fright.
(function (H) {
  'use strict';
  const { TAU, disc } = H;
  // A gull from above: a small body and two long wings swept back in one curve, white at the root, grey, then dark tips.
  H.drawGull = (c, x, y, a, sz, flap, flat) => {
    c.save(); c.translate(x, y); c.rotate(a);
    [-1, 1].forEach(s => {
      const tx = -0.46 * sz, ty = s * sz * flap; let fill = flat;
      if (!fill) { fill = c.createLinearGradient(0, 0, tx * 0.5, ty); fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.3, '#ffffff'); fill.addColorStop(0.46, '#c6ced8'); fill.addColorStop(0.83, '#adb7c3'); fill.addColorStop(0.88, '#30363d'); fill.addColorStop(1, '#30363d'); }
      c.fillStyle = fill; c.beginPath(); c.moveTo(0.17 * sz, 0);
      c.quadraticCurveTo(0.36 * sz, s * 0.56 * sz * flap, tx, ty); c.quadraticCurveTo(0.04 * sz, s * 0.5 * sz * flap, -0.15 * sz, 0); c.closePath(); c.fill();
    });
    c.fillStyle = flat || '#ffffff';
    c.beginPath(); c.moveTo(-0.2 * sz, 0); c.lineTo(-0.5 * sz, -0.1 * sz); c.lineTo(-0.44 * sz, 0); c.lineTo(-0.5 * sz, 0.1 * sz); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0.02 * sz, 0, 0.3 * sz, 0.09 * sz, 0, 0, TAU); c.fill();
    if (!flat) { disc(c, 0.3 * sz, 0, 0.085 * sz, '#ffffff'); c.fillStyle = '#f2b030'; c.beginPath(); c.moveTo(0.36 * sz, -0.04 * sz); c.lineTo(0.52 * sz, 0); c.lineTo(0.36 * sz, 0.04 * sz); c.closePath(); c.fill(); }
    c.restore();
  };
  const shadow = (c, b) => H.drawGull(c, b.x + 0.02, b.y + 0.028, b.a, 0.0125, 0.85, H.shade(0.18));
  const bird = (c, b) => H.drawGull(c, b.x, b.y, b.a, 0.014, 0.82 + 0.18 * Math.sin(b.ph), null);

  H.Gull = class extends H.Entity {
    static passes = { skyShadow: 'drawShadow', birds: 'draw' };
    constructor(world, x, y, a) { super(world); this.x = x; this.y = y; this.a = a; this.v = 0.05 + Math.random() * 0.04; this.ph = Math.random() * 6; this.rush = 0; }
    onScare(x, y, reach) { if (Math.hypot(this.x - x, this.y - y) < reach) { this.a = Math.atan2(this.y - y, this.x - x); this.rush = 1.5; this.world.sound.gull(); } }
    update(dt) {
      const hw = this.world.hw, hh = this.world.hh;
      this.rush = Math.max(0, this.rush - dt);
      this.a += Math.sin(this.ph * 0.3) * 0.15 * dt;
      this.ph += dt * 5 * (1 + this.rush);
      const v = this.v * (1 + 4 * this.rush / 1.5); this.x += Math.cos(this.a) * v * dt; this.y += Math.sin(this.a) * v * dt;
      if (this.x > hw + 0.1) this.x = -hw - 0.1; if (this.x < -hw - 0.1) this.x = hw + 0.1; if (this.y > hh + 0.1) this.y = -hh - 0.1; if (this.y < -hh - 0.1) this.y = hh + 0.1;
    }
    drawShadow(c) { shadow(c, this); }
    draw(c) { bird(c, this); }
  };

  // The flock has a wandering centre; each bird mills around its own spot near it and drifts back after a fright.
  H.GullFlock = class extends H.Entity {
    static passes = { skyShadow: 'drawShadow', birds: 'draw' };
    constructor(world, G) {
      super(world); this.x = (G() - 0.5) * 2 * world.hw; this.y = (G() - 0.5) * 2 * world.hh; this.a = G() * TAU; this.ph = G() * 9; this.birds = [];
      for (let i = 5 + Math.floor(G() * 5); i > 0; i--) this.birds.push({ x: this.x, y: this.y, vx: 0, vy: 0, a: this.a, free: 0, ph: G() * 6, rx: -0.07 + G() * 0.12, ry: -0.06 + G() * 0.12, w: 0.3 + G() * 0.5, p: G() * TAU });
    }
    onScare(x, y, reach) {
      let any = false;
      this.birds.forEach(b => { const d = Math.hypot(b.x - x, b.y - y) || 0.001; if (d < reach) { b.vx += (b.x - x) / d * 0.3; b.vy += (b.y - y) / d * 0.3; b.free = 2.5; any = true; } });
      if (any) this.world.sound.gull();
    }
    update(dt) {
      const hw = this.world.hw, hh = this.world.hh;
      this.ph += dt; this.a += Math.sin(this.ph * 0.23) * 0.12 * dt; this.x += Math.cos(this.a) * 0.045 * dt; this.y += Math.sin(this.a) * 0.045 * dt;
      let jx = 0, jy = 0;
      if (this.x > hw + 0.3) jx = -2 * hw - 0.6; if (this.x < -hw - 0.3) jx = 2 * hw + 0.6; if (this.y > hh + 0.3) jy = -2 * hh - 0.6; if (this.y < -hh - 0.3) jy = 2 * hh + 0.6;
      this.x += jx; this.y += jy;
      const ca = Math.cos(this.a), sa = Math.sin(this.a);
      this.birds.forEach(b => {
        b.x += jx; b.y += jy; b.free = Math.max(0, b.free - dt); b.ph += dt * (b.free > 0 ? 9 : 4.5);
        const ox = b.rx + 0.035 * Math.sin(this.ph * b.w + b.p), oy = b.ry + 0.035 * Math.cos(this.ph * b.w * 1.3 + b.p), tx = this.x + ox * ca - oy * sa, ty = this.y + ox * sa + oy * ca, pull = Math.min(1, dt * (b.free > 0 ? 0.25 : 0.9));
        const px = b.x, py = b.y, damp = Math.exp(-dt * 1.4);
        b.vx *= damp; b.vy *= damp; b.x += (tx - b.x) * pull + b.vx * dt; b.y += (ty - b.y) * pull + b.vy * dt;
        b.a += H.angDiff(Math.atan2(b.y - py + sa * 0.0004, b.x - px + ca * 0.0004), b.a) * Math.min(1, dt * 6);
      });
    }
    drawShadow(c) { this.birds.forEach(b => shadow(c, b)); }
    draw(c) { this.birds.forEach(b => bird(c, b)); }
  };
})(window.Harbour);
