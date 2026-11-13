// The backdrop: one fragment shader paints sea, shore, sand and meadow from the distance to the land.
(function (H) {
  'use strict';
  const MAXO = 14, MAXR = 8;
  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  const FS = [
    'precision highp float;',
    'uniform vec2 u_res; uniform float u_S; uniform float u_time; uniform float u_dpr; uniform vec2 u_shift; uniform float u_zoom; uniform vec2 u_cam; uniform vec3 u_obj[' + MAXO + ']; uniform vec3 u_bay; uniform vec4 u_rip[' + MAXR + '];',
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
    '  for (int i = 0; i < ' + MAXO + '; i++) { vec3 o = u_obj[i]; if (o.z > 0.001) { d = smin(d, length(w - o.xy) - o.z, 0.09); } }',
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
    '    col += 0.04 * (fbm(q * 4.0 + vec2(t * 0.03, -t * 0.02)) - 0.47);',
    '    col += 0.03 * (noise(q * 40.0 + vec2(t * 0.1, -t * 0.07)) - 0.5) * smoothstep(1.4, 3.0, u_zoom);',
    '    float bed = smoothstep(0.56, 0.74, fbm(q * 3.4 + 31.0)) * smoothstep(0.06, 0.13, sd) * (1.0 - smoothstep(0.26, 0.42, sd));',
    '    col = mix(col, col * vec3(0.72, 0.9, 0.86), bed * 0.45);',
    '    float w2 = smoothstep(0.004, 0.0, abs(sd - 0.03 - 0.006 * sin(t * 0.9 - 1.6 + ph)));',
    '    col = mix(col, c_foam, w2 * 0.22);',
    '    float rip = 0.0;',
    '    for (int i = 0; i < ' + MAXR + '; i++) { vec4 r = u_rip[i]; if (r.w > 0.001) {',
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
    '  col = mix(col, c_foam, step(0.9965, h2) * rs * step(0.04, sd) * (0.5 + 0.5 * sin(t * 1.5 + h2 * 40.0)) * 0.75);',
    '  col *= 1.0 - 0.14 * dot(ps * 0.75, ps * 0.75);',
    '  col += (hash(fc + 1.3) - 0.5) * 0.04;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  H.Backdrop = class {
    static MAX_RIPPLES = MAXR;
    constructor(canvas) {
      this.canvas = canvas; this.U = {}; this.objBuf = new Float32Array(MAXO * 3); this.ripBuf = new Float32Array(MAXR * 4);
      let gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
      if (gl) {
        const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); gl = null; }
        else {
          gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          ['u_res', 'u_S', 'u_time', 'u_dpr', 'u_shift', 'u_zoom', 'u_cam', 'u_obj', 'u_bay', 'u_rip'].forEach(n => { this.U[n] = gl.getUniformLocation(prog, n); });
        }
      }
      this.gl = gl;
    }
    setLand(land) { this.objBuf.fill(0); land.forEach((b, n) => { if (n < MAXO) this.objBuf.set(b, n * 3); }); }
    render(world) {
      const gl = this.gl, U = this.U, cv = this.canvas, map = world.map; if (!gl) return;
      gl.viewport(0, 0, cv.width, cv.height);
      this.ripBuf.fill(0);
      world.ripples.forEach((r, j) => { const life = 1 - r.t / 2.8; this.ripBuf.set([r.x, r.y, 0.01 + 0.17 * Math.pow(r.t / 2.8, 0.75) * (0.5 + 0.5 * r.k), r.k * life * life], j * 4); });
      gl.uniform2f(U.u_res, cv.width, cv.height); gl.uniform1f(U.u_S, world.S * world.glScale); gl.uniform1f(U.u_time, world.clock); gl.uniform1f(U.u_dpr, world.glScale); gl.uniform2f(U.u_shift, map.shift[0], map.shift[1]); gl.uniform1f(U.u_zoom, world.cam.zoom); gl.uniform2f(U.u_cam, world.cam.x, world.cam.y);
      gl.uniform3fv(U.u_obj, this.objBuf); gl.uniform3f(U.u_bay, map.BAY[0], map.BAY[1], map.BAY[2]); gl.uniform4fv(U.u_rip, this.ripBuf);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
})(window.Harbour);
