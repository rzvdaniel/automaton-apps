/** The wind: one direction for the whole island, with gusts that roll across it. Plants lean with it; smoke and clouds drift on it. */
export class Wind {
  constructor() { this.vector = [1, 0]; }   // x, y: the direction (y is flattened, as the island is seen from above at an angle)

  /** Blows from the given angle. */
  setAngle(angle) { this.vector = [Math.cos(angle), Math.sin(angle) * 0.5]; }

  /** How far the wind bends a plant at this spot at time t, as a fraction of its size. */
  sway(x, y, t) {
    const w = this.vector, gust = 0.5 + 0.5 * Math.sin(t * 0.8 - (x * w[0] + y * w[1]) * 7);
    const k = (0.02 + 0.1 * gust * gust) * (1 + 0.25 * Math.sin(t * 2.3 + x * 31 + y * 17));
    return [w[0] * k, w[1] * k];
  }
}
