import { Cloud } from '../entities/cloud.js';

/**
 * CloudBank: keeps the number of clouds in the sky in step with the weather (world.weather.clouds).
 *
 * It never makes a cloud pop in or out. When the sky should hold more, it lets one new cloud drift in at the upwind edge
 * (a little apart from the last, so they do not come in a crowd); when it should hold fewer, it tells one cloud to leave:
 * that cloud slowly fades and drifts off, and is not sent round again.
 *
 * New clouds also keep out of a clear lane: a band across the wind, a quarter of the screen wide, that wanders slowly. So
 * even on the cloudiest day part of the island stays in the sun.
 *
 * The world calls update() about once a second, after the weather. The island's own random source is never used here:
 * clouds come and go with the weather, and the island's layout stays the same for its seed.
 */
const SPACING = 6;   // seconds at least between two new clouds

export class CloudBank {
  /** @param {import('./world.js').World} world */
  constructor(world) { this.world = world; this.wait = 0; }

  /** The clouds still in the sky (not leaving). */
  staying() { return this.world.all(Cloud).filter(c => !c.leaving && !c.dead); }

  /**
   * Where the clear lane is now: its middle, as a fraction (-1..1) of the half-screen across the wind. It wanders with
   * the island's clock.
   */
  lane() { return 0.6 * Math.sin(this.world.clock / 240); }

  /** @param {number} seconds real time since the last call */
  update(seconds) {
    const want = this.world.weather.clouds, here = this.staying();
    this.wait -= seconds;
    if (here.length > want) {
      here[0].leave();   // the oldest goes first
    } else if (here.length < want && this.wait <= 0) {
      const cloud = this.world.add(new Cloud(this.world, Math.random, 0, 0));
      cloud.enter(this.lane());
      this.wait = SPACING;
    }
  }
}
