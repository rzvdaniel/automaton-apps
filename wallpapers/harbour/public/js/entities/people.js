// The islanders: people standing about, walkers on the roads, parasols on the beach and the harbour cat.
(function (H) {
  'use strict';
  const { disc, oval, shade, TAU } = H;
  const COATS = ['#2fa7a0', '#e2553f', '#3f6fb5', '#f3c148'];
  H.drawPerson = (c, x, y, n, lift) => {
    oval(c, x + 0.0012, y + 0.0018, 0.0019, 0.0026, shade(0.24));
    oval(c, x, y - lift, 0.0018, 0.0025, COATS[n % 4]); disc(c, x, y - lift - 0.0006, 0.0014, n % 3 ? '#f3e2b3' : '#6b4a32');
  };

  // Stands in one place; hops when clicked.
  H.Person = class extends H.Entity {
    static clicks = 'many';
    static sound = 'hello';
    constructor(world, x, y, col) { super(world); this.x = x; this.y = y; this.col = col; this.hop = 0; }
    update(dt) { this.hop = Math.max(0, this.hop - dt); }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.014; }
    click() { this.hop = 1.2; }
    draw(c) { H.drawPerson(c, this.x, this.y, this.col, this.hop > 0 ? Math.abs(Math.sin(this.hop * 14)) * 0.003 : 0); }
  };

  // Walks a road end to end and back; hurries when clicked.
  H.Walker = class extends H.Entity {
    static clicks = 'many';
    static sound = 'hello';
    constructor(world, o) { super(world); Object.assign(this, o); this.rush = 0; this.x = this.y = 0; this.place(); }   // o: road, s, dir, speed, col
    place() { const r = this.road, n = Math.min(r.length - 2, Math.floor(this.s)), u = this.s - n; this.x = r[n][0] + (r[n + 1][0] - r[n][0]) * u + 0.003; this.y = r[n][1] + (r[n + 1][1] - r[n][1]) * u + 0.002; }
    update(dt) {
      this.rush = Math.max(0, this.rush - dt);
      this.s += this.dir * this.speed * (this.rush > 0 ? 5 : 1) * dt / 0.01;
      if (this.s >= this.road.length - 1) { this.s = this.road.length - 1; this.dir = -1; } if (this.s <= 0) { this.s = 0; this.dir = 1; }
      this.place();
    }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.016; }
    click() { this.rush = 2.5; }
    draw(c, t) { H.drawPerson(c, this.x, this.y, this.col, Math.abs(Math.sin(t * (this.rush > 0 ? 20 : 7) + this.col)) * 0.0008); }
  };

  H.Parasol = class extends H.Entity {
    static clicks = 'many';
    static sound = 'flap';
    constructor(world, o) { super(world); Object.assign(this, o); this.pop = 0; }   // o: x, y, col, rot
    update(dt) { this.pop = Math.max(0, this.pop - dt * 0.8); this.rot += this.pop * dt * 9; }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.012; }
    click() { this.pop = 1; }
    draw(c) {
      const r = 0.0078 * (1 + 0.2 * this.pop * Math.sin(this.pop * 10)), x = this.x, y = this.y - 0.002;
      c.fillStyle = '#f7f3ea'; c.fillRect(x + 0.007, this.y - 0.002, 0.0045, 0.009);
      disc(c, x + 0.0034, this.y + 0.0042, r, shade(0.24));
      for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, this.rot + i * 0.7854, this.rot + (i + 1) * 0.7854); c.closePath(); c.fillStyle = i % 2 ? '#fff4e6' : this.col; c.fill(); }
      disc(c, x, y, 0.0009, '#fffdf8');
    }
  };

  // Lives on the pier; click it and it trots to the other end.
  H.Cat = class extends H.Entity {
    static clicks = 'one';
    static sound = 'meow';
    constructor(world) { super(world); const p = world.map.pier; this.x = p[1][0]; this.y = p[1][1]; this.end = 1; this.moving = false; this.a = 0; }
    hit(x, y) { return Math.hypot(this.x - x, this.y - y) < 0.014; }
    click() { this.end = this.end ? 0 : 1; }
    update(dt) {
      const goal = this.world.map.pier[this.end], dx = goal[0] - this.x, dy = goal[1] - this.y, d = Math.hypot(dx, dy);
      this.moving = d > 0.002; if (this.moving) { const s = Math.min(d, 0.07 * dt); this.x += dx / d * s; this.y += dy / d * s; this.a = Math.atan2(dy, dx); }
    }
    draw(c, t) {
      c.save(); c.translate(this.x, this.y); oval(c, 0.001, 0.0014, 0.0034, 0.0024, shade(0.24)); c.rotate(this.a);
      c.strokeStyle = '#1d1d22'; c.lineWidth = 0.0009; c.beginPath(); c.moveTo(-0.0025, 0); c.quadraticCurveTo(-0.005, 0, -0.006, Math.sin(t * (this.moving ? 12 : 2)) * 0.002); c.stroke();
      oval(c, 0, 0, 0.0032, 0.0021, '#1d1d22'); disc(c, 0.003, 0, 0.0015, '#1d1d22'); c.restore();
    }
  };
  void TAU;
})(window.Harbour);
