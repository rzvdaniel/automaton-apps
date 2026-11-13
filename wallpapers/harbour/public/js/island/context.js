import { TAU, distTo } from '../core/math.js';
import { scaleFor } from './scales.js';

/**
 * Everything the island-building steps share: the random source, the world they build into, the things laid out so far,
 * and the small questions the steps keep asking ("is this spot clear?", "where is the shore in that direction?").
 * Each step reads what earlier steps left here and adds its own.
 */
export class BuildContext {
  /** @param {import('../engine/world.js').World} world @param {() => number} G the seeded random source */
  constructor(world, G) {
    this.world = world; this.G = G; this.map = world.map; this.hw = world.hw; this.hh = world.hh;
    // laid out by the steps, in order
    this.centre = [0, 0]; this.tip = null; this.outward = [0, 0]; this.light = null;   // land: its middle, the lighthouse point, its direction, the lighthouse
    this.bay = null; this.bayDirection = null; this.back = 0;                           // the cove, which way it faces, and the way from it into the land
    this.quay = []; this.pier = [];
    this.parasols = []; this.standing = [];                                             // beach parasols; where people stand about
    this.church = null; this.houses = [];
    this.sheep = []; this.trees = []; this.gorse = []; this.heather = []; this.marram = [];
    this.stones = []; this.fisher = null; this.moored = [];
    this.extras = null;
  }

  // ---------- randomness ----------
  pick(list) { return list[Math.floor(this.G() * list.length)]; }
  between(lo, hi) { return lo + this.G() * (hi - lo); }

  // ---------- the land ----------
  field(x, y) { return this.world.field(x, y); }
  pushIn(p, depth) { return this.world.pushIn(p, depth); }
  /** Is every item in the list further than `gap` from (x, y)? */
  farFrom(list, x, y, gap) { return list.every(o => Math.hypot(o.x - x, o.y - y) > gap); }
  /** The distance from (x, y) to the nearest road or footpath. */
  nearRoad(x, y) {
    let d = distTo(this.map.path, x, y);
    this.map.roads.forEach(r => { d = Math.min(d, distTo(r.pts, x, y)); });
    return d;
  }
  offChurch(x, y, gap) { return !this.church || Math.hypot(x - this.church.x, y - this.church.y) > gap; }
  inCell(x, y) { return this.map.cells.some(o => Math.hypot(o.mx - x, o.my - y) < 0.045); }
  /** Is (x, y) free of roads, walls, houses, the church and the lighthouse, with room `r` to spare? */
  clear(x, y, r) {
    return this.nearRoad(x, y) > 0.011 + r && !this.inCell(x, y) && this.farFrom(this.houses, x, y, 0.022 + r)
      && this.offChurch(x, y, 0.045) && Math.hypot(x - this.light.x, y - this.light.y) > 0.03;
  }
  /** Where the shore is, walking out from the middle of the island in a given direction. */
  shoreAt(angle) {
    let [x, y] = this.centre;
    for (let s = 0; s < 140 && this.field(x, y) < -0.003; s++) { x += Math.cos(angle) * 0.008; y += Math.sin(angle) * 0.008; }
    return [x, y];
  }
  offCove(x, y, gap) { return Math.hypot(x - this.bay[0], y - this.bay[1]) > this.bay[2] + gap; }
  onScreen(x, y, edge) { return Math.abs(x) < this.hw - edge && Math.abs(y) < this.hh - edge; }

  /** Scatters up to `n` things around (sx, sy) in clear spots between depths lo and hi inland; `tag(thing, depth)` can add to each. */
  scatter(list, n, sx, sy, radius, lo, hi, size, tag) {
    const { G } = this;
    for (let s = 0; s < n * 5 && n > 0; s++) {
      const a = G() * TAU, d = Math.sqrt(G()) * radius, x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d, f = this.field(x, y);
      if (f < -lo && f > -hi && this.clear(x, y, 0.004)) {
        const thing = { x, y, r: size * (0.75 + G() * 0.5), rot: G() * TAU };
        if (tag) tag(thing, f);
        list.push(thing); n--;
      }
    }
  }
  /** A spot in open water (field between lo and hi); null when there is none. */
  water(lo, hi, edge) {
    for (let s = 0; s < 60; s++) {
      const x = this.between(-this.hw + edge, this.hw - edge), y = this.between(-this.hh + edge, this.hh - edge), f = this.field(x, y);
      if (f > lo && f < hi && this.offCove(x, y, 0.08)) return [x, y];
    }
    return null;
  }
  /** A spot in clear meadow; tries hard first, then settles for tighter spots. Null when there is none. */
  meadow(radius, gap) {
    for (let s = 0; s < 240; s++) {
      const x = this.between(-this.hw, this.hw), y = this.between(-this.hh, this.hh), loose = s > 100 ? 0.6 : 1;
      if (this.field(x, y) < (loose < 1 ? -0.07 : -0.09) && this.clear(x, y, radius * loose) && this.farFrom(this.trees, x, y, gap * loose) && this.farFrom(this.stones, x, y, gap * loose)) return [x, y];
    }
    return null;
  }

  /** Puts an entity in the world, at the size set for its kind. */
  add(entity) { entity.scale = scaleFor(entity); return this.world.add(entity); }
}
