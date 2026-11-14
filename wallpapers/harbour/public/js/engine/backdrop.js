import { VERTEX_SHADER, FRAGMENT_SHADER, MAX_LAND, MAX_RIPPLES } from './shader-source.js';
import { RepaintPolicy } from './repaint-policy.js';

const UNIFORMS = ['u_res', 'u_S', 'u_time', 'u_dpr', 'u_shift', 'u_zoom', 'u_cam', 'u_obj', 'u_bay', 'u_rip', 'u_light'];

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
    return gl;
  }

  /** Gives the shader the island's land blobs (call after the island is laid out). */
  setLand(land) {
    this.policy.invalidate();
    this.landBuffer.fill(0);
    land.forEach((blob, n) => { if (n < MAX_LAND) this.landBuffer.set(blob, n * 3); });
  }

  /** Uses a new light: a 3 x 3 colour matrix, row by row, from Lighting. The picture is repainted with it next frame. */
  setLight(rows) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.lightMatrix[c * 3 + r] = rows[r * 3 + c];   // GLSL wants it column by column
    this.policy.invalidate();
  }

  /** Resizes the drawing surface to `width` x `height` pixels (which clears it, so it is repainted next). */
  resize(width, height) { this.canvas.width = width; this.canvas.height = height; this.policy.invalidate(); }

  /** Paints one frame, or leaves the last picture in place when it still does. */
  render({ viewport, camera, terrain, effects, time }) {
    const gl = this.gl, u = this.uniforms, { map } = terrain;
    if (!gl) return;
    if (!this.policy.shouldPaint({ x: camera.x, y: camera.y, zoom: camera.zoom, time })) return;
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
    gl.uniform2f(u.u_cam, camera.x, camera.y);
    gl.uniform3fv(u.u_obj, this.landBuffer);
    gl.uniform3f(u.u_bay, ...(map.bay ?? [0, 0, 0]));
    gl.uniform4fv(u.u_rip, this.rippleBuffer);
    gl.uniformMatrix3fv(u.u_light, false, this.lightMatrix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
