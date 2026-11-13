// Island wallpaper: a sea that reacts. A fragment shader paints water, shore, sand and meadow from the
// distance to procedural land; a 2D layer above it draws the objects, everything alive and the clouds.
// Every load builds a different scene. ?seed=123 repeats one, ?theme=Dusk forces a theme, N makes a new one.
(function () {
  'use strict';
  var O = window.IslandObjects;
  var MAXO = 24, MAXR = 8, TAU = 6.2832;

  var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  var FS = [
    'precision highp float;',
    'uniform vec2 u_res; uniform float u_time; uniform float u_dpr; uniform vec2 u_shift;',
    'uniform vec3 u_obj[' + MAXO + ']; uniform vec4 u_rip[' + MAXR + '];',
    'uniform vec3 c_dry; uniform vec3 c_wet; uniform vec3 c_glow; uniform vec3 c_shallow; uniform vec3 c_mid; uniform vec3 c_deep; uniform vec3 c_foam; uniform vec3 c_grass; uniform vec3 c_grass2;',
    'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }',
    'float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }',
    'void main(){',
    '  float S = min(u_res.y, u_res.x / 1.5);',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p = vec2(fc.x - 0.5 * u_res.x, 0.5 * u_res.y - fc.y) / S;',
    '  vec2 q = p + u_shift;',
    // two scales of warp: the coarse one makes the coast wander, the fine one frays it
    '  vec2 w = p + 0.05 * (vec2(fbm(q * 2.2 + 3.1), fbm(q * 2.2 + 11.7)) - 0.47) + 0.018 * (vec2(fbm(q * 6.0 + 5.3), fbm(q * 6.0 + 1.9)) - 0.47);',
    '  float d = 10.0;',
    '  for (int i = 0; i < ' + MAXO + '; i++) { vec3 o = u_obj[i]; if (o.z > 0.001) { d = smin(d, length(w - o.xy) - o.z, 0.09); } }',
    '  d += (fbm(q * 9.0) - 0.47) * 0.024;',
    '  float t = u_time;',
    '  float ph = fbm(q * 2.5) * 9.0;',
    '  float sd = d - 0.007 * sin(t * 0.9 + ph);',
    '  vec3 col;',
    '  if (sd < 0.0) {',
    '    float ring = smoothstep(-0.088, -0.045, d);',
    '    col = mix(c_dry, c_wet, ring * 0.9);',
    '    col += 0.05 * smoothstep(0.010, 0.0, abs(d + 0.066));',
    '    col *= 0.965 + 0.07 * fbm(q * 26.0);',
    // meadow in the middle of the larger islands, with a soft painted edge and a few flowers
    '    float gn = fbm(q * 6.0 + 4.0);',
    '    float gd = d + (gn - 0.5) * 0.07;',
    '    float gm = smoothstep(-0.076, -0.09, gd);',
    '    vec3 gc = mix(c_grass, c_grass2, smoothstep(0.38, 0.66, fbm(q * 11.0 + 9.0)));',
    '    gc = mix(gc, c_grass2 * 0.86, smoothstep(0.5, 0.75, fbm(q * 3.5 + 70.0)) * 0.5);',
    '    gc *= 0.94 + 0.12 * fbm(q * 44.0);',
    '    float fh = hash(floor(fc / (u_dpr * 2.4)) + 9.1);',
    '    gc = mix(gc, mix(vec3(1.0, 0.97, 0.82), vec3(1.0, 0.78, 0.8), step(0.5, fract(fh * 91.0))), step(0.9935, fh) * smoothstep(-0.1, -0.12, gd));',
    '    col = mix(col, col * 0.93, smoothstep(-0.058, -0.076, gd) * (1.0 - gm) * 0.7);',
    '    col = mix(col, gc, gm);',
    '    col = mix(col, c_wet * 0.92, smoothstep(-0.022, 0.0, sd) * 0.6);',
    '  } else {',
    '    col = mix(c_shallow, c_mid, smoothstep(0.03, 0.22, sd));',
    '    col = mix(col, c_deep, smoothstep(0.18, 0.7, sd));',
    '    col = mix(c_glow, col, smoothstep(-0.004, 0.085, sd));',
    // painted variation: slow light and dark washes, seagrass beds in the shallows
    '    col += 0.055 * (fbm(q * 1.7 + 50.0) - 0.47);',
    '    col += 0.04 * (fbm(q * 4.0 + vec2(t * 0.03, -t * 0.02)) - 0.47);',
    '    float bed = smoothstep(0.56, 0.74, fbm(q * 3.4 + 31.0)) * smoothstep(0.06, 0.13, sd) * (1.0 - smoothstep(0.26, 0.42, sd));',
    '    col = mix(col, col * vec3(0.72, 0.9, 0.86), bed * 0.45);',
    '    float w2 = smoothstep(0.004, 0.0, abs(sd - 0.034 - 0.007 * sin(t * 0.9 - 1.6 + ph)));',
    '    col = mix(col, c_foam, w2 * 0.22);',
    '    float rip = 0.0;',
    '    for (int i = 0; i < ' + MAXR + '; i++) { vec4 r = u_rip[i]; if (r.w > 0.001) {',
    '      float dist = length(w - r.xy);',
    '      rip += r.w * (smoothstep(0.011, 0.0, abs(dist - r.z)) + 0.55 * smoothstep(0.009, 0.0, abs(dist - r.z * 0.62)) + 0.3 * smoothstep(0.007, 0.0, abs(dist - r.z * 0.3)));',
    '    } }',
    '    col = mix(col, c_foam, clamp(rip, 0.0, 1.0) * 0.6 * smoothstep(0.0, 0.03, sd));',
    '  }',
    '  col = mix(col, c_foam, smoothstep(0.0055, 0.0, abs(sd - 0.002)) * 0.9);',
    '  vec2 cell = floor(fc / (u_dpr * 1.6));',
    '  float prob = 0.42 * exp(-abs(sd - 0.004) * 60.0);',
    '  col = mix(col, c_foam, step(1.0 - prob, hash(cell)) * 0.9);',
    '  vec2 c2 = floor(fc / (u_dpr * 3.0));',
    '  float h2 = hash(c2 + 3.7);',
    '  col = mix(col, c_foam, step(0.9965, h2) * step(0.04, sd) * (0.5 + 0.5 * sin(t * 1.5 + h2 * 40.0)) * 0.75);',
    '  col *= 1.0 - 0.14 * dot(p * 0.75, p * 0.75);',
    '  col += (hash(fc + 1.3) - 0.5) * 0.045;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var stage = document.getElementById('stage');
  var glc = document.createElement('canvas'), ov = document.createElement('canvas');
  stage.appendChild(glc); stage.appendChild(ov);
  var ctx = ov.getContext('2d');
  var gl = glc.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  var U = {}, objBuf = new Float32Array(MAXO * 3), ripBuf = new Float32Array(MAXR * 4);
  var COLORS = O.KEYS.concat(['grass', 'grass2']);
  if (gl) {
    var compile = function (type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); gl = null; }
    else {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['u_res', 'u_time', 'u_dpr', 'u_shift', 'u_obj', 'u_rip'].concat(COLORS.map(function (k) { return 'c_' + k; }))
        .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    }
  }

  // ---------- size and coordinates ----------
  var cssW = 1, cssH = 1, S = 1, dpr = 1, glScale = 1, hw = 0.75, hh = 0.5;
  function resize() {
    cssW = Math.max(1, window.innerWidth); cssH = Math.max(1, window.innerHeight); S = Math.min(cssH, cssW / 1.5);
    hw = cssW / (2 * S); hh = cssH / (2 * S);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    glScale = Math.min(dpr, Math.sqrt(3.0e6 / (cssW * cssH)));   // the shader never paints more than about 3 megapixels
    glc.width = Math.round(cssW * glScale); glc.height = Math.round(cssH * glScale);
    ov.width = Math.round(cssW * dpr); ov.height = Math.round(cssH * dpr);
    if (clouds) clouds.forEach(function (c) { c.sprite = null; });
  }
  function sx(x) { return cssW / 2 + x * S; }
  function sy(y) { return cssH / 2 + y * S; }
  function angDiff(to, from) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }

  // ---------- the scene ----------
  var themeName, theme, colors, shift, land, objs, critters, schools, gulls, boat, whale, whaleAt, ripples, particles, clouds, wind, clock = 0;
  var SOLID = { hut: 1, house: 1, castle: 1, tent: 1, lighthouse: 1, car: 1 };   // nobody stands on these

  function smin(a, b, k) { var h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); }
  function field(x, y) { var d = 10; for (var i = 0; i < land.length; i++) { var b = land[i]; d = smin(d, Math.hypot(x - b.x, y - b.y) - b.r, 0.09); } return d; }
  // Distance to the shore and the direction that leads away from land.
  function grad(x, y) {
    var e = 0.012, d = field(x, y), gx = (field(x + e, y) - d) / e, gy = (field(x, y + e) - d) / e, len = Math.hypot(gx, gy) || 1;
    return { d: d, gx: gx / len, gy: gy / len };
  }
  // A free spot on an island: far enough from the shore, not on top of another object.
  function spotOn(island, rnd, inset, clearance) {
    var mine = land.filter(function (b) { return b.island === island; });
    for (var i = 0; i < 40; i++) {
      var base = mine[Math.floor(rnd() * mine.length)], ang = rnd() * TAU, dist = Math.sqrt(rnd()) * base.r;
      var x = base.x + Math.cos(ang) * dist, y = base.y + Math.sin(ang) * dist;
      if (field(x, y) > -inset) continue;
      if (objs.some(function (o) { return Math.hypot(o.x - x, o.y - y) < (clearance + o.R) * (clearance ? 0.8 : SOLID[o.kind] ? 0.75 : 0); })) continue;
      return [x, y];
    }
    return null;
  }

  function generate(seed) {
    var a = seed >>> 0;
    function G() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function pick(list) { return list[Math.floor(G() * list.length)]; }
    function between(lo, hi) { return lo + G() * (hi - lo); }

    var params = new URLSearchParams(location.search);
    themeName = O.THEMES[params.get('theme')] ? params.get('theme') : 'Lagoon';
    theme = O.useTheme(themeName);
    colors = {}; COLORS.forEach(function (k) { colors[k] = O.rgb(theme[k]); });
    shift = [G() * 40, G() * 40];
    land = []; objs = []; critters = []; schools = []; gulls = []; ripples = []; particles = []; clouds = []; whale = null; whaleAt = clock + between(15, 45);

    // Land: each island is a handful of overlapping lobes; the shader melts them together and frays the coast.
    var centers = [], want = pick([1, 2, 2, 3]);
    for (var tries = 0; centers.length < want && tries < 80; tries++) {
      var c = [between(-hw * 0.55, hw * 0.68), between(-hh * 0.42, hh * 0.42)];
      if (centers.every(function (p) { return Math.hypot(p[0] - c[0], p[1] - c[1]) > 0.62; })) centers.push(c);
    }
    centers.forEach(function (c, island) {
      var scale = island === 0 ? between(1.0, 1.3) : between(0.55, 0.95), mine = [{ x: c[0], y: c[1], r: 0.135 * scale, island: island }];
      var lobes = 2 + Math.floor(G() * 5);
      for (var n = 0; n < lobes; n++) {
        var base = pick(mine), ang = G() * TAU, r = between(0.06, 0.125) * scale, dist = base.r * between(0.65, 1.15);
        mine.push({ x: base.x + Math.cos(ang) * dist, y: base.y + Math.sin(ang) * dist * 0.8, r: r, island: island });
      }
      if (G() < 0.45) {   // a sand spit curling away from the island
        var from = pick(mine), dir = G() * TAU, bend = between(-0.5, 0.5), px = from.x + Math.cos(dir) * from.r, py = from.y + Math.sin(dir) * from.r;
        for (var k = 0; k < 4; k++) { mine.push({ x: px, y: py, r: 0.04 - k * 0.006, island: island }); dir += bend; px += Math.cos(dir) * 0.05; py += Math.sin(dir) * 0.05; }
      }
      mine.forEach(function (b) {
        b.x = Math.max(-hw + b.r + 0.06, Math.min(hw - b.r - 0.06, b.x)); b.y = Math.max(-hh + b.r + 0.06, Math.min(hh - b.r - 0.06, b.y));
        if (land.length < MAXO - 3) land.push(b);
      });
    });
    // Sandbanks out in the open water.
    var banks = Math.floor(G() * 4), firstBank = centers.length;
    for (var n = 0; n < banks; n++) {
      for (var k = 0; k < 30; k++) {
        var bx = between(-hw + 0.12, hw - 0.12), by = between(-hh + 0.12, hh - 0.12);
        if (field(bx, by) > 0.2) { land.push({ x: bx, y: by, r: between(0.03, 0.052), island: firstBank + n }); break; }
      }
    }

    function add(kind, x, y, island, size) {
      var spin = O.KIND[kind].spin, o = { kind: kind, x: x, y: y, size: size, island: island, rot: spin ? G() * TAU : between(-0.2, 0.2), R: O.KIND[kind].R * O.SIZES[size], pop: 0, shake: 0, off: false };
      objs.push(o); return o;
    }
    var props = ['campfire', 'parasol', 'sofa', 'bike', 'guitar', 'football', 'coffee', 'laptop', 'car', 'tent'];
    centers.forEach(function (c, island) {
      var count = island === 0 ? 5 + Math.floor(G() * 4) : 2 + Math.floor(G() * 3);
      for (var n = 0; n < count; n++) {
        var kind = n === 0 && (island === 0 || G() < 0.4) ? pick(['hut', 'house', 'castle', 'tent', 'hut', 'house']) : (G() < 0.6 ? 'tree' : props.splice(Math.floor(G() * props.length), 1)[0] || 'tree');
        var size = n === 0 ? pick([1, 2]) : pick([0, 1, 1, 1, 2]), R = O.KIND[kind].R * O.SIZES[size];
        var at = spotOn(island, G, 0.03 + R * 0.45, R);
        if (at) add(kind, at[0], at[1], island, size);
      }
    });
    // A lighthouse on a sandbank, a rowboat moored off a shore.
    land.forEach(function (b) { if (b.island >= firstBank && b.r > 0.04 && G() < 0.5 && !objs.some(function (o) { return o.kind === 'lighthouse'; })) add('lighthouse', b.x, b.y, b.island, 1); });
    if (G() < 0.6) {
      var home = pick(land), ang = G() * TAU, rx = home.x, ry = home.y;
      for (var step = 0; step < 60 && field(rx, ry) < 0.045; step++) { rx += Math.cos(ang) * 0.01; ry += Math.sin(ang) * 0.01; }
      if (Math.abs(rx) < hw - 0.05 && Math.abs(ry) < hh - 0.05) add('rowboat', rx, ry, home.island, 1);
    }
    // Animals and people who live on the islands.
    var cast = ['cat', 'dog', 'person', 'person', 'cat', 'dog'], howMany = 1 + Math.floor(G() * 3);
    for (var i = 0; i < howMany; i++) {
      var kind = cast.splice(Math.floor(G() * cast.length), 1)[0], island = Math.floor(G() * centers.length);
      var cr = { kind: kind, island: island, x: centers[island][0], y: centers[island][1], tx: 0, ty: 0, a: G() * TAU, wait: 0, fear: 0, hop: 0, moving: false, speed: kind === 'dog' ? 0.035 : kind === 'cat' ? 0.028 : 0.02 };
      cr.tx = cr.x; cr.ty = cr.y; retarget(cr, false); cr.x = cr.tx; cr.y = cr.ty; cr.wait = G() * 4;
      critters.push(cr);
    }
    // Fish, in schools. One school in a few is bright.
    var schoolCount = 3 + Math.floor(G() * 3);
    for (var s = 0; s < schoolCount; s++) {
      var fx = 0, fy = 0;
      for (var t2 = 0; t2 < 40; t2++) { fx = between(-hw + 0.1, hw - 0.1); fy = between(-hh + 0.1, hh - 0.1); if (field(fx, fy) > 0.14) break; }
      var school = { x: fx, y: fy, a: G() * TAU, ph: G() * 10, rush: 0, bright: G() < 0.25, fish: [] }, count = 9 + Math.floor(G() * 14);
      for (var f = 0; f < count; f++) school.fish.push({ x: fx + between(-0.04, 0.04), y: fy + between(-0.04, 0.04), vx: 0, vy: 0, ph: G() * TAU, rad: between(0.01, 0.03 + count * 0.0015), sz: between(0.75, 1.25) });
      schools.push(school);
    }
    boat = G() < 0.85 ? { x: centers[0][0] + 0.34, y: centers[0][1] + 0.2, a: 2.4, trail: [], tick: 0, rush: 0 } : null;
    var gullCount = 3 + Math.floor(G() * 4);
    for (var g = 0; g < gullCount; g++) { var gull = newGull(between(-hw, hw), between(-hh, hh), G() * TAU); gull.follow = Boolean(boat) && g < 2; gulls.push(gull); }
    // Clouds: a few puffs each, all drifting with the same wind.
    var windDir = G() * TAU; wind = [Math.cos(windDir), Math.sin(windDir) * 0.5];
    var cloudCount = 2 + Math.floor(G() * 3);
    for (var n2 = 0; n2 < cloudCount; n2++) clouds.push(newCloud(G, between(-hw, hw), between(-hh, hh)));
    console.log('Island seed ' + seed + ', theme ' + themeName);
  }

  function newGull(x, y, a) { return { x: x, y: y, a: a, v: 0.05 + Math.random() * 0.04, ph: Math.random() * 6, rush: 0, follow: false }; }
  function retarget(c, far) {
    for (var i = 0; i < 12; i++) {
      var at = spotOn(c.island, Math.random, 0.04, 0);
      if (at && (!far || Math.hypot(at[0] - c.x, at[1] - c.y) > 0.07)) { c.tx = at[0]; c.ty = at[1]; break; }
    }
    c.wait = 2 + Math.random() * 6;
  }

  // ---------- clouds ----------
  function newCloud(rnd, x, y) {
    var r = 0.055 + rnd() * 0.065, puffs = [{ x: 0, y: 0, r: 0.5 }], n = 7 + Math.floor(rnd() * 6);
    for (var i = 0; i < n; i++) { var px = (rnd() - 0.5) * 2.2; puffs.push({ x: px, y: (rnd() - 0.5) * 0.75 * (1 - Math.abs(px) * 0.45), r: (0.2 + rnd() * 0.24) * (1.15 - Math.abs(px) * 0.35) }); }
    return { x: x, y: y, r: r, puffs: puffs, speed: 0.006 + rnd() * 0.006, alpha: 1, fade: false, sprite: null };
  }
  // Two pictures per cloud: the cloud itself (lit from the top left) and its flat shadow.
  function cloudSprite(c) {
    var R = c.r * S, w = Math.ceil(R * 4.4), h = Math.ceil(R * 3.2);
    function paint(draw) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d'); g.translate(w / 2, h / 2); draw(g); return cv;
    }
    function puffs(g, dx, dy, k, col, blur) {
      g.filter = 'blur(' + (R * blur).toFixed(1) + 'px)';
      c.puffs.forEach(function (p) { O.disc(g, p.x * R + dx * R, p.y * R + dy * R, p.r * R * k, col); });
      g.filter = 'none';
    }
    c.sprite = paint(function (g) {
      puffs(g, 0, 0, 1, '#c9dcec', 0.05);
      g.globalCompositeOperation = 'source-atop';
      puffs(g, -0.07, -0.1, 0.93, '#eef5fa', 0.07);
      puffs(g, -0.13, -0.19, 0.8, '#ffffff', 0.09);
    });
    c.shadow = paint(function (g) { puffs(g, 0, 0, 1, 'rgb(' + theme.shade + ')', 0.12); });
    c.w = w; c.h = h;
  }
  function stepClouds(dt) {
    clouds.forEach(function (c) {
      c.x += wind[0] * c.speed * dt; c.y += wind[1] * c.speed * dt;
      c.alpha += ((c.fade ? 0 : 1) - c.alpha) * Math.min(1, dt * 2.5);
      var out = Math.abs(c.x) > hw + c.r * 2.4 || Math.abs(c.y) > hh + c.r * 2;
      if (out || (c.fade && c.alpha < 0.02)) {   // comes back in on the upwind side
        var fresh = newCloud(Math.random, 0, 0);
        if (Math.abs(wind[0]) * hh > Math.abs(wind[1]) * hw) { fresh.x = -Math.sign(wind[0]) * (hw + fresh.r * 2.3); fresh.y = (Math.random() - 0.5) * 2 * hh; }
        else { fresh.y = -Math.sign(wind[1]) * (hh + fresh.r * 1.9); fresh.x = (Math.random() - 0.5) * 2 * hw; }
        Object.assign(c, fresh);
      }
    });
  }
  function drawClouds(shadows) {
    clouds.forEach(function (c) {
      if (!c.sprite) cloudSprite(c);
      ctx.globalAlpha = (shadows ? 0.16 : 0.84) * c.alpha;
      var ox = shadows ? 0.07 * S : 0, oy = shadows ? 0.1 * S : 0;
      ctx.drawImage(shadows ? c.shadow : c.sprite, sx(c.x) - c.w / 2 + ox, sy(c.y) - c.h / 2 + oy);
    });
    ctx.globalAlpha = 1;
  }

  // ---------- small effects ----------
  function ripple(x, y, strength) { ripples.push({ x: x, y: y, t: 0, k: strength }); if (ripples.length > MAXR) ripples.shift(); }
  function burst(x, y, n, speed, color, size, life) {
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7); particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, r: size * (0.6 + Math.random() * 0.8), col: color }); }
  }
  function scare(x, y) {
    schools.forEach(function (s) {
      var near = false;
      s.fish.forEach(function (f) {
        var dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 0.001;
        if (d < 0.32) { var k = 0.55 * (1 - d / 0.32); f.vx += dx / d * k; f.vy += dy / d * k; near = true; }
      });
      if (near) { s.a = Math.atan2(s.y - y, s.x - x); s.rush = 2.2; }
    });
    gulls.forEach(function (b) { if (Math.hypot(b.x - x, b.y - y) < 0.2) { b.a = Math.atan2(b.y - y, b.x - x); b.rush = 1.5; } });
  }

  // ---------- what a click does ----------
  var mouse = { x: 0, y: 0, on: false, lx: 0, ly: 0 }, busyUntil = 0;
  function toWorld(px, py) { return [(px - cssW / 2) / S, (py - cssH / 2) / S]; }
  function click(px, py) {
    busyUntil = performance.now() + 4000;
    var w = toWorld(px, py), x = w[0], y = w[1], hit = false;
    // A cloud is the topmost thing: a click blows it away and shows what is under it.
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      if (!c.fade && c.puffs.some(function (p) { return Math.hypot(c.x + p.x * c.r - x, c.y + p.y * c.r - y) < p.r * c.r * 0.9; })) {
        c.fade = true; burst(x, y, 12, 0.12, '255,255,255', 0.012, 0.9); return;
      }
    }
    if (whale && !whale.dive && Math.hypot(whale.x - x, whale.y - y) < 0.08) {
      whale.dive = true; hit = true;
      burst(whale.x + Math.cos(whale.a) * 0.04, whale.y + Math.sin(whale.a) * 0.04, 26, 0.16, '255,255,255', 0.006, 1.3);
      ripple(whale.x, whale.y, 1);
    }
    critters.forEach(function (c) {
      if (hit || Math.hypot(c.x - x, c.y - y) > 0.04) return;
      c.fear = 1.8; retarget(c, true); c.wait = 3 + Math.random() * 3; hit = true;
      burst(c.x, c.y, 6, 0.05, theme.shade, 0.006, 0.5);
    });
    if (!hit) {
      var best = null, bd = 1e9;
      objs.forEach(function (o) { var d = Math.hypot(o.x - x, o.y - y); if (d < Math.max(0.03, o.R * 0.8) && d < bd) { bd = d; best = o; } });
      if (best) {
        hit = true; best.pop = 1;
        if (best.kind === 'tree') {
          best.shake = 1;
          burst(best.x, best.y, 7, 0.09, themeName === 'Arctic' ? '233,243,240' : '63,154,85', 0.005, 0.9);
          if (gulls.length < 10 && Math.random() < 0.6) { var b = newGull(best.x, best.y, Math.random() * TAU); b.rush = 1.5; gulls.push(b); }
        }
        if (best.kind === 'lighthouse') best.off = !best.off;
        if (best.kind === 'campfire') burst(best.x, best.y, 16, 0.1, '255,190,80', 0.004, 1.0);
        if (best.kind === 'rowboat') ripple(best.x, best.y, 0.7);
        if (best.kind === 'football') best.rot += 1 + Math.random() * 2;
      }
    }
    if (boat && Math.hypot(boat.x - x, boat.y - y) < 0.05) { boat.rush = 3; hit = true; }
    if (field(x, y) > 0.005) { ripple(x, y, 1); scare(x, y); }
    else if (!hit) burst(x, y, 7, 0.05, theme.shade, 0.005, 0.5);
  }
  function move(px, py) {
    var w = toWorld(px, py); mouse.x = w[0]; mouse.y = w[1]; mouse.on = true;
    busyUntil = Math.max(busyUntil, performance.now() + 1500);
    // The pointer leaves a faint wake on the water.
    if (Math.hypot(mouse.x - mouse.lx, mouse.y - mouse.ly) > 0.09) { mouse.lx = mouse.x; mouse.ly = mouse.y; if (field(mouse.x, mouse.y) > 0.01) ripple(mouse.x, mouse.y, 0.28); }
  }
  window.addEventListener('mousedown', function (e) { if (e.button === 0) click(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
  document.addEventListener('mouseleave', function () { mouse.on = false; });
  window.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) { click(t.clientX, t.clientY); mouse.on = false; } }, { passive: true });
  window.addEventListener('keydown', function (e) { if (e.key === 'n' || e.key === 'N') generate(Math.floor(Math.random() * 1e9)); });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- the fishing boat ----------
  function stepBoat(dt) {
    var k = boat, g = grad(k.x, k.y);
    var corr = Math.max(-1.5, Math.min(1.5, (0.22 - g.d) * 5)), vx = -g.gy + g.gx * corr, vy = g.gx + g.gy * corr;
    if (Math.abs(k.x) > hw - 0.08) vx -= Math.sign(k.x) * 2; if (Math.abs(k.y) > hh - 0.08) vy -= Math.sign(k.y) * 2;
    k.rush = Math.max(0, k.rush - dt);
    var speed = 0.026 * (1 + 2.5 * Math.min(1, k.rush));
    k.a += angDiff(Math.atan2(vy, vx), k.a) * Math.min(1, dt * 1.6);
    k.x += Math.cos(k.a) * speed * dt; k.y += Math.sin(k.a) * speed * dt;
    k.tick += dt * speed / 0.026; if (k.tick > 0.3) { k.tick = 0; k.trail.push([k.x - Math.cos(k.a) * 0.03, k.y - Math.sin(k.a) * 0.03, k.a]); if (k.trail.length > 22) k.trail.shift(); }
  }
  function drawBoat() {
    var k = boat, L = S * 0.05, W = L * 0.42, n = k.trail.length;
    // wake: two lines of foam opening behind the stern
    for (var i = 0; i < n; i++) {
      var p = k.trail[i], age = 1 - i / n, spread = L * (0.22 + age * 0.85), r = Math.max(0.6, L * (0.1 - age * 0.05));
      [-1, 1].forEach(function (s) { O.disc(ctx, sx(p[0]) - Math.sin(p[2]) * spread * s, sy(p[1]) + Math.cos(p[2]) * spread * s, r, 'rgba(255,255,255,' + ((1 - age) * 0.5) + ')'); });
    }
    function hull(m) { ctx.beginPath(); ctx.moveTo(L * m, 0); ctx.quadraticCurveTo(L * 0.5 * m, -W * 1.08 * m, -L * 0.5 * m, -W * m); ctx.quadraticCurveTo(-L * 1.02 * m, -W * 0.9 * m, -L * m, 0); ctx.quadraticCurveTo(-L * 1.02 * m, W * 0.9 * m, -L * 0.5 * m, W * m); ctx.quadraticCurveTo(L * 0.5 * m, W * 1.08 * m, L * m, 0); ctx.closePath(); }
    ctx.save(); ctx.translate(sx(k.x), sy(k.y)); ctx.rotate(k.a + 0.03 * Math.sin(clock * 1.3));
    ctx.save(); ctx.translate(L * 0.14, L * 0.2); hull(1); ctx.fillStyle = O.shade(0.26); ctx.fill(); ctx.restore();
    // outrigger poles with their lines trailing in the water
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (s) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(0.5, L * 0.015);
      ctx.beginPath(); ctx.moveTo(-L * 0.3, s * W * 2.2); ctx.quadraticCurveTo(-L * 0.8, s * W * 2.35, -L * 1.25, s * W * (2.2 + 0.15 * Math.sin(clock * 2 + s))); ctx.stroke();
      ctx.strokeStyle = '#5a4632'; ctx.lineWidth = L * 0.04; ctx.beginPath(); ctx.moveTo(L * 0.12, s * W * 0.5); ctx.lineTo(-L * 0.3, s * W * 2.2); ctx.stroke();
    });
    hull(1); ctx.fillStyle = '#f7f2e8'; ctx.fill();
    hull(0.9); ctx.fillStyle = '#2b8089'; ctx.fill();
    hull(0.79); ctx.fillStyle = '#d6ad76'; ctx.fill();
    ctx.save(); hull(0.79); ctx.clip();
    ctx.strokeStyle = 'rgba(120,80,40,0.28)'; ctx.lineWidth = Math.max(0.5, L * 0.018);
    for (var j = -3; j <= 3; j++) { ctx.beginPath(); ctx.moveTo(-L, j * W * 0.22); ctx.lineTo(L, j * W * 0.22); ctx.stroke(); }
    ctx.restore();
    // net pile with floats, two fish crates, the fisherman
    O.disc(ctx, -L * 0.56, 0, W * 0.44, '#3f9270');
    ctx.strokeStyle = 'rgba(210,240,220,0.5)'; ctx.lineWidth = Math.max(0.5, L * 0.016);
    [0.16, 0.3].forEach(function (q) { ctx.beginPath(); ctx.arc(-L * 0.56, 0, W * q, 0, TAU); ctx.stroke(); });
    [0.4, 2.3, 4.1].forEach(function (q) { O.disc(ctx, -L * 0.56 + Math.cos(q) * W * 0.36, Math.sin(q) * W * 0.36, W * 0.09, '#ff9a3c'); });
    rr(ctx, -L * 0.3, -W * 0.56, L * 0.2, W * 0.46, L * 0.02); ctx.fillStyle = '#4f86c6'; ctx.fill();
    [0, 1, 2].forEach(function (q) { O.oval(ctx, -L * 0.2, -W * (0.46 - q * 0.13), L * 0.07, W * 0.045, '#dfe8ee'); });
    rr(ctx, -L * 0.3, W * 0.12, L * 0.2, W * 0.42, L * 0.02); ctx.fillStyle = '#e9eef1'; ctx.fill();
    O.disc(ctx, -L * 0.03, W * 0.3, W * 0.21, '#e9d29a'); O.disc(ctx, -L * 0.03, W * 0.3, W * 0.11, '#f6e7bd');
    // wheelhouse: white walls, red roof lit from the top left, dark windscreen
    rr(ctx, L * 0.08, -W * 0.56, L * 0.44, W * 1.12, L * 0.06); ctx.fillStyle = O.shade(0.2); ctx.fill();
    rr(ctx, L * 0.05, -W * 0.6, L * 0.44, W * 1.12, L * 0.06); ctx.fillStyle = '#fbf7ef'; ctx.fill();
    rr(ctx, L * 0.09, -W * 0.5, L * 0.33, W * 0.92, L * 0.04); ctx.fillStyle = '#d94f3a'; ctx.fill();
    rr(ctx, L * 0.09, -W * 0.5, L * 0.33, W * 0.4, L * 0.04); ctx.fillStyle = '#ee7862'; ctx.fill();
    rr(ctx, L * 0.42, -W * 0.48, L * 0.05, W * 0.88, L * 0.02); ctx.fillStyle = '#27506b'; ctx.fill();
    O.disc(ctx, L * 0.2, -W * 0.05, W * 0.08, '#fbf7ef');
    O.disc(ctx, L * 0.74, 0, W * 0.08, '#8a6a44');
    ctx.restore();
  }

  // ---------- gulls ----------
  function stepGulls(dt) {
    gulls.forEach(function (b) {
      b.rush = Math.max(0, b.rush - dt);
      var fast = 1 + 4 * b.rush / 1.5;
      if (b.follow && boat && b.rush <= 0) {   // these two circle the boat, hoping for scraps
        var tx = boat.x - Math.cos(boat.a) * 0.05 + Math.cos(b.ph * 0.13) * 0.07, ty = boat.y - Math.sin(boat.a) * 0.05 + Math.sin(b.ph * 0.13) * 0.07;
        b.a += angDiff(Math.atan2(ty - b.y, tx - b.x), b.a) * Math.min(1, dt * 1.8);
      } else b.a += Math.sin(b.ph * 0.3) * 0.15 * dt;
      b.ph += dt * 5 * (1 + b.rush);
      b.x += Math.cos(b.a) * b.v * fast * dt; b.y += Math.sin(b.a) * b.v * fast * dt;
      if (b.x > hw + 0.1) b.x = -hw - 0.1; if (b.x < -hw - 0.1) b.x = hw + 0.1; if (b.y > hh + 0.1) b.y = -hh - 0.1; if (b.y < -hh - 0.1) b.y = hh + 0.1;
    });
  }
  // A slim gull seen from above. flat = one colour, for the shadow.
  function gullShape(sz, flap, flat) {
    function wing(s, from, to, col) {
      var y0 = s * sz * from * flap, y1 = s * sz * to * flap, x0 = sz * (0.1 - from * 0.22), x1 = sz * (0.1 - to * 0.22);
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x0 + sz * 0.11 * (1 - from), y0); ctx.quadraticCurveTo((x0 + x1) / 2 + sz * 0.1, (y0 + y1) / 2, x1 + sz * 0.02, y1);
      ctx.quadraticCurveTo((x0 + x1) / 2 - sz * 0.08, (y0 + y1) / 2, x0 - sz * 0.13 * (1 - from), y0); ctx.closePath(); ctx.fill();
    }
    [-1, 1].forEach(function (s) {
      wing(s, 0, 1.15, flat || '#ffffff');
      if (!flat) { wing(s, 0.28, 1.15, '#b4bec9'); wing(s, 0.9, 1.15, '#3a4047'); }
    });
    ctx.fillStyle = flat || '#ffffff';
    ctx.beginPath(); ctx.moveTo(-sz * 0.3, 0); ctx.lineTo(-sz * 0.52, -sz * 0.09); ctx.lineTo(-sz * 0.52, sz * 0.09); ctx.closePath(); ctx.fill();
    O.oval(ctx, 0, 0, sz * 0.36, sz * 0.085, flat || '#ffffff');
    if (!flat) { O.oval(ctx, -sz * 0.06, 0, sz * 0.2, sz * 0.06, '#d5dce3'); O.disc(ctx, sz * 0.33, 0, sz * 0.07, '#ffffff'); O.oval(ctx, sz * 0.43, 0, sz * 0.06, sz * 0.022, '#f0a92e'); }
  }
  function drawGulls() {
    var sz = S * 0.021;
    gulls.forEach(function (b) {
      var flap = 0.8 + 0.2 * Math.sin(b.ph), px = sx(b.x), py = sy(b.y);
      ctx.save(); ctx.translate(px + sz * 1.3, py + sz * 1.8); ctx.rotate(b.a); gullShape(sz * 0.9, flap, O.shade(0.18)); ctx.restore();
      ctx.save(); ctx.translate(px, py); ctx.rotate(b.a); gullShape(sz, flap, null); ctx.restore();
    });
  }

  // ---------- fish ----------
  function stepFish(dt) {
    schools.forEach(function (s) {
      s.rush = Math.max(0, s.rush - dt);
      var g = grad(s.x, s.y), turn = Math.sin(clock * 0.2 + s.ph) * 0.3;
      if (g.d < 0.14) turn = angDiff(Math.atan2(g.gy, g.gx), s.a) * 2.5;
      else if (Math.abs(s.x) > hw - 0.1 || Math.abs(s.y) > hh - 0.1) turn = angDiff(Math.atan2(-s.y, -s.x), s.a) * 2;
      s.a += turn * dt;
      var speed = 0.018 * (1 + 4 * Math.min(1, s.rush));
      s.x += Math.cos(s.a) * speed * dt; s.y += Math.sin(s.a) * speed * dt;
      s.fish.forEach(function (f) {
        var ax = (s.x + Math.cos(clock * 0.5 + f.ph) * f.rad - f.x) * 3, ay = (s.y + Math.sin(clock * 0.4 + f.ph * 1.7) * f.rad - f.y) * 3;
        if (mouse.on) { var dx = f.x - mouse.x, dy = f.y - mouse.y, d = Math.hypot(dx, dy) || 0.001; if (d < 0.11) { var k = (0.11 - d) * 28; ax += dx / d * k; ay += dy / d * k; } }
        var gf = grad(f.x, f.y); if (gf.d < 0.03) { ax += gf.gx * 1.2; ay += gf.gy * 1.2; }
        var damp = Math.exp(-dt * 2.4);
        f.vx = (f.vx + ax * dt) * damp; f.vy = (f.vy + ay * dt) * damp;
        f.x += f.vx * dt; f.y += f.vy * dt;
      });
    });
  }
  function drawFish() {
    schools.forEach(function (s) {
      s.fish.forEach(function (f) {
        var sz = S * 0.0062 * f.sz, v = Math.hypot(f.vx, f.vy);
        var a = Math.atan2(f.vy + Math.sin(s.a) * 0.03, f.vx + Math.cos(s.a) * 0.03);
        var beat = Math.sin(clock * (7 + v * 130) + f.ph), glint = Math.sin(clock * 1.7 + f.ph * 7) > 0.965;
        ctx.save(); ctx.translate(sx(f.x), sy(f.y)); ctx.rotate(a + beat * 0.08);
        ctx.fillStyle = glint ? 'rgba(255,255,255,0.6)' : s.bright ? 'rgba(255,142,84,0.9)' : O.shade(0.42);
        // body tapering to the tail, which swings against the head
        ctx.beginPath(); ctx.moveTo(sz, 0); ctx.quadraticCurveTo(sz * 0.35, -sz * 0.36, -sz * 0.55, -sz * 0.07 + beat * sz * 0.1);
        ctx.lineTo(-sz * 0.55, sz * 0.07 + beat * sz * 0.1); ctx.quadraticCurveTo(sz * 0.35, sz * 0.36, sz, 0); ctx.fill();
        ctx.translate(-sz * 0.5, beat * sz * 0.1); ctx.rotate(-beat * 0.5);
        ctx.beginPath(); ctx.moveTo(sz * 0.05, 0); ctx.lineTo(-sz * 0.62, -sz * 0.34); ctx.lineTo(-sz * 0.42, 0); ctx.lineTo(-sz * 0.62, sz * 0.34); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    });
  }

  // ---------- islanders ----------
  function stepCritter(c, dt) {
    c.fear = Math.max(0, c.fear - dt);
    var dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    c.moving = d > 0.006;
    if (!c.moving) { c.wait -= dt; if (c.wait <= 0) retarget(c, false); return; }
    var stepLen = Math.min(d, (c.fear > 0 ? 0.17 : c.speed) * dt);
    c.x += dx / d * stepLen; c.y += dy / d * stepLen;
    c.a += angDiff(Math.atan2(dy, dx), c.a) * Math.min(1, dt * 10);
    c.hop += dt * (c.fear > 0 ? 24 : 10);
  }
  function drawCritter(c) {
    var sz = S * 0.05 * O.SCALE[c.kind], lift = c.moving ? Math.abs(Math.sin(c.hop)) * (c.fear > 0 ? 0.3 : 0.12) : 0;
    ctx.save(); ctx.translate(sx(c.x), sy(c.y)); ctx.scale(1 + lift * 0.5, 1 + lift * 0.5);
    O.DRAW[c.kind](ctx, sz, clock, { rot: c.a }); ctx.restore();
  }

  // ---------- the whale ----------
  function spawnWhale() {
    for (var i = 0; i < 14; i++) {
      var dir = Math.random() < 0.5 ? 1 : -1, y1 = (Math.random() - 0.5) * hh * 1.7, y2 = (Math.random() - 0.5) * hh * 1.7, x1 = -dir * (hw + 0.15), x2 = dir * (hw + 0.15), clear = true;
      for (var k = 0; k <= 24 && clear; k++) clear = field(x1 + (x2 - x1) * k / 24, y1 + (y2 - y1) * k / 24) > 0.16;
      if (clear) { whale = { x: x1, y: y1, a: Math.atan2(y2 - y1, x2 - x1), alpha: 0, dive: false }; return; }
    }
  }
  function stepWhale(dt) {
    if (!whale) { if (clock > whaleAt) { spawnWhale(); whaleAt = clock + 50 + Math.random() * 70; } return; }
    whale.x += Math.cos(whale.a) * 0.03 * dt; whale.y += Math.sin(whale.a) * 0.03 * dt;
    whale.alpha += ((whale.dive ? 0 : 1) - whale.alpha) * Math.min(1, dt * 1.5);
    if (Math.abs(whale.x) > hw + 0.2 || (whale.dive && whale.alpha < 0.03)) whale = null;
  }
  function drawWhale() {
    var L = S * 0.085, col = O.shade(0.3 * whale.alpha), wag = Math.sin(clock * 1.6) * 0.18;
    ctx.save(); ctx.translate(sx(whale.x), sy(whale.y)); ctx.rotate(whale.a);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(L, 0); ctx.bezierCurveTo(L * 0.8, -L * 0.42, -L * 0.3, -L * 0.36, -L * 0.95, 0); ctx.bezierCurveTo(-L * 0.3, L * 0.36, L * 0.8, L * 0.42, L, 0); ctx.fill();
    [-1, 1].forEach(function (s) { ctx.save(); ctx.translate(L * 0.25, s * L * 0.3); ctx.rotate(s * 0.9); O.oval(ctx, 0, 0, L * 0.22, L * 0.08, col); ctx.restore(); });
    ctx.translate(-L * 0.9, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-L * 0.25, -L * 0.1, -L * 0.42, -L * 0.34); ctx.quadraticCurveTo(-L * 0.3, 0, -L * 0.42, L * 0.34); ctx.quadraticCurveTo(-L * 0.25, L * 0.1, 0, 0); ctx.fill();
    ctx.restore();
  }

  // ---------- one frame ----------
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, lastDraw = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastDraw = now; return; }
    if (now - lastDraw < (now < busyUntil ? 0 : 30)) return;      // calm sea: half the frames
    var dt = Math.min(0.05, (now - lastDraw) / 1000); lastDraw = now;
    if (reduce) dt *= 0.25;
    clock += dt;

    objs.forEach(function (o) { o.pop = Math.max(0, o.pop - dt * 1.5); o.shake = Math.max(0, o.shake - dt * 0.8); });
    for (var i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 2.8) ripples.splice(i, 1); }
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; var drag = Math.exp(-dt * 3); p.vx *= drag; p.vy *= drag;
    }
    if (boat) stepBoat(dt);
    stepGulls(dt); stepFish(dt); stepWhale(dt); stepClouds(dt);
    critters.forEach(function (c) { stepCritter(c, dt); });

    if (gl) {
      gl.viewport(0, 0, glc.width, glc.height);
      objBuf.fill(0); ripBuf.fill(0);
      land.forEach(function (b, n) { if (n < MAXO) { objBuf[n * 3] = b.x; objBuf[n * 3 + 1] = b.y; objBuf[n * 3 + 2] = b.r; } });
      ripples.forEach(function (r, j) { var life = 1 - r.t / 2.8; ripBuf[j * 4] = r.x; ripBuf[j * 4 + 1] = r.y; ripBuf[j * 4 + 2] = 0.012 + 0.2 * Math.pow(r.t / 2.8, 0.75) * (0.5 + 0.5 * r.k); ripBuf[j * 4 + 3] = r.k * life * life; });
      gl.uniform2f(U.u_res, glc.width, glc.height); gl.uniform1f(U.u_time, clock); gl.uniform1f(U.u_dpr, glScale);
      gl.uniform2f(U.u_shift, shift[0], shift[1]);
      gl.uniform3fv(U.u_obj, objBuf); gl.uniform4fv(U.u_rip, ripBuf);
      COLORS.forEach(function (k) { gl.uniform3fv(U['c_' + k], colors[k]); });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssW, cssH);
    if (!gl) { ctx.fillStyle = theme.mid; ctx.fillRect(0, 0, cssW, cssH); land.forEach(function (b) { O.disc(ctx, sx(b.x), sy(b.y), b.r * S, theme.dry); }); }
    if (whale) drawWhale();
    drawFish();
    if (boat) drawBoat();
    var order = objs.slice().sort(function (a, b) { return a.y - b.y; });
    order.forEach(function (o) {
      var scale = O.SIZES[o.size] * (1 + 0.22 * o.pop * Math.sin(o.pop * 10));
      var rot = o.rot + o.shake * 0.3 * Math.sin(clock * 20) + (o.kind === 'rowboat' ? 0.08 * Math.sin(clock * 0.8) : 0);
      ctx.save(); ctx.translate(sx(o.x), sy(o.y)); ctx.scale(scale, scale);
      O.DRAW[o.kind](ctx, S * 0.05 * O.SCALE[o.kind], clock * (1 + o.shake * 6), { rot: rot }); ctx.restore();
    });
    critters.forEach(drawCritter);
    order.forEach(function (o) {
      if (o.kind !== 'lighthouse' || o.off) return;
      var len = S * 0.42 * O.SIZES[o.size];
      ctx.save(); ctx.translate(sx(o.x), sy(o.y)); ctx.rotate(clock * 0.7); ctx.globalCompositeOperation = 'lighter';
      var gr = ctx.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, 'rgba(255,236,170,0.38)'); gr.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -len * 0.2); ctx.lineTo(len, len * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
    });
    particles.forEach(function (p) { O.disc(ctx, sx(p.x), sy(p.y), Math.max(0.6, p.r * S), 'rgba(' + p.col + ',' + (0.85 * p.life / p.max) + ')'); });
    drawClouds(true);
    drawGulls();
    drawClouds(false);
  }

  resize();
  window.addEventListener('resize', resize);
  var asked = Number(new URLSearchParams(location.search).get('seed'));
  generate(asked || Math.floor(Math.random() * 1e9));
  requestAnimationFrame(frame);
})();
