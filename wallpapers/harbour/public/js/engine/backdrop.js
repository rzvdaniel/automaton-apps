import { VERTEX_SHADER, FRAGMENT_SHADER, MAX_LAND, MAX_RIPPLES } from './shader-source.js';
import { RepaintPolicy } from './repaint-policy.js';
import { Wind } from './wind.js';
import { paletteSet, blend, DEFAULT_PALETTE } from '../sky/palettes.js';

/** The waves styles (see Settings) as the shader's numbers. */
export const WAVE_STYLES = Object.freeze({ off: 0, original: 1, crescents: 2, dashes: 3 });

const UNIFORMS = ['u_res', 'u_S', 'u_time', 'u_dpr', 'u_shift', 'u_zoom', 'u_cam', 'u_obj', 'u_bay', 'u_rip', 'u_light', 'u_lightAdd', 'u_night', 'u_phase', 'u_pal', 'u_moon', 'u_wind', 'u_isle', 'u_waves'];

/**
 * The backdrop: sea, shore, sand and meadow, painted by a WebGL fragment shader onto its own canvas.
 * If WebGL is not available, `gl` is null and the renderer paints a flat fallback.
 * The shader is the most expensive thing on the screen, so it is only repainted when needed (see RepaintPolicy).
 */
export class Backdrop {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.policy = new RepaintPolicy();
    this.uniforms = {};
    this.landBuffer = new Float32Array(MAX_LAND * 3);
    this.rippleBuffer = new Float32Array(MAX_RIPPLES * 4);
    this.lightMatrix = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);   // the time of day's light (see Lighting); plain daylight
    this.wind = new Float32Array([1, 0, 0, 1]);   // u_wind: which way it blows (x, y), how hard for the sea (0 calm), and whether to draw whitecaps (1) or not (0)
    this.night = new Float32Array(2);   // u_night: how much the night palette shows (0 by day .. 1) and the moonlight (0..1)
    this.phase = new Float32Array([1, 0, 0, 0]);   // u_phase: how much the day, sunrise, sunset and night palettes show (they sum to 1)
    this.palette = DEFAULT_PALETTE; this.pal = blend(paletteSet(this.palette)); this.palDirty = true;   // u_pal: 18 colours, the day palette and the blended rest, sent only when they change
    this.moon = new Float32Array(3);   // u_moon: the moon's direction on the screen (x, y; east +x, north -y) and the strength of its glitter on the sea (0 by day, with no moon)
    this.lightAdd = new Float32Array(3);   // added after the multiply (u_lightAdd); none by day
    this.waves = new Float32Array([1, Wind.REFERENCE]);   // u_waves: the style (WAVE_STYLES) and the wind strength 0..1 (light-wind crests start before the sea strength does)
    this.isle = new Float32Array(2);              // u_isle: the middle of the land, so the shader knows which shore faces the wind
    // the picture is kept between frames (preserveDrawingBuffer), so a frame can be skipped without the sea going blank
    this.gl = this.#setup(canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true }));
  }

  #setup(gl) {
    if (!gl) return null;
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(program)); return null; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    UNIFORMS.forEach(name => { this.uniforms[name] = gl.getUniformLocation(program, name); });
    this.palDirty = true;   // the program is new: it has no palette yet
    return gl;
  }

  /** Gives the shader the island's land blobs (call after the island is laid out). */
  setLand(land) {
    this.policy.invalidate();
    this.landBuffer.fill(0);
    land.forEach((blob, n) => { if (n < MAX_LAND) this.landBuffer.set(blob, n * 3); });
    let x = 0, y = 0, sum = 0;   // the middle of the land: each blob counts as much as it is big
    land.forEach(([bx, by, r]) => { x += bx * r; y += by * r; sum += r; });
    this.isle[0] = sum ? x / sum : 0; this.isle[1] = sum ? y / sum : 0;
  }

  /**
   * Uses the wind (see Wind): its direction, made one long, and its strength for the sea. On a slow device (`quality`
   * below 1, see Viewport) the whitecaps are left out, which saves the shader its extra noise. The picture is repainted
   * only when the wind has changed enough to see.
   * @param {{ vector: number[], sea: number, strength: number }} wind
   * The waves style (see Settings) goes with it; an unknown one is the original sea.
   * @param {number} quality 1 = full detail
   * @param {string} waves 'off' | 'original' | 'crescents' | 'dashes'
   */
  setWind(wind, quality = 1, waves = 'original') {
    const [x, y] = wind.vector, len = Math.hypot(x, y) || 1;
    const next = [x / len, y / len, wind.sea, quality >= 1 ? 1 : 0];
    if (next.some((v, i) => Math.abs(v - this.wind[i]) > 0.002)) { this.wind.set(next); this.policy.invalidate(); }
    const style = [WAVE_STYLES[waves] ?? 1, wind.strength ?? Wind.REFERENCE];
    if (style.some((v, i) => Math.abs(v - this.waves[i]) > 0.002)) { this.waves.set(style); this.policy.invalidate(); }
  }

  /** Uses a new light: a 3 x 3 colour matrix, row by row, from Lighting, with the offset, the night amount, the moonlight and the palette weights. The picture is repainted with it next frame. */
  setLight(rows, add = [0, 0, 0], night = 0, moon = 0, phases = [1, 0, 0, 0]) {
    this.lightAdd.set(add); this.night.set([night, moon]); this.phase.set(phases); this.#blend();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.lightMatrix[c * 3 + r] = rows[r * 3 + c];   // GLSL wants it column by column
    this.policy.invalidate();
  }

  /** Uses a palette set (an id, see palettes.js); an unknown id is the default. The colours go to the shader at the next frame, once. */
  setPalette(id) {
    if (id === this.palette) return;
    this.palette = id; this.#blend(); this.policy.invalidate();
  }

  /** Blends the palettes for the current set, weights and moon; marks them to be sent only when they differ from what was sent. */
  #blend() {
    const next = blend(paletteSet(this.palette), this.phase, this.night[1]);
    if (next.some((v, i) => Math.abs(v - this.pal[i]) > 1e-4)) { this.pal = next; this.palDirty = true; }
  }

  /** Uses the moon's glitter ({ x, y, strength }, see DayCycle.glitter); repaints only when it has changed enough to see. */
  setGlitter({ x, y, strength }) {
    const next = [x, y, strength];
    if (next.some((v, i) => Math.abs(v - this.moon[i]) > 0.002)) { this.moon.set(next); this.policy.invalidate(); }
  }

  /** Resizes the drawing surface to `width` x `height` pixels (which clears it, so it is repainted next). */
  resize(width, height) { this.canvas.width = width; this.canvas.height = height; this.policy.invalidate(); }

  /** Paints one frame, or leaves the last picture in place when it still does. */
  render({ viewport, camera, terrain, effects, time }) {
    const gl = this.gl, u = this.uniforms, { map } = terrain;
    if (!gl) return;
    if (!this.policy.shouldPaint({ x: camera.centreX, y: camera.centreY, zoom: camera.zoom, time })) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.rippleBuffer.fill(0);
    effects.ripples.forEach((r, j) => {
      const life = 1 - r.t / 2.8;
      this.rippleBuffer.set([r.x, r.y, 0.01 + 0.17 * Math.pow(r.t / 2.8, 0.75) * (0.5 + 0.5 * r.k), r.k * life * life], j * 4);
    });
    gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.u_S, viewport.scale * viewport.glScale);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_dpr, viewport.glScale);
    gl.uniform2f(u.u_shift, map.shift[0], map.shift[1]);
    gl.uniform1f(u.u_zoom, camera.zoom);
    gl.uniform2f(u.u_cam, camera.centreX, camera.centreY);
    gl.uniform3fv(u.u_obj, this.landBuffer);
    gl.uniform3f(u.u_bay, ...(map.bay ?? [0, 0, 0]));
    gl.uniform4fv(u.u_rip, this.rippleBuffer);
    gl.uniformMatrix3fv(u.u_light, false, this.lightMatrix);
    gl.uniform3fv(u.u_lightAdd, this.lightAdd);
    gl.uniform2fv(u.u_night, this.night);
    gl.uniform4fv(u.u_phase, this.phase);
    if (this.palDirty) { gl.uniform3fv(u.u_pal, this.pal); this.palDirty = false; }
    gl.uniform3fv(u.u_moon, this.moon);
    gl.uniform4fv(u.u_wind, this.wind);
    gl.uniform2fv(u.u_isle, this.isle);
    gl.uniform2fv(u.u_waves, this.waves);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
