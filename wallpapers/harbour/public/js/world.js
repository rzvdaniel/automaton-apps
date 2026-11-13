// The world: screen size, the camera (zoom and pan), the land, the list of entities, shared effects, clicks and the frame loop.
(function (H) {
  'use strict';
  const { TAU, disc, clamp } = H;
  // Drawing passes, bottom to top. 'upright' is sorted by depth so nearer things overlap farther ones.
  H.LAYERS = ['deep', 'ground', 'roads', 'water', 'upright', 'air', 'effects', 'skyShadow', 'birds', 'clouds'];
  H.ZOOM_MAX = 8;
  const ZOOM_EASE = 9, DRAG_PIXELS = 5;   // how fast the camera settles; how far a press must move before it becomes a pan

  H.World = class {
    constructor(stage, sound) {
      this.glCanvas = document.createElement('canvas'); this.canvas = document.createElement('canvas');
      stage.appendChild(this.glCanvas); stage.appendChild(this.canvas);
      this.c = this.canvas.getContext('2d');
      this.backdrop = new H.Backdrop(this.glCanvas);
      this.sound = sound; sound.world = this;
      this.debug = /[?&](debug|all)\b/.test(location.search);   // ?debug shows every extra element and a small status panel
      this.clock = 0; this.mouse = { x: 0, y: 0, on: false, lx: 0, ly: 0 }; this.busyUntil = 0; this.press = null; this.errors = [];
      this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1 };   // the camera now, and where it is heading
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; this.lastDraw = performance.now();
      this.reset(); this.resize(); this.listen(); if (this.debug) this.makePanel();
    }

    // ---------- size and camera ----------
    resize() {
      const W = this.W = Math.max(1, window.innerWidth), Hh = this.H = Math.max(1, window.innerHeight);
      this.S = Math.min(Hh, W / 1.5); this.hw = W / (2 * this.S); this.hh = Hh / (2 * this.S);
      this.dpr = Math.min(2, window.devicePixelRatio || 1); this.glScale = Math.min(this.dpr, Math.sqrt(3.0e6 / (W * Hh)));   // the shader paints at most about 3 megapixels
      this.glCanvas.width = Math.round(W * this.glScale); this.glCanvas.height = Math.round(Hh * this.glScale);
      this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(Hh * this.dpr);
      this.entities.forEach(e => { if (e.onResize) e.onResize(); });
      this.clampCamera();
    }
    // World units to canvas pixels. Everything is drawn through this, so shapes are redrawn sharp at any zoom.
    worldSpace() { const c = this.cam, k = this.dpr * this.S * c.zoom; this.c.setTransform(k, 0, 0, k, this.dpr * this.W / 2 - c.x * k, this.dpr * this.H / 2 - c.y * k); }
    pixelSpace() { this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    toWorld(px, py) { const c = this.cam, k = this.S * c.zoom; return [c.x + (px - this.W / 2) / k, c.y + (py - this.H / 2) / k]; }
    // Where a world x lies across the screen, -1 (left) to 1 (right): used to pan sounds.
    panOf(x) { return x === undefined ? 0 : clamp((x - this.cam.x) * this.cam.zoom * this.S / (this.W / 2), -1, 1); }
    // The camera may not show anything beyond the original view.
    clampCamera() {
      const c = this.cam, zt = c.tz, zc = c.zoom;
      c.tx = clamp(c.tx, -this.hw * (1 - 1 / zt), this.hw * (1 - 1 / zt)); c.ty = clamp(c.ty, -this.hh * (1 - 1 / zt), this.hh * (1 - 1 / zt));
      c.x = clamp(c.x, -this.hw * (1 - 1 / zc), this.hw * (1 - 1 / zc)); c.y = clamp(c.y, -this.hh * (1 - 1 / zc), this.hh * (1 - 1 / zc));
    }
    // Zoom by a factor, keeping the world point under (px, py) where it is.
    zoomAt(factor, px, py) {
      const c = this.cam, k0 = this.S * c.tz, wx = c.tx + (px - this.W / 2) / k0, wy = c.ty + (py - this.H / 2) / k0;
      c.tz = clamp(c.tz * factor, 1, H.ZOOM_MAX); const k1 = this.S * c.tz;
      c.tx = wx - (px - this.W / 2) / k1; c.ty = wy - (py - this.H / 2) / k1;
      this.clampCamera(); this.busyUntil = Math.max(this.busyUntil, performance.now() + 1500); this.updateCursor();
    }
    resetCamera() { const c = this.cam; c.tz = 1; c.tx = c.ty = 0; this.busyUntil = Math.max(this.busyUntil, performance.now() + 1500); this.updateCursor(); }
    // Drag the view by a number of screen pixels.
    panBy(dx, dy) { const c = this.cam, k = this.S * c.zoom; c.x -= dx / k; c.y -= dy / k; c.tx = c.x; c.ty = c.y; c.tz = c.zoom; this.clampCamera(); this.busyUntil = Math.max(this.busyUntil, performance.now() + 1500); }
    easeCamera(dt) {
      const c = this.cam, u = Math.min(1, dt * ZOOM_EASE);
      c.zoom += (c.tz - c.zoom) * u; c.x += (c.tx - c.x) * u; c.y += (c.ty - c.y) * u;
      if (Math.abs(c.tz - c.zoom) < 0.0005) { c.zoom = c.tz; c.x = c.tx; c.y = c.ty; }
      else this.busyUntil = Math.max(this.busyUntil, performance.now() + 200);
      this.clampCamera();
    }
    updateCursor() { this.canvas.style.cursor = this.cam.tz > 1.02 ? (this.press && this.press.dragged ? 'grabbing' : 'grab') : ''; }

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
    // One broken element must never stop the show: it is reported once and taken out of the scene.
    fail(e, where, err) {
      e.dead = true; const name = H.nameOf(e.constructor), line = name + '.' + where + ': ' + (err && err.message);
      if (this.errors.length < 20) this.errors.push(line);
      console.error('Harbour: ' + name + '.' + where + ' failed; it was removed from the scene.', err);
    }

    // ---------- shared effects ----------
    ripple(x, y, strength) { this.ripples.push({ x: x, y: y, t: 0, k: strength }); if (this.ripples.length > H.Backdrop.MAX_RIPPLES) this.ripples.shift(); }
    burst(x, y, n, speed, color, size, life) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7); this.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, r: size * (0.6 + Math.random() * 0.8), col: color }); } }
    ring(x, y, delay) { this.rings.push({ x: x, y: y, t: -delay }); }
    // A fright at (x, y): whoever has onScare decides what to do. Fish only mind frights in the water.
    scare(x, y, reach, water) { this.entities.forEach(e => { if (e.onScare) e.onScare(x, y, reach, water); }); }

    // ---------- clicks ----------
    click(px, py) {
      this.busyUntil = performance.now() + 4000;
      const w = this.toWorld(px, py), x = w[0], y = w[1], lists = this.layers(), seen = new Set();
      let hit = false, solid = false;
      for (let l = H.LAYERS.length - 1; l >= 0; l--) {
        const list = lists[H.LAYERS[l]];
        for (let i = list.length - 1; i >= 0; i--) {
          const e = list[i][0], mode = e.constructor.clicks;
          if (!mode || seen.has(e) || e.dead) continue; seen.add(e);
          let lx = x, ly = y; const sc = e.scale;
          if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { lx = e.x + (x - e.x) / sc; ly = e.y + (y - e.y) / sc; }   // the pointer, in the thing's own unscaled frame
          try {
            if ((mode === 'one' && solid) || !e.hit(lx, ly)) continue;
            e.click(lx, ly); hit = true;
            // every clickable thing has a voice: its class names a sound, or it picks one for this click
            const name = e.soundFor ? e.soundFor(lx, ly) : e.constructor.sound;
            if (name) this.sound.play(name, { entity: e, pan: this.panOf(e.x) });
          } catch (err) { this.fail(e, 'click', err); continue; }
          if (mode === 'top') return;
          if (mode === 'one') solid = true;
        }
      }
      if (this.field(x, y) > 0.005) { this.ripple(x, y, 1); this.scare(x, y, 0.2, true); this.sound.play('splash', { pan: this.panOf(x) }); }
      else { this.scare(x, y, 0.08, false); if (!hit) this.burst(x, y, 6, 0.03, H.SHADE, 0.003, 0.5); }
    }
    // The pointer moved: leave a faint wake behind it in the water.
    move(px, py) {
      const w = this.toWorld(px, py), m = this.mouse; m.x = w[0]; m.y = w[1]; m.on = true;
      this.busyUntil = Math.max(this.busyUntil, performance.now() + 1500);
      if (Math.hypot(m.x - m.lx, m.y - m.ly) > 0.09) { m.lx = m.x; m.ly = m.y; if (this.field(m.x, m.y) > 0.01) this.ripple(m.x, m.y, 0.28); }
    }

    // ---------- the pointer: click, wheel to zoom, press and drag to pan ----------
    // On the whole island a press is a click at once. Zoomed in, a press waits: moved it is a pan, kept still it is a click when released.
    pointerDown(px, py) {
      this.press = { x: px, y: py, lx: px, ly: py, dragged: false, zoomed: this.cam.tz > 1.02 };
      if (!this.press.zoomed) this.click(px, py);
    }
    pointerMove(px, py) {
      const p = this.press;
      if (p && p.zoomed) {
        if (!p.dragged && Math.hypot(px - p.x, py - p.y) > DRAG_PIXELS) { p.dragged = true; this.updateCursor(); }
        if (p.dragged) { this.panBy(px - p.lx, py - p.ly); p.lx = px; p.ly = py; this.mouse.on = false; return; }
      }
      this.move(px, py);
    }
    pointerUp(px, py) {
      const p = this.press; this.press = null;
      if (p && p.zoomed && !p.dragged) this.click(px, py);
      this.updateCursor();
    }
    listen() {
      window.addEventListener('mousedown', e => { if (e.button === 0) this.pointerDown(e.clientX, e.clientY); });
      window.addEventListener('mousemove', e => this.pointerMove(e.clientX, e.clientY));
      window.addEventListener('mouseup', e => { if (e.button === 0) this.pointerUp(e.clientX, e.clientY); });
      document.addEventListener('mouseleave', () => { this.mouse.on = false; if (this.press) { this.press = null; this.updateCursor(); } });
      window.addEventListener('wheel', e => { e.preventDefault(); const px = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; this.zoomAt(Math.exp(-e.deltaY * px * 0.0015), e.clientX, e.clientY); }, { passive: false });
      // touch: one finger clicks or pans, two fingers pinch and pan together
      let pinch = null;
      const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)];
      window.addEventListener('touchstart', e => {
        if (e.touches.length === 2) { this.press = null; pinch = mid(e.touches); return; }
        const t = e.touches[0]; if (t) { this.pointerDown(t.clientX, t.clientY); this.mouse.on = false; }
      }, { passive: true });
      window.addEventListener('touchmove', e => {
        if (pinch && e.touches.length === 2) {
          e.preventDefault(); const m = mid(e.touches);
          this.zoomAt(m[2] / (pinch[2] || m[2]), m[0], m[1]); this.panBy(m[0] - pinch[0], m[1] - pinch[1]); pinch = m; return;
        }
        const t = e.touches[0]; if (t && this.press) { if (this.press.zoomed) e.preventDefault(); this.pointerMove(t.clientX, t.clientY); }
      }, { passive: false });
      window.addEventListener('touchend', e => { if (pinch && e.touches.length < 2) { pinch = null; return; } const t = e.changedTouches[0]; if (t) this.pointerUp(t.clientX, t.clientY); });
      window.addEventListener('keydown', e => {
        const k = e.key;
        if (k === 'n' || k === 'N') this.generate(Math.floor(Math.random() * 1e9));
        else if (k === '+' || k === '=') this.zoomAt(1.4, this.W / 2, this.H / 2);
        else if (k === '-' || k === '_') this.zoomAt(1 / 1.4, this.W / 2, this.H / 2);
        else if (k === '0') this.resetCamera();
      });
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
      this.clock += dt; this.frames = (this.frames || 0) + 1;
      this.easeCamera(dt);
      const rp = this.ripples, rg = this.rings, pt = this.particles;
      for (i = rp.length - 1; i >= 0; i--) { rp[i].t += dt; if (rp[i].t > 2.8) rp.splice(i, 1); }
      for (i = rg.length - 1; i >= 0; i--) { rg[i].t += dt; if (rg[i].t > 1.6) rg.splice(i, 1); }
      for (i = pt.length - 1; i >= 0; i--) { const p = pt[i]; p.life -= dt; if (p.life <= 0) { pt.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; const drag = Math.exp(-dt * 3); p.vx *= drag; p.vy *= drag; }
      this.entities.forEach(e => { try { e.update(dt); } catch (err) { this.fail(e, 'update', err); } });
      if (this.entities.some(e => e.dead)) { this.entities = this.entities.filter(e => !e.dead); this.lists = null; }
      this.backdrop.render(this);
      this.draw();
      if (this.panel) this.updatePanel(now);
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
          if (e.dead) continue;
          c.save();   // each thing draws in a clean state, so one that forgets to restore cannot spoil the rest
          try {
            if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { c.translate(e.x, e.y); c.scale(sc, sc); c.translate(-e.x, -e.y); }
            e[m](c, t);
          } catch (err) { this.fail(e, m, err); this.worldSpace(); c.globalAlpha = 1; }
          c.restore();
        }
      });
    }

    // ---------- ?debug status panel ----------
    makePanel() {
      const el = this.panel = document.createElement('pre');
      el.style.cssText = 'position:fixed;left:10px;top:10px;margin:0;padding:6px 9px;font:11px/1.35 Consolas,monospace;color:#fff;background:rgba(10,30,45,.55);border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(el); this.panelAt = performance.now(); this.panelFrames = 0;
    }
    updatePanel(now) {
      if (now - this.panelAt < 500) return;
      const fps = Math.round((this.frames - this.panelFrames) * 1000 / (now - this.panelAt)); this.panelAt = now; this.panelFrames = this.frames;
      this.panel.textContent = 'Harbour debug\n' + fps + ' fps   ' + this.entities.length + ' entities   zoom ' + this.cam.zoom.toFixed(2) + '\nsound ' + (this.sound.live ? 'on' : 'off') + '\n' + (this.errors.length ? 'ERRORS\n' + this.errors.slice(-3).join('\n') : 'no errors');
    }
  };
})(window.Harbour);
