// Chimney smoke: a plume of puffs that rise, swell, curl and lean with the wind.
// Painted like a small cloud: a cool underside first, then the warm white on top, so the puffs merge into one shape.
(function (H) {
  'use strict';
  const { TAU, disc } = H, LIFE = 6.5, GAP = 0.5;
  H.Smoke = class extends H.Entity {
    static passes = { air: 'draw' };
    constructor(world, x, y, on) {
      super(world); this.x = x; this.y = y; this.on = on; this.puffs = []; this.next = Math.random() * GAP;
      if (on) for (let age = LIFE - 0.1; age > 0; age -= GAP) this.puffs.push(this.puff(age));   // already drifting when the scene opens
    }
    puff(age) { return { age: age, seed: Math.random() * TAU, side: Math.random() - 0.5, size: 0.8 + Math.random() * 0.45 }; }
    update(dt) {
      if (this.on) { this.next -= dt; if (this.next <= 0) { this.next = GAP * (0.75 + Math.random() * 0.5); this.puffs.push(this.puff(0)); } }
      this.puffs.forEach(p => { p.age += dt; });
      if (this.puffs.length && this.puffs[0].age > LIFE) this.puffs.shift();
    }
    draw(c) {
      const w = this.world.wind, shapes = [];
      this.puffs.forEach(p => {
        const k = p.age / LIFE, rise = 0.024 * (1 - Math.exp(-k * 2.4)), drift = 0.062 * Math.pow(k, 1.35);
        const x = this.x + w[0] * drift + Math.sin(p.seed + p.age * 0.9) * 0.004 * k + p.side * 0.007 * k;
        const y = this.y - rise + w[1] * drift + Math.cos(p.seed * 1.7 + p.age * 0.7) * 0.0025 * k;
        shapes.push({ p: p, x: x, y: y, r: (0.0017 + 0.0078 * Math.pow(k, 0.7)) * p.size, a: Math.min(1, k * 14) * Math.pow(1 - k, 1.5), rise: rise });
      });
      const lobes = (s, dx, dy, m, col) => { for (let j = 0; j < 3; j++) { const ang = s.p.seed + j * 2.1 + s.p.age * 0.22; disc(c, s.x + Math.cos(ang) * s.r * 0.46 + dx * s.r, s.y + Math.sin(ang) * s.r * 0.36 + dy * s.r, s.r * m, col); } };
      shapes.forEach(s => lobes(s, 0.17, 0.24, 0.76, 'rgba(166,183,208,' + (0.62 * s.a) + ')'));
      shapes.forEach(s => lobes(s, 0, 0, 0.72, 'rgba(255,251,243,' + (0.9 * s.a) + ')'));
      shapes.forEach(s => disc(c, s.x - s.r * 0.22, s.y - s.r * 0.26, s.r * 0.42, 'rgba(255,255,255,' + (0.55 * s.a) + ')'));
    }
  };
})(window.Harbour);
