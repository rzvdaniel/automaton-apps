// The GLSL source of the backdrop: sea, shore, sand and meadow, painted from the distance to the land.
// It is given the camera (u_zoom, u_cam) and the screen scale (u_S), so it is as sharp as you zoom.
// The wind (u_wind: direction x, y; strength for the sea, 0 calm .. 1 stormy; whitecaps on or off for a slow device) and the
// middle of the land (u_isle) shape the sea: with strength 0 everything below is exactly the calm sea. As it rises, the
// ripples stretch along the wind and drift downwind, whitecaps (short soft crests across the wind, each leaving a faint
// foam streak behind it, upwind, living a few seconds, denser in gusty patches) break on open water, and the surf on
// the shore grows wider and brighter, most on the shore the wind blows onto. The cost: at most two extra noise() calls
// per sea pixel, and none when the wind is calm or the device is slow.
// The waves style (u_waves.x, from the viewer's Waves setting) picks what the open sea shows:
//   0 Off        a plain sea: no twinkling dots, no crests, and no extra surf from the wind;
//   1 Original   the small white dots that twinkle now and then (the sea as it always was), no crests;
//   2 Crescents  the crests, each a short arc whose ends bend back away from the wind;
//   3 Dashes     the crests as short straight dashes across the wind (#181).
// u_waves.y is the wind strength 0..1 itself: the crest styles start at a light wind (see Wind.crests), before the sea
// strength u_wind.z leaves 0.
export const MAX_LAND = 14;      // land blobs the shader can merge
export const MAX_RIPPLES = 8;    // ripples it can show at once

export const VERTEX_SHADER = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export const FRAGMENT_SHADER = [
  'precision highp float;',
  'uniform vec2 u_res; uniform float u_S; uniform float u_time; uniform float u_dpr; uniform vec2 u_shift; uniform float u_zoom; uniform vec2 u_cam; uniform vec3 u_obj[' + MAX_LAND + ']; uniform vec3 u_bay; uniform vec4 u_rip[' + MAX_RIPPLES + ']; uniform mat3 u_light; uniform vec4 u_wind; uniform vec2 u_isle; uniform vec2 u_waves;',
  'const vec3 c_dry = vec3(0.957, 0.922, 0.882); const vec3 c_wet = vec3(0.925, 0.863, 0.714); const vec3 c_glow = vec3(0.812, 0.933, 0.769);',
  'const vec3 c_shallow = vec3(0.271, 0.827, 0.812); const vec3 c_mid = vec3(0.086, 0.682, 0.816); const vec3 c_deep = vec3(0.039, 0.416, 0.612);',
  'const vec3 c_foam = vec3(1.0); const vec3 c_grass = vec3(0.663, 0.824, 0.467); const vec3 c_grass2 = vec3(0.455, 0.706, 0.361);',
  'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }',
  'float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }',
  'void main(){',
  '  float S = u_S;',
  '  vec2 fc = gl_FragCoord.xy;',
  '  vec2 ps = vec2(fc.x - 0.5 * u_res.x, 0.5 * u_res.y - fc.y) / S;',   // the screen, in units of the screen's height
  '  vec2 p = ps / u_zoom + u_cam;',                                      // the world under this pixel
  '  vec2 q = p + u_shift;',
  '  vec2 w = p + 0.012 * (vec2(fbm(q * 6.0 + 5.3), fbm(q * 6.0 + 1.9)) - 0.47);',
  '  float d = 10.0;',
  '  for (int i = 0; i < ' + MAX_LAND + '; i++) { vec3 o = u_obj[i]; if (o.z > 0.001) { d = smin(d, length(w - o.xy) - o.z, 0.09); } }',
  '  d = -smin(-d, length(w - u_bay.xy) - u_bay.z, 0.05);',     // the cove is cut out of the land
  '  d += (fbm(q * 9.0) - 0.47) * 0.02;',
  '  float t = u_time;',
  '  float ph = fbm(q * 2.5) * 9.0;',
  '  float sd = d - 0.006 * sin(t * 0.9 + ph);',
  '  vec3 col;',
  '  if (sd < 0.0) {',
  '    float ring = smoothstep(-0.07, -0.035, d);',
  '    col = mix(c_dry, c_wet, ring * 0.9);',
  '    col += 0.05 * smoothstep(0.008, 0.0, abs(d + 0.05));',
  '    col *= 0.965 + 0.07 * fbm(q * 26.0);',
  '    col *= 1.0 + 0.05 * (noise(q * 150.0) - 0.5) * smoothstep(1.4, 3.0, u_zoom);',   // finer grain appears as you zoom in
  '    float gn = fbm(q * 6.0 + 4.0);',
  '    float gd = d + (gn - 0.5) * 0.05;',
  '    float gm = smoothstep(-0.06, -0.072, gd);',
  '    vec3 gc = mix(c_grass, c_grass2, smoothstep(0.38, 0.66, fbm(q * 9.0 + 9.0)));',
  '    gc = mix(gc, c_grass2 * 0.84, smoothstep(0.5, 0.75, fbm(q * 3.5 + 70.0)) * 0.55);',
  '    gc *= 0.94 + 0.12 * fbm(q * 44.0);',
  '    gc *= 1.0 + 0.1 * (noise(q * 200.0) - 0.5) * smoothstep(1.4, 3.0, u_zoom);',
  '    vec2 ca = p * (S * u_zoom / (u_dpr * 2.2));',                         // dots stay the same size on screen but stick to the ground when you pan
  '    float fh = hash(floor(ca) + 9.1);',
  '    float rm = 1.0 - smoothstep(0.34, 0.5, length(fract(ca) - 0.5));',
  '    gc = mix(gc, mix(vec3(1.0, 0.97, 0.82), vec3(1.0, 0.8, 0.82), step(0.5, fract(fh * 91.0))), step(0.994, fh) * rm * smoothstep(-0.08, -0.1, gd));',
  '    col = mix(col, col * 0.92, smoothstep(-0.045, -0.06, gd) * (1.0 - gm) * 0.7);',
  '    col = mix(col, gc, gm);',
  '    col = mix(col, c_wet * 0.92, smoothstep(-0.02, 0.0, sd) * 0.6);',
  '  } else {',
  '    col = mix(c_shallow, c_mid, smoothstep(0.03, 0.2, sd));',
  '    col = mix(col, c_deep, smoothstep(0.16, 0.62, sd));',
  '    col = mix(c_glow, col, smoothstep(-0.004, 0.075, sd));',
  '    col += 0.055 * (fbm(q * 1.7 + 50.0) - 0.47);',
  '    float ws = u_wind.z; vec2 wd = u_wind.xy, wn = vec2(-wd.y, wd.x);',
  '    vec2 qa = vec2(dot(q, wd), dot(q, wn));',                             // the sea in the wind's frame: along it, across it
  '    vec2 qw = mix(q, wd * qa.x * (1.0 - 0.55 * ws) + wn * qa.y * (1.0 + 0.6 * ws), ws) - wd * (t * 0.02 * ws);',   // stretched along the wind and drifting downwind (just q when calm)
  '    col += (0.04 + 0.03 * ws) * (fbm(qw * 4.0 + vec2(t * 0.03, -t * 0.02)) - 0.47);',
  '    col += 0.03 * (noise(q * 40.0 + vec2(t * 0.1, -t * 0.07)) - 0.5) * smoothstep(1.4, 3.0, u_zoom);',
  '    float bed = smoothstep(0.56, 0.74, fbm(q * 3.4 + 31.0)) * smoothstep(0.06, 0.13, sd) * (1.0 - smoothstep(0.26, 0.42, sd));',
  '    col = mix(col, col * vec3(0.72, 0.9, 0.86), bed * 0.45);',
  '    float w2 = smoothstep(0.004, 0.0, abs(sd - 0.03 - 0.006 * sin(t * 0.9 - 1.6 + ph)));',
  '    float face = clamp(dot(normalize(w - u_isle + vec2(1e-4)), -wd), 0.0, 1.0);',   // 1 on the shore the wind blows onto
  '    float surf = ws * step(0.5, u_waves.x) * (0.12 + 0.88 * face * face);',                    // strong on the shore the wind blows onto, modest on the lee side
  '    col = mix(col, c_foam, w2 * (0.22 + 0.6 * surf));',
  '    col = mix(col, c_foam, (1.0 - smoothstep(0.0, 0.004 + 0.016 * surf, sd)) * surf * 0.85);',   // a wide band of white water on the beach
  '    float wl = smoothstep(0.06, 0.2, u_waves.y);',                      // light wind: a sprinkling of small, faint crests (see Wind.crests)
  '    if (u_waves.x > 1.5 && wl * u_wind.w > 0.001) {',                   // crests: Crescents or Dashes, some wind, and a fast enough device
  '      vec2 wf = vec2(dot(q, wd) - t * 0.012, dot(q, wn));',             // the sea in the wind frame (x downwind), drifting with the wind
  '      float patches = smoothstep(0.35, 0.75, noise(wf * vec2(1.6, 2.4) + 40.0));',   // noise 1: busy gusty patches (1) and calm lanes (0)
  '      vec2 cg = wf / vec2(0.06, 0.05), id = floor(cg), lp = (fract(cg) - 0.5) * vec2(0.06, 0.05);',   // one possible cap per cell
  '      float h0 = hash(id + 0.37), age = t / 4.0 + h0 * 7.0, cyc = floor(age); age = fract(age);',   // each cap lives about four seconds
  '      float h = hash(id + cyc * vec2(13.7, 5.3));',                      // a new cap, somewhere else in the cell, every life
  '      float dens = max(clamp((ws - 0.15) * 1.2, 0.0, 1.0), 0.05 * wl) * (0.08 + 0.85 * patches);',   // sparse, except in the gusts; few at a breeze, more in a storm
  '      float life = step(1.0 - dens, h) * smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.45, 1.0, age));',   // forms, peaks, fades
  '      float r = fract(h * 37.0), sz = (0.4 + 0.8 * r * r) * max(0.6 + 0.6 * ws, 0.5 + 0.1 * wl);',   // sizes vary threefold, most caps small
  '      vec2 dc = lp - (vec2(fract(h * 91.0), fract(h * 53.0)) - 0.5) * vec2(0.024, 0.016);',   // anywhere in its cell, so no rows or columns
  '      dc.x += step(u_waves.x, 2.5) * (18.0 + 22.0 * fract(h * 17.0)) / sz * dc.y * dc.y;',   // Crescents: the further from its middle, the further upwind, so the ends bend back away from the wind (more for some crests than others); the trail follows the arc
  '      float crest = 1.0 - smoothstep(0.35, 1.0, length(dc / (vec2(0.0028, 0.012) * sz)));',   // short, thin, long across the wind
  '      float trail = smoothstep(0.0, 0.002, -dc.x) * (1.0 - smoothstep(0.0, 0.012 * sz, -dc.x)) * (1.0 - smoothstep(0.3, 1.0, abs(dc.y) / (0.008 * sz)));',   // the foam the crest leaves behind it, upwind
  '      float grain = mix(0.8, noise(wf * vec2(380.0, 160.0)), clamp(u_S * u_zoom / 1500.0, 0.0, 1.0));',   // noise 2: breaks the foam up softly; fades out when its specks would be smaller than a pixel
  '      float foam = max(crest * (0.75 + 0.25 * grain), trail * 0.45 * grain) * life;',
  '      col = mix(col, c_foam, foam * max(smoothstep(0.0, 0.2, ws) * (0.58 + 0.12 * ws), 0.36 * wl) * smoothstep(0.03, 0.09, sd));',
  '    }',
  '    float rip = 0.0;',
  '    for (int i = 0; i < ' + MAX_RIPPLES + '; i++) { vec4 r = u_rip[i]; if (r.w > 0.001) {',
  '      float dist = length(w - r.xy);',
  '      rip += r.w * (smoothstep(0.009, 0.0, abs(dist - r.z)) + 0.55 * smoothstep(0.007, 0.0, abs(dist - r.z * 0.62)) + 0.3 * smoothstep(0.006, 0.0, abs(dist - r.z * 0.3)));',
  '    } }',
  '    col = mix(col, c_foam, clamp(rip, 0.0, 1.0) * 0.6 * smoothstep(0.0, 0.03, sd));',
  '  }',
  '  col = mix(col, c_foam, smoothstep(0.005, 0.0, abs(sd - 0.002)) * 0.9);',
  '  float prob = 0.4 * exp(-abs(sd - 0.004) * 75.0);',
  '  vec2 cb = p * (S * u_zoom / (u_dpr * 1.5));',
  '  float rb = 1.0 - smoothstep(0.34, 0.5, length(fract(cb) - 0.5));',
  '  col = mix(col, c_foam, step(1.0 - prob, hash(floor(cb))) * rb * 0.9);',
  '  vec2 cs = p * (S * u_zoom / (u_dpr * 3.0));',
  '  float h2 = hash(floor(cs) + 3.7);',
  '  float rs = 1.0 - smoothstep(0.34, 0.5, length(fract(cs) - 0.5));',
  '  if (u_waves.x > 0.5 && u_waves.x < 1.5)',                             // Original only: the twinkling dots
  '  col = mix(col, c_foam, step(0.9965, h2) * rs * step(0.04, sd) * (0.5 + 0.5 * sin(t * 1.5 + h2 * 40.0)) * 0.75);',
  '  col = u_light * col;',                                              // the time of day's light (see Lighting)
  '  col *= 1.0 - 0.14 * dot(ps * 0.75, ps * 0.75);',
  '  col += (hash(fc + 1.3) - 0.5) * 0.04;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');
