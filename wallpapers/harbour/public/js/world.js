// The world: screen size, the land, the list of entities, shared effects, clicks and the frame loop.
(function (H) {
  'use strict';
  const { TAU, disc, shade } = H;
  // Drawing passes, bottom to top. 'upright' is sorted by depth so nearer things overlap farther ones.
  H.LAYERS = ['deep', 'ground', 'roads', 'water', 'upright', 'air', 'effects', 'skyShadow', 'birds', 'clouds'];

  H.World = class {
    constructor(stage, sound) {
      this.glCanvas = document.createElement('canvas'); this.canvas = document.createElement('canvas');
      stage.appendChild(this.glCanvas); stage.appendChild(this.canvas);
      this.c = this.canvas.getContext('2d');
      this.backdrop = new H.Backdrop(this.glCanvas);
      this.sound = sound;
      this.clock = 0; this.mouse = { x: 0, y: 0, on: false, lx: 0, ly: 0 }; this.busyUntil = 0;
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; this.lastDraw = performance.now();
      this.reset(); this.resize(); this.listen();
    }

    // ---------- size ----------
    resize() {
      const W = this.W = Math.max(1, window.innerWidth), Hh = this.H = Math.max(1, window.innerHeight);
      this.S = Math.min(Hh, W / 1.5); this.hw = W / (2 * this.S); this.hh = Hh / (2 * this.S);
      this.dpr = Math.min(2, window.devicePixelRatio || 1); this.glScale = Math.min(this.dpr, Math.sqrt(3.0e6 / (W * Hh)));   // the shader paints at most about 3 megapixels
      this.glCanvas.width = Math.round(W * this.glScale); this.glCanvas.height = Math.round(Hh * this.glScale);
      this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(Hh * this.dpr);
      this.entities.forEach(e => { if (e.onResize) e.onResize(); });
    }
    worldSpace() { const k = this.dpr * this.S; this.c.setTransform(k, 0, 0, k, this.dpr * this.W / 2, this.dpr * this.H / 2); }
    pixelSpace() { this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    toWorld(px, py) { return [(px - this.W / 2) / this.S, (py - this.H / 2) / this.S]; }

    // ---------- the land ----------
    // Distance to the shore: negative on land, positive at sea.
    field(x, y) {
      const L = this.map.LAND, B = this.map.BAY; let d = 10;
      for (let i = 0; i < L.length; i++) d = H.smin(d, Math.hypot(x - L[i][0], y - L[i][1]) - L[i][2], 0.09);
      return B ? -H.smin(-d, Math.hypot(x - B[0], y - B[1]) - B[2], 0.05) : d;
    }
    // Distance to the shore and the direction that leads away from land.
    grad(x, y) { const e = 0.012, d = this.field(x, y), gx = (this.field(x + e, y) - d) / e, gy = (this.field(x, y + e) - d) / e, len = Math.hypot(gx, gy) || 1; return { d: d, gx: gx / len, gy: gy / len }; }
    pushIn(p, depth) { for (let i = 0; i < 40; i++) { const g = this.grad(p[0], p[1]); if (g.d < -depth) break; p[0] -= g.gx * 0.007; p[1] -= g.gy * 0.007; } return p; }
    // How far the wind bends a plant at this spot right now, as a fraction of its size: gusts roll across the island.
    sway(x, y) {
      const t = this.clock, w = this.wind, gust = 0.5 + 0.5 * Math.sin(t * 0.8 - (x * w[0] + y * w[1]) * 7), k = (0.02 + 0.1 * gust * gust) * (1 + 0.25 * Math.sin(t * 2.3 + x * 31 + y * 17));
      return [w[0] * k, w[1] * k];
    }

    // ---------- entities ----------
    reset() {
      this.entities = []; this.lists = null; this.ripples = []; this.particles = []; this.rings = []; this.wind = [1, 0];
      this.map = { LAND: [], BAY: null, shift: [0, 0], roads: [], path: [], quay: [], pier: [], cells: [] };
    }
    add(e) { this.entities.push(e); this.lists = null; return e; }
    all(cls) { return this.entities.filter(e => e instanceof cls); }
    count(cls) { return this.all(cls).length; }
    layers() {
      if (!this.lists) {
        this.lists = {}; H.LAYERS.forEach(n => { this.lists[n] = []; });
        this.entities.forEach(e => { const p = e.constructor.passes; for (const n in p) this.lists[n].push([e, p[n]]); });
      }
      this.lists.upright.sort((p, q) => p[0].y - q[0].y);
      return this.lists;
    }
    generate(seed) {
      const G = H.rng(seed);
      for (let attempt = 0; attempt < 40; attempt++) if (H.buildIsland(this, G)) break;
      this.backdrop.setLand(this.map.LAND);
      console.log('Harbour seed ' + seed);
    }

    // ---------- shared effects ----------
    ripple(x, y, strength) { this.ripples.push({ x: x, y: y, t: 0, k: strength }); if (this.ripples.length > H.Backdrop.MAX_RIPPLES) this.ripples.shift(); }
    burst(x, y, n, speed, color, size, life) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7); this.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, r: size * (0.6 + Math.random() * 0.8), col: color }); } }
    ring(x, y, delay) { this.rings.push({ x: x, y: y, t: -delay }); }
    // A fright at (x, y): whoever has onScare decides what to do. Fish only mind frights in the water.
    scare(x, y, reach, water) { this.entities.forEach(e => { if (e.onScare) e.onScare(x, y, reach, water); }); }

    // ---------- input ----------
    click(px, py) {
      this.busyUntil = performance.now() + 4000;
      const w = this.toWorld(px, py), x = w[0], y = w[1], lists = this.layers(), seen = new Set();
      let hit = false, solid = false;
      for (let l = H.LAYERS.length - 1; l >= 0; l--) {
        const list = lists[H.LAYERS[l]];
        for (let i = list.length - 1; i >= 0; i--) {
          const e = list[i][0], mode = e.constructor.clicks;
          if (!mode || seen.has(e)) continue; seen.add(e);
          let lx = x, ly = y; const sc = e.scale;
          if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { lx = e.x + (x - e.x) / sc; ly = e.y + (y - e.y) / sc; }   // the pointer, in the thing's own unscaled frame
          if ((mode === 'one' && solid) || !e.hit(lx, ly)) continue;
          e.click(lx, ly); hit = true;
          if (mode === 'top') return;
          if (mode === 'one') solid = true;
        }
      }
      if (this.field(x, y) > 0.005) { this.ripple(x, y, 1); this.scare(x, y, 0.2, true); this.sound.splash(); }
      else { this.scare(x, y, 0.08, false); if (!hit) this.burst(x, y, 6, 0.03, H.SHADE, 0.003, 0.5); }
    }
    move(px, py) {
      const w = this.toWorld(px, py), m = this.mouse; m.x = w[0]; m.y = w[1]; m.on = true;
      this.busyUntil = Math.max(this.busyUntil, performance.now() + 1500);
      if (Math.hypot(m.x - m.lx, m.y - m.ly) > 0.09) { m.lx = m.x; m.ly = m.y; if (this.field(m.x, m.y) > 0.01) this.ripple(m.x, m.y, 0.28); }   // a faint wake behind the pointer
    }
    listen() {
      window.addEventListener('mousedown', e => { if (e.button === 0) this.click(e.clientX, e.clientY); });
      window.addEventListener('mousemove', e => this.move(e.clientX, e.clientY));
      document.addEventListener('mouseleave', () => { this.mouse.on = false; });
      window.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) { this.click(t.clientX, t.clientY); this.mouse.on = false; } }, { passive: true });
      window.addEventListener('keydown', e => { if (e.key === 'n' || e.key === 'N') this.generate(Math.floor(Math.random() * 1e9)); });
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('resize', () => this.resize());
    }

    // ---------- one frame ----------
    start() { const tick = now => { requestAnimationFrame(tick); this.frame(now); }; requestAnimationFrame(tick); }
    frame(now) {
      if (document.hidden) { this.lastDraw = now; return; }
      if (now - this.lastDraw < (now < this.busyUntil ? 0 : 30)) return;      // calm sea: half the frames
      let dt = Math.min(0.05, (now - this.lastDraw) / 1000), i; this.lastDraw = now;
      if (this.reduce) dt *= 0.25;
      this.clock += dt;
      const rp = this.ripples, rg = this.rings, pt = this.particles;
      for (i = rp.length - 1; i >= 0; i--) { rp[i].t += dt; if (rp[i].t > 2.8) rp.splice(i, 1); }
      for (i = rg.length - 1; i >= 0; i--) { rg[i].t += dt; if (rg[i].t > 1.6) rg.splice(i, 1); }
      for (i = pt.length - 1; i >= 0; i--) { const p = pt[i]; p.life -= dt; if (p.life <= 0) { pt.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; const drag = Math.exp(-dt * 3); p.vx *= drag; p.vy *= drag; }
      this.entities.forEach(e => e.update(dt));
      if (this.entities.some(e => e.dead)) { this.entities = this.entities.filter(e => !e.dead); this.lists = null; }
      this.backdrop.render(this);
      this.draw();
    }
    draw() {
      const c = this.c, t = this.clock, lists = this.layers();
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.backdrop.gl) { c.fillStyle = '#16aed0'; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      this.worldSpace();
      if (!this.backdrop.gl) this.map.LAND.forEach(b => disc(c, b[0], b[1], b[2], '#a9d277'));
      c.lineCap = 'round'; c.lineJoin = 'round';
      H.LAYERS.forEach(name => {
        if (name === 'effects') {   // the bell's rings, dust, spray
          this.rings.forEach(r => { if (r.t < 0) return; c.strokeStyle = 'rgba(255,246,200,' + (0.7 * (1 - r.t / 1.6)) + ')'; c.lineWidth = 0.0022; c.beginPath(); c.arc(r.x, r.y, 0.012 + r.t * 0.075, 0, TAU); c.stroke(); });
          this.particles.forEach(p => disc(c, p.x, p.y, p.r, 'rgba(' + p.col + ',' + (0.85 * p.life / p.max) + ')'));
        }
        const list = lists[name];
        for (let i = 0; i < list.length; i++) {
          const e = list[i][0], m = list[i][1], sc = e.scale;
          if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { c.save(); c.translate(e.x, e.y); c.scale(sc, sc); c.translate(-e.x, -e.y); e[m](c, t); c.restore(); }
          else e[m](c, t);
        }
      });
    }
  };
  void shade;
})(window.Harbour);
