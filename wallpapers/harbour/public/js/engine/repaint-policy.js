/**
 * Decides when the backdrop (the shader's picture of sea and land) must be painted again. The sea drifts slowly, so when
 * nothing is moving a repaint about 16 times a second looks the same as every frame and costs the graphics chip far less
 * (ripples and foam move a few pixels per repaint, which still looks smooth). A repaint is needed at once when the view moved,
 * or when the island or the size of the picture changed.
 */
export class RepaintPolicy {
  /** @param {number} idleInterval seconds between repaints while nothing moves */
  constructor(idleInterval = 1 / 16) {
    this.idleInterval = idleInterval;
    this.invalidate();
  }

  /** The picture is out of date (a new island, a new size): paint on the next chance. */
  invalidate() { this.dirty = true; this.x = this.y = this.zoom = NaN; this.time = -Infinity; }

  /**
   * Should the backdrop be painted for this frame? When it says yes it also remembers that it was painted.
   * @param {{ x: number, y: number, zoom: number, time: number }} frame
   *   x, y, zoom: where the camera is; time: seconds since the start
   */
  shouldPaint({ x, y, zoom, time }) {
    const moved = x !== this.x || y !== this.y || zoom !== this.zoom;
    if (!(this.dirty || moved || time - this.time >= this.idleInterval || time < this.time)) return false;
    this.dirty = false; this.x = x; this.y = y; this.zoom = zoom; this.time = time;
    return true;
  }
}
