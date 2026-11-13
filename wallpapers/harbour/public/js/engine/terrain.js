import { smin } from '../core/math.js';

/** The shape of the land: a set of overlapping blobs (some carved out as the cove), and questions about distance to the shore. */
export class Terrain {
  constructor() { this.reset(); }

  /** Forgets the island. `map` holds everything the generator lays out. */
  reset() {
    this.map = {
      land: [],          // blobs [x, y, radius] that merge into the island
      bay: null,         // [x, y, radius] of the cove cut out of it
      shift: [0, 0],     // where in the noise the shader samples, so each island looks different
      roads: [], path: [], quay: [], pier: [], cells: []
    };
  }

  /** The distance to the shore: negative on land, positive at sea. */
  field(x, y) {
    const { land, bay } = this.map; let d = 10;
    for (let i = 0; i < land.length; i++) d = smin(d, Math.hypot(x - land[i][0], y - land[i][1]) - land[i][2], 0.09);
    return bay ? -smin(-d, Math.hypot(x - bay[0], y - bay[1]) - bay[2], 0.05) : d;
  }
  /** The distance to the shore and the direction that leads away from land (gx, gy). */
  grad(x, y) {
    const e = 0.012, d = this.field(x, y), gx = (this.field(x + e, y) - d) / e, gy = (this.field(x, y + e) - d) / e, len = Math.hypot(gx, gy) || 1;
    return { d, gx: gx / len, gy: gy / len };
  }
  /** Moves point p inland until it is at least `depth` inside the shore. Returns p. */
  pushIn(p, depth) {
    for (let i = 0; i < 40; i++) { const g = this.grad(p[0], p[1]); if (g.d < -depth) break; p[0] -= g.gx * 0.007; p[1] -= g.gy * 0.007; }
    return p;
  }
}
