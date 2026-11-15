import { TAU } from '../core/math.js';

/**
 * WindSwirls: the wind made visible. Thin white streaks that appear over the sea and the island, sweep along with the
 * wind, curl into a small loop at their end and fade, the way games and films draw a gust.
 *
 * How many there are, how long and how fast follows the wind's strength (Wind.strength, 0..1): none when it is calm
 * (below START), a few on a windy day, many, longer and faster in a storm. They always run the way the wind blows.
 *
 * One swirl is a fixed line laid out when it appears: a nearly straight run downwind with a slight bend, then a loop that
 * tightens. It is laid out on the ground and flattened like everything on the island (seen from above at an angle), so
 * the loop is a flat oval. What is shown of the line changes through the swirl's life (1.5 to 3 seconds): the front runs
 * out along the line, the back follows later, so a trail grows, curls, then shrinks into its loop and fades. All the
 * while the whole swirl drifts downwind.
 *
 * Cheap: a fixed pool of POOL swirls, each with its own points kept in one typed array, all made once. Nothing is created
 * while it runs; a frame is at most two strokes of a short line per swirl.
 *
 * The island's own random source is never used here: the swirls come and go with the wind, and the island's layout
 * stays the same for its seed.
 */
const POOL = 18;          // the most swirls at once
const POINTS = 56;        // points along one swirl's line
const RUN = 0.6;          // the share of the points in the straight run; the rest make the loop
const START = 0.18;       // the wind strength below which there are none (a chosen Calm is 0.05)
const FULL = 0.9;         // the strength at which there are the most (a chosen Stormy)
const DAY_ALPHA = 0.5, NIGHT_ALPHA = 0.34;   // how white at its strongest, by day and at full night (softer)
const WIDTH = 0.0017;     // the line's width in world units at zoom 1
const ease = t => t * t * (3 - 2 * t);
/** The x (axis 0) or y (axis 1) of the place `frac` of the way from point i to the next. */
const between = (pts, i, frac, axis) => { const j = Math.min(POINTS - 1, i + 1); return pts[i * 2 + axis] + (pts[j * 2 + axis] - pts[i * 2 + axis]) * frac; };

export class WindSwirls {
  static POOL = POOL;
  static START = START;

  /** How hard it blows for the swirls: 0 at START and below, 1 at FULL and above. */
  static gust(strength) { return Math.min(1, Math.max(0, (strength - START) / (FULL - START))); }

  /** How many swirls there should be at once for a wind strength: none when calm, about five when windy, sixteen in a storm. */
  static countFor(strength) {
    const g = WindSwirls.gust(strength);
    return g <= 0 ? 0 : Math.round(1.5 + 14.5 * Math.pow(g, 1.2));
  }

  /** How far downwind a swirl drifts in a second (world units) at a wind strength. */
  static driftFor(strength) { return 0.03 + 0.1 * WindSwirls.gust(strength); }

  /** How long a swirl lives (seconds) at a wind strength: three seconds in a light wind, half that in a storm. `vary` 0..1 spreads them. */
  static lifeFor(strength, vary = 0.5) {
    return Math.min(3, Math.max(1.5, (3 - 1.5 * WindSwirls.gust(strength)) * (0.85 + 0.3 * vary)));
  }

  /**
   * Which part of its line a swirl shows at `p` (0..1 of its life) and how strongly: the front runs out first, the back
   * follows, and it fades in quickly and out slowly.
   * @returns {number} written to `out`: [back, front, opacity], each 0..1
   */
  static shown(p, out) {
    out[0] = ease(Math.min(1, Math.max(0, (p - 0.35) / 0.65)));
    out[1] = ease(Math.min(1, p / 0.6));
    out[2] = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.4);
    return out;
  }

  constructor() {
    this.pool = Array.from({ length: POOL }, () => ({ live: false, t: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, reach: 0, points: new Float32Array(POINTS * 2) }));
    this.active = 0; this.wait = 0;
    this.part = [0, 0, 0];   // where shown() writes
  }

  /** Takes every swirl away (a new island, another wind direction). */
  clear() { for (const s of this.pool) s.live = false; this.active = 0; this.wait = 0; }

  /**
   * Moves the swirls on by dt seconds and lets new ones appear.
   * @param {number} dt
   * @param {{ vector: number[], strength: number }} wind the wind (see Wind)
   * @param {number} hw half the view's width in world units
   * @param {number} hh half its height
   */
  update(dt, wind, hw, hh) {
    let active = 0;
    for (const s of this.pool) {
      if (!s.live) continue;
      s.t += dt;
      if (s.t >= s.life) { s.live = false; continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      active++;
    }
    this.active = active;
    const want = WindSwirls.countFor(wind.strength);
    this.wait -= dt;
    if (want === 0) { this.wait = 0; return; }   // calm: those in the air finish, no new ones
    if (active < want && this.wait <= 0) {
      this.#spawn(wind, hw, hh);
      this.wait = WindSwirls.lifeFor(wind.strength) / want * (0.4 + 1.2 * Math.random());   // on average one life's worth of swirls is in the air
    }
  }

  /** Lays out a new swirl in a free place of the pool. */
  #spawn(wind, hw, hh) {
    let s = null;
    for (const one of this.pool) if (!one.live) { s = one; break; }
    if (!s) return;
    const g = WindSwirls.gust(wind.strength), wx = wind.vector[0], wy = wind.vector[1];
    const angle = Math.atan2(wy * 2, wx), cos = Math.cos(angle), sin = Math.sin(angle);   // the wind's direction on the ground (its y is flattened by half)
    const run = (0.09 + 0.1 * Math.random()) * (1 + 0.9 * g);          // the straight run's length: longer when it blows harder
    const loop = run * (0.5 + 0.2 * Math.random());                     // the length of line wound into the loop
    const side = Math.random() < 0.5 ? -1 : 1;                          // which way it curls
    const bend = (Math.random() - 0.5) * 0.5;                           // how much the run bends on its way
    const turns = TAU * (1.05 + 0.3 * Math.random());                   // a full loop and a bit
    const pts = s.points, runPoints = Math.round(POINTS * RUN), loopPoints = POINTS - runPoints;
    let a = 0, b = 0;   // along and across the wind, on the ground
    for (let i = 0; i < POINTS; i++) {
      // onto the screen: along the wind and across it, the across-and-up part flattened by half
      pts[i * 2] = a * cos - b * sin; pts[i * 2 + 1] = (a * sin + b * cos) * 0.5;
      let heading, step;
      if (i < runPoints) { heading = bend * Math.sin(i / runPoints * Math.PI); step = run / runPoints; }
      else { const v = (i - runPoints) / loopPoints; heading = side * turns * Math.pow(v, 1.25); step = loop / loopPoints * (1.3 - 0.6 * v); }   // the loop tightens
      a += Math.cos(heading) * step; b += Math.sin(heading) * step;
    }
    const drift = WindSwirls.driftFor(wind.strength) * (0.8 + 0.4 * Math.random());
    s.vx = cos * drift; s.vy = sin * 0.5 * drift;
    s.life = WindSwirls.lifeFor(wind.strength, Math.random());
    s.reach = run + loop;
    // somewhere in the view, started a little upwind so that its run crosses the spot
    s.x = (Math.random() * 2 - 1) * hw - cos * run * 0.5; s.y = (Math.random() * 2 - 1) * hh - sin * 0.5 * run * 0.5;
    s.t = 0; s.live = true; this.active++;
  }

  /**
   * Draws the swirls: for each, the shown part of its line as a faint stroke, and its front half once more, so the front is
   * the whitest and the tail trails off.
   * @param {CanvasRenderingContext2D} c in world units
   * @param {number} zoom the camera's zoom (the line thickens less than the picture grows)
   * @param {number} pixels screen pixels per world unit (the line is never thinner than about one)
   * @param {number} darkness 0 day .. 1 night: softer in the dark
   * @param {{ minX, maxX, minY, maxY } | null} view what is on screen; swirls wholly outside it are skipped
   */
  draw(c, zoom = 1, pixels = 1000, darkness = 0, view = null) {
    if (this.active === 0) return;
    const peak = DAY_ALPHA + (NIGHT_ALPHA - DAY_ALPHA) * darkness, part = this.part, last = POINTS - 1;
    c.strokeStyle = '#fff'; c.lineWidth = Math.max(WIDTH / Math.sqrt(zoom), 1.2 / pixels);
    for (const s of this.pool) {
      if (!s.live) continue;
      if (view && (s.x + s.reach < view.minX || s.x - s.reach > view.maxX || s.y + s.reach < view.minY || s.y - s.reach > view.maxY)) continue;
      WindSwirls.shown(s.t / s.life, part);
      const from = part[0] * last, to = part[1] * last, alpha = part[2] * peak;
      if (to - from < 0.05 || alpha < 0.01) continue;
      c.globalAlpha = alpha * 0.45; this.#stroke(c, s, from, to);
      c.globalAlpha = alpha * 0.55; this.#stroke(c, s, from + (to - from) * 0.45, to);
    }
    c.globalAlpha = 1;
  }

  /** Strokes a swirl's line between two places along it (in points, with fractions). */
  #stroke(c, s, from, to) {
    const pts = s.points, first = Math.floor(from), end = Math.floor(to), f = from - first, e = to - end;
    c.beginPath(); c.moveTo(s.x + between(pts, first, f, 0), s.y + between(pts, first, f, 1));
    for (let i = first + 1; i <= end; i++) c.lineTo(s.x + pts[i * 2], s.y + pts[i * 2 + 1]);
    if (e > 0) c.lineTo(s.x + between(pts, end, e, 0), s.y + between(pts, end, e, 1));
    c.stroke();
  }
}
