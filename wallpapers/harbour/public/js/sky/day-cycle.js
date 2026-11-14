import { Sky } from './sky.js';

/**
 * DayCycle: the time of day as the scene sees it.
 *
 * It asks the Sky where the sun and the moon are and turns that into the few things the island needs:
 *
 *   phase     'dawn', 'day', 'dusk' or 'night'
 *   darkness  0 in daylight, 1 in full night, in between at dawn and dusk
 *   light     the colour of the light over the whole island: { r, g, b, grey }. r, g, b multiply the picture's colours
 *             (1, 1, 1 is plain daylight; warm at dawn, golden in the evening, blue at night) and grey (0..1) is how much
 *             colour drains out of it (none by day, some at night, when eyes see less colour)
 *   shadow    where shadows fall on the ground: { x, y, length, strength }
 *
 * The light follows the sun's height. At night the moon is the light: a full moon high up gives a brighter, bluer night
 * than a new moon or a moon below the horizon.
 *
 * The shadow is a step on the screen per unit of height. Entities multiply it by how tall (or how high up) they are:
 * a balloon high in the air takes a big step, a cow a tiny one. Length 1 is the length the pictures were first drawn for
 * (the sun about 35 degrees up); a low sun makes longer shadows, up to MAX_LENGTH. The step points away from the sun, with
 * north at the top of the screen and east on the right, so at noon in the north the shadows point up. `strength` (0..1)
 * says how strong shadows are: 1 by day, fading to 0 as the sun sets. At night the moon, when it is up, casts faint
 * shadows (at most MOON_SHADOW, less for a thin moon); with the moon down there are none.
 *
 * Entities never compute any of this; they read world.day. The world calls update() with the island's time and place.
 */
const RAD = Math.PI / 180;
const REFERENCE = 1 / Math.tan(35 * RAD);   // the shadow length (per unit of height) the pictures were drawn for
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);

// The light's colour (red, green, blue multipliers) at sun heights in degrees, from high sun down to full night.
// Morning and evening differ only near the horizon: a rosy, soft dawn and a golden evening; both turn blue at twilight.
const DAY = [1, 1, 1];
const MORNING = [[20, DAY], [6, [1, 0.93, 0.84]], [0, [0.86, 0.74, 0.74]], [-6, [0.5, 0.5, 0.68]]];
const EVENING = [[20, DAY], [6, [1, 0.86, 0.62]], [0, [0.92, 0.66, 0.5]], [-6, [0.5, 0.48, 0.66]]];
const NIGHT_DARK = [0.24, 0.29, 0.45];   // no moon: dark blue, the land still readable
const NIGHT_MOON = [0.36, 0.44, 0.66];   // a full moon high up: brighter, moonlit blue
const NIGHT_GREY = 0.4;                  // how much colour fades at full night

export class DayCycle {
  static MAX_LENGTH = 3;      // a sun just above the horizon still casts a shadow that stays on the screen
  static TWILIGHT = -12;      // the sun this far below the horizon (degrees): full night
  static MOON_SHADOW = 0.3;   // the strength of a full moon's shadows, high in the sky

  /** @param {{ sky?: Sky }} parts */
  constructor({ sky = new Sky() } = {}) {
    this.sky = sky;
    this.sun = { azimuth: 180, altitude: 35 };
    this.moon = { azimuth: 0, altitude: -30, fraction: 0, waxing: true };
    this.phase = 'day'; this.darkness = 0; this.moonlight = 0;
    this.light = { r: 1, g: 1, b: 1, grey: 0 };
    this.shadow = { x: 0, y: -1, length: 1, strength: 1 };   // a plain midday until the first update
  }

  /**
   * Sets the time of day for a moment and a place.
   * @param {Date} date the moment the island shows
   * @param {{ lat: number, lon: number }} place where the island is
   * @returns {this}
   */
  update(date, place) {
    const { sun, moon } = this.sky.at(date, place);
    const { azimuth, altitude } = sun;
    this.sun = sun; this.moon = moon;
    this.darkness = 1 - smooth(DayCycle.TWILIGHT, 2, altitude);
    // dawn or dusk by which half of the sky the sun is in: near the poles around the solstices the sun can stay low all day
    // and cross south, so this can call a morning 'dusk' there (fine for the cities Place knows)
    const morning = azimuth < 180;
    this.phase = altitude >= 6 ? 'day' : altitude <= DayCycle.TWILIGHT / 2 ? 'night' : morning ? 'dawn' : 'dusk';

    // how much the moon lights the night: 0 (new, or below the horizon) to 1 (full and high)
    this.moonlight = moon.fraction * smooth(-1, 25, moon.altitude);
    this.light = DayCycle.lightAt(altitude, morning, this.moonlight);

    // shadows: from the sun while it is up; at night from the moon, faint, and none when the moon is down
    const sunStrength = smooth(-0.5, 4, altitude);
    const moonStrength = DayCycle.MOON_SHADOW * moon.fraction * smooth(0, 10, moon.altitude) * this.darkness;
    this.shadow = moonStrength > sunStrength
      ? DayCycle.#shadowFrom(moon.azimuth, moon.altitude, moonStrength)
      : DayCycle.#shadowFrom(azimuth, altitude, sunStrength);
    return this;
  }

  /**
   * The light's colour for a sun height (degrees), morning or evening, and how much the moon lights the night (0..1).
   * @returns {{ r: number, g: number, b: number, grey: number }}
   */
  static lightAt(altitude, morning, moonlight) {
    const night = mix(NIGHT_DARK, NIGHT_MOON, moonlight);
    const keys = [...(morning ? MORNING : EVENING), [DayCycle.TWILIGHT, night]];
    let colour = altitude >= keys[0][0] ? keys[0][1] : night;
    for (let i = 1; i < keys.length; i++) {
      const [highAlt, high] = keys[i - 1], [lowAlt, low] = keys[i];
      if (altitude <= highAlt && altitude >= lowAlt) { colour = mix(low, high, (altitude - lowAlt) / (highAlt - lowAlt)); break; }
    }
    const [r, g, b] = colour;
    return { r, g, b, grey: NIGHT_GREY * (1 - smooth(DayCycle.TWILIGHT, 0, altitude)) };
  }

  /** The shadow cast by a light at that compass direction and height (degrees), with that strength. */
  static #shadowFrom(azimuth, altitude, strength) {
    // the shadow falls away from the light: towards azimuth + 180. On the screen east is +x and north is -y.
    const length = Math.min(DayCycle.MAX_LENGTH, 1 / Math.tan(Math.max(1, altitude) * RAD) / REFERENCE);
    const toward = (azimuth + 180) * RAD;
    return { x: Math.sin(toward) * length, y: -Math.cos(toward) * length, length, strength };
  }
}
