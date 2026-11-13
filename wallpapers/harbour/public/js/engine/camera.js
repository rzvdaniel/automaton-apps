import { clamp } from '../core/math.js';

/**
 * Where the view is looking: a zoom and a centre, easing smoothly towards a target. It never shows anything beyond the
 * original view. Works in world units; the Viewport says how big those are on screen.
 */
export class Camera {
  static MAX_ZOOM = 8;
  static EASE_RATE = 9;   // how fast it settles on its target, per second
  static ZOOMED = 1.02;   // above this zoom the view counts as zoomed in

  /** @param {import('./viewport.js').Viewport} viewport */
  constructor(viewport) {
    this.viewport = viewport;
    this.x = this.y = this.targetX = this.targetY = 0;
    this.zoom = this.targetZoom = 1;
    this.listeners = new Set();
  }

  get zoomed() { return this.targetZoom > Camera.ZOOMED; }
  /** Runs `fn` whenever the target changes (zoomed in or out, or reset). Returns a function that stops it. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #changed() { this.listeners.forEach(fn => fn(this)); }

  /** Screen pixels to world units, at the current view. */
  toWorld(px, py) {
    const v = this.viewport, k = v.scale * this.zoom;
    return [this.x + (px - v.width / 2) / k, this.y + (py - v.height / 2) / k];
  }
  /** Where a world x lies across the screen: -1 (left edge) to 1 (right edge). Used to pan sounds. */
  screenFraction(x) {
    const v = this.viewport;
    return x === undefined ? 0 : clamp((x - this.x) * this.zoom * v.scale / (v.width / 2), -1, 1);
  }

  /** Keeps the camera inside the original view, for the current and the target zoom. */
  clampToWorld() {
    const v = this.viewport, mx = zoom => v.hw * (1 - 1 / zoom), my = zoom => v.hh * (1 - 1 / zoom);
    this.targetX = clamp(this.targetX, -mx(this.targetZoom), mx(this.targetZoom));
    this.targetY = clamp(this.targetY, -my(this.targetZoom), my(this.targetZoom));
    this.x = clamp(this.x, -mx(this.zoom), mx(this.zoom));
    this.y = clamp(this.y, -my(this.zoom), my(this.zoom));
  }

  /** Zooms by a factor, keeping the world point under screen position (px, py) where it is. `instant` skips the easing. */
  zoomAt(factor, px, py, instant = false) {
    const v = this.viewport, k0 = v.scale * this.targetZoom;
    const wx = this.targetX + (px - v.width / 2) / k0, wy = this.targetY + (py - v.height / 2) / k0;
    this.targetZoom = clamp(this.targetZoom * factor, 1, Camera.MAX_ZOOM);
    const k1 = v.scale * this.targetZoom;
    this.targetX = wx - (px - v.width / 2) / k1; this.targetY = wy - (py - v.height / 2) / k1;
    this.clampToWorld();
    if (instant) { this.zoom = this.targetZoom; this.x = this.targetX; this.y = this.targetY; }
    this.#changed();
  }
  /** Drags the view by a number of screen pixels, at once. */
  panBy(dx, dy) {
    const k = this.viewport.scale * this.zoom;
    this.x -= dx / k; this.y -= dy / k;
    this.targetX = this.x; this.targetY = this.y; this.targetZoom = this.zoom;
    this.clampToWorld();
  }
  /** Back to the whole view, at once or easing. */
  reset(instant = false) {
    this.targetZoom = 1; this.targetX = this.targetY = 0;
    if (instant) { this.zoom = 1; this.x = this.y = 0; }
    this.#changed();
  }

  /** Moves a step towards the target. Returns true while it is still moving. */
  ease(dt) {
    const u = Math.min(1, dt * Camera.EASE_RATE);
    this.zoom += (this.targetZoom - this.zoom) * u; this.x += (this.targetX - this.x) * u; this.y += (this.targetY - this.y) * u;
    const moving = Math.abs(this.targetZoom - this.zoom) >= 0.0005;
    if (!moving) { this.zoom = this.targetZoom; this.x = this.targetX; this.y = this.targetY; }
    this.clampToWorld();
    return moving;
  }

  /** Sets a 2D context's transform so that drawing in world units lands in the right place on the canvas. */
  applyTo(ctx) {
    const v = this.viewport, k = v.dpr * v.scale * this.zoom;
    ctx.setTransform(k, 0, 0, k, v.dpr * v.width / 2 - this.x * k, v.dpr * v.height / 2 - this.y * k);
  }
}
