import { Sky } from './sky.js';

/**
 * DayCycle: the time of day as the scene sees it.
 *
 * It asks the Sky where the sun is and turns that into the few things the island needs:
 *
 *   phase     'dawn', 'day', 'dusk' or 'night'
 *   darkness  0 in daylight, 1 in full night, in between at dawn and dusk
 *   shadow    where shadows fall on the ground: { x, y, length, strength }
 *
 * The shadow is a step on the screen per unit of height. Entities multiply it by how tall (or how high up) they are:
 * a balloon high in the air takes a big step, a cow a tiny one. Length 1 is the length the pictures were first drawn for
 * (the sun about 35 degrees up); a low sun makes longer shadows, up to MAX_LENGTH. The step points away from the sun, with
 * north at the top of the screen and east on the right, so at noon in the north the shadows point up. `strength` (0..1)
 * says how strong shadows are: 1 by day, fading to 0 as the sun sets, so at night there are none.
 *
 * Entities never compute any of this; they read world.day. The world calls update() with the island's time and place.
 */
const RAD = Math.PI / 180;
const REFERENCE = 1 / Math.tan(35 * RAD);   // the shadow length (per unit of height) the pictures were drawn for
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class DayCycle {
  static MAX_LENGTH = 3;     // a sun just above the horizon still casts a shadow that stays on the screen
  static TWILIGHT = -12;     // the sun this far below the horizon (degrees): full night

  /** @param {{ sky?: Sky }} parts */
  constructor({ sky = new Sky() } = {}) {
    this.sky = sky;
    this.sun = { azimuth: 180, altitude: 35 };
    this.phase = 'day'; this.darkness = 0;
    this.shadow = { x: 0, y: -1, length: 1, strength: 1 };   // a plain midday until the first update
  }

  /**
   * Sets the time of day for a moment and a place.
   * @param {Date} date the moment the island shows
   * @param {{ lat: number, lon: number }} place where the island is
   * @returns {this}
   */
  update(date, place) {
    const { sun } = this.sky.at(date, place);
    const { azimuth, altitude } = sun;
    this.sun = sun;
    this.darkness = 1 - smooth(DayCycle.TWILIGHT, 2, altitude);
    this.phase = altitude >= 6 ? 'day' : altitude <= DayCycle.TWILIGHT / 2 ? 'night' : azimuth < 180 ? 'dawn' : 'dusk';

    // the shadow falls away from the sun: towards azimuth + 180. On the screen east is +x and north is -y.
    const length = Math.min(DayCycle.MAX_LENGTH, 1 / Math.tan(Math.max(1, altitude) * RAD) / REFERENCE);
    const toward = (azimuth + 180) * RAD;
    this.shadow = { x: Math.sin(toward) * length, y: -Math.cos(toward) * length, length, strength: smooth(-0.5, 4, altitude) };
    return this;
  }
}
