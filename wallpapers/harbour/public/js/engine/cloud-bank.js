import { Cloud } from '../entities/cloud.js';

/**
 * CloudBank: keeps the clouds in the sky in step with the weather: so many fair clouds (world.weather.clouds) and so many
 * storm clouds (world.weather.stormClouds), each kind counted on its own. The weather gives the numbers for a 3:2 view;
 * a wider or taller screen gets more in proportion, up to MAX.
 *
 * It never makes a cloud pop in or out.
 *   - A sky that is nearly right (one or two short) lets one new cloud drift in at the upwind edge, a little apart from
 *     the last, so they do not come in a crowd.
 *   - A sky that is far short (the viewer chose another weather) fills up where it is: new clouds form across the view,
 *     faded out, away from the others of their kind, and fade in over a few seconds; more at first, then fewer.
 *   - A sky with too many tells the oldest to leave (more of them the more there are too many): they fade as they
 *     drift on, and are not sent round again.
 * So when the weather turns from cloudy to stormy the grey clouds fade while the storm clouds form among them.
 *
 * New fair clouds drifting in also keep out of a clear lane: a band across the wind, a quarter of the screen wide, that
 * wanders slowly. Storm clouds do not: a storm is crowded, and its gaps are where they happen to fall.
 *
 * When the viewer has just picked a weather (world.hurry), none of that waits: the excess clouds all leave and the missing ones
 * form across the view at once, and both fade in about a second and a half.
 *
 * The world calls update() about once a second, after the weather. The island's own random source is never used here:
 * clouds come and go with the weather, and the island's layout stays the same for its seed.
 */
const SPACING = 6;   // seconds at least between two new clouds drifting in
const FAR_SHORT = 2; // more than this many short: the sky fills up where it is
const HURRY_FORM = 8; // after the viewer's choice: at most this many form per update (there are ten updates a second), so the sky fills in a third of a second

export class CloudBank {
  static MAX = 34;   // the most clouds of one kind, whatever the screen

  /** @param {import('./world.js').World} world */
  constructor(world) { this.world = world; this.wait = 0; }

  /** The clouds still in the sky (not leaving): all of them, or only the fair (false) or the storm (true) ones. */
  staying(storm) { return this.world.all(Cloud).filter(c => !c.leaving && !c.dead && (storm === undefined || !!c.storm === storm)); }

  /**
   * Where the clear lane is now: its middle, as a fraction (-1..1) of the half-screen across the wind. It wanders with
   * the island's clock.
   */
  lane() { return 0.6 * Math.sin(this.world.clock / 240); }

  /** How many clouds this screen holds when a 3:2 view holds `n`. */
  wanted(n) {
    const { hw, hh } = this.world, area = Math.min(1.4, Math.max(0.75, hw * hh / 0.375));
    return Math.min(CloudBank.MAX, Math.round((n ?? 0) * area));
  }

  /** @param {number} seconds real time since the last call */
  update(seconds) {
    const weather = this.world.weather;
    this.wait -= seconds;
    this.#keep(false, this.wanted(weather.clouds));
    this.#keep(true, this.wanted(weather.stormClouds));
  }

  #keep(storm, want) {
    const here = this.staying(storm), short = want - here.length, hurry = this.world.hurry;
    if (hurry && short !== 0) {   // the viewer just chose a weather: the sky gets there within a second or two
      if (short < 0) here.slice(0, -short).forEach(c => c.leave(true));
      else for (let n = Math.min(short, HURRY_FORM); n > 0; n--) here.push(this.#form(storm, here, true));
    } else if (short < 0) {
      for (let i = 0, n = Math.ceil(-short / 8); i < n; i++) here[i].leave();   // the oldest go first
    } else if (short > FAR_SHORT) {
      for (let n = Math.ceil(short / 5); n > 0; n--) here.push(this.#form(storm, here));
    } else if (short > 0 && this.wait <= 0) {
      const cloud = this.world.add(new Cloud(this.world, Math.random, 0, 0, storm));
      cloud.enter(storm ? null : this.lane());
      this.wait = SPACING;
    }
  }

  /** A new cloud somewhere in the view: of a few places tried, the one farthest from the others of its kind. */
  #form(storm, others, quick = false) {
    const { hw, hh } = this.world;
    let bx = 0, by = 0, best = -1;
    for (let tries = 0; tries < 6; tries++) {
      const x = (Math.random() * 2 - 1) * hw, y = (Math.random() * 2 - 1) * hh;
      let near = Infinity;
      for (const o of others) near = Math.min(near, Math.hypot(o.x - x, (o.y - y) * 2));   // clouds are wider than tall: up and down counts double
      if (near > best) { best = near; bx = x; by = y; }
    }
    const cloud = this.world.add(new Cloud(this.world, Math.random, 0, 0, storm));
    cloud.form(bx, by, quick);
    return cloud;
  }
}
