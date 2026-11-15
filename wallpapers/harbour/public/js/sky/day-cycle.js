import { Sky } from './sky.js';

/**
 * DayCycle: the time of day as the scene sees it.
 *
 * It asks the Sky where the sun and the moon are and turns that into the few things the island needs:
 *
 *   phase     'dawn', 'day', 'dusk' or 'night'
 *   darkness  0 in daylight, 1 in full night, in between at dawn and dusk
 *   night     0 by day, 1 at full night (the same curve as the light's grey): how much of the night palette shows
 *   light     (also `phases`: the weights [day, sunrise, sunset, night], summing to 1, of the four ground palettes, see phasesAt) the colour of the light over the whole island: { r, g, b, grey, offset }. r, g, b multiply the picture's colours
 *             (1, 1, 1 is plain daylight; warm at dawn, golden in the evening, mild blue at night) and grey (0..1) is how much
 *             colour drains out of it (none by day, some at night, when eyes see less colour); offset is a colour [r, g, b] added after
 *             the multiply ([0, 0, 0] by day, none now; it can darken the darks without dimming the brights)
 *   glitter   the moon's glitter on the sea: { x, y, strength }, the moon's direction on the screen (east +x, north -y) and moonlight times darkness (0 by day, and with the moon down or new)
 *   shadow    where shadows fall on the ground: { x, y, length, strength }
 *
 * The light follows the sun's height. At night the moon is the light: a full moon high up gives a brighter, bluer night
 * than a new moon or a moon below the horizon. Under heavy cloud (the weather's cover) daylight is a little dimmer and
 * greyer, so a cloudy afternoon looks dull.
 *
 * The shadow is a step on the screen per unit of height. Entities multiply it by how tall (or how high up) they are:
 * a balloon high in the air takes a big step, a cow a tiny one. Length 1 is the length the pictures were first drawn for
 * (the sun about 35 degrees up); a low sun makes longer shadows, up to MAX_LENGTH. The step points away from the sun, with
 * north at the top of the screen and east on the right, so at noon in the north the shadows point up. `strength` (0..1)
 * says how strong shadows are: 1 by day, fading to 0 as the sun sets. At night the moon, when it is up, casts clear
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
// The light is mild at dawn, dusk and night: the backdrop has its own palettes for sand, grass and sea at each of them (see palettes.js and
// DayCycle.phasesAt), so the light only adds a light warm tint near the horizon (and some blue at night); what must never rise as the sun goes
// down is the brightness on screen (the light times the ground colour, blended into the night colour: see the day test).
const MORNING = [[10, DAY], [6, [1, 0.96, 0.9]], [0, [0.95, 0.89, 0.86]], [-6, [0.8, 0.8, 0.92]]];
const EVENING = [[10, DAY], [6, [1, 0.94, 0.84]], [0, [0.97, 0.88, 0.76]], [-6, [0.8, 0.79, 0.9]]];
const NIGHT_DARK = [0.78, 0.82, 0.95];   // no moon: a mild blue
const NIGHT_MOON = [0.88, 0.92, 1.0];    // a full moon high up: a little brighter
const NIGHT_GREY = 0.1;                  // how much colour fades at full night
const NIGHT_OFFSET = [0, 0, 0];          // added after the multiply at full night, fading with grey (none now; the palette does the work)
const CLOUD_DIM = 0.10;                  // how much darker daylight is under the heaviest cloud
const CLOUD_GREY = 0.10;                 // and how much colour it loses

export class DayCycle {
  static MAX_LENGTH = 3;      // a sun just above the horizon still casts a shadow that stays on the screen
  static TWILIGHT = -12;      // the sun this far below the horizon (degrees): full night
  static MOON_SHADOW = 0.6;   // the strength of a full moon's shadows, high in the sky

  /** @param {{ sky?: Sky }} parts */
  constructor({ sky = new Sky() } = {}) {
    this.sky = sky;
    this.moonOverride = null;   // from the moon setting: null the real moon, 'full' or 'new'
    this.sun = { azimuth: 180, altitude: 35 };
    this.moon = { azimuth: 0, altitude: -30, fraction: 0, waxing: true };
    this.phase = 'day'; this.darkness = 0; this.night = 0; this.moonlight = 0;
    this.glitter = { x: 0, y: -1, strength: 0 };
    this.light = { r: 1, g: 1, b: 1, grey: 0, offset: [0, 0, 0], night: 0, moon: 0, phases: [1, 0, 0, 0] };
    this.shadow = { x: 0, y: -1, length: 1, strength: 1 };   // a plain midday until the first update
  }

  /**
   * Sets the time of day for a moment and a place.
   * @param {Date} date the moment the island shows
   * @param {{ lat: number, lon: number }} place where the island is
   * @param {number} [cover] how cloudy it is, 0..1 (world.weather.cover); 0 for a clear sky
   * @returns {this}
   */
  update(date, place, cover = 0) {
    const { sun, moon } = DayCycle.withMoon(this.sky.at(date, place), this.moonOverride);
    const { azimuth, altitude } = sun;
    this.sun = sun; this.moon = moon;
    this.darkness = 1 - smooth(DayCycle.TWILIGHT, 2, altitude);
    this.night = 1 - smooth(DayCycle.TWILIGHT, 0, altitude);   // how much of the night palette shows: the same curve as the light's grey
    // dawn or dusk by which half of the sky the sun is in: near the poles around the solstices the sun can stay low all day
    // and cross south, so this can call a morning 'dusk' there (fine for the cities Place knows)
    const morning = azimuth < 180;
    this.phase = altitude >= 6 ? 'day' : altitude <= DayCycle.TWILIGHT / 2 ? 'night' : morning ? 'dawn' : 'dusk';

    // how much the moon lights the night: 0 (new, or below the horizon) to 1 (full and high)
    this.moonlight = moon.fraction * smooth(-1, 25, moon.altitude);
    this.light = DayCycle.underCloud(DayCycle.lightAt(altitude, morning, this.moonlight), cover, this.darkness);

    const toMoon = moon.azimuth * RAD;
    this.glitter = { x: Math.sin(toMoon), y: -Math.cos(toMoon), strength: this.moonlight * this.darkness };

    // shadows: from the sun while it is up; at night from the moon, and none when the moon is down
    const sunStrength = smooth(-0.5, 4, altitude);
    const moonStrength = DayCycle.MOON_SHADOW * moon.fraction * smooth(0, 10, moon.altitude) * this.darkness;
    this.shadow = moonStrength > sunStrength
      ? DayCycle.#shadowFrom(moon.azimuth, moon.altitude, moonStrength)
      : DayCycle.#shadowFrom(azimuth, altitude, sunStrength);
    return this;
  }

  /** The sky with the moon forced: 'full' is full and 50 degrees up, 'new' is new (its height stays); null leaves it alone. */
  static withMoon({ sun, moon }, override) {
    if (override === 'full') return { sun, moon: { ...moon, fraction: 1, altitude: 50 } };
    if (override === 'new') return { sun, moon: { ...moon, fraction: 0 } };
    return { sun, moon };
  }

  /**
   * How much each of the four ground palettes shows at a sun height (degrees), morning or evening, always summing to 1:
   * day from 10 degrees up, the sunrise or sunset palette alone from 2 to -2 degrees, night from -8 down, smooth blends between.
   * @returns {number[]} [day, sunrise, sunset, night]
   */
  static phasesAt(altitude, morning) {
    const day = smooth(2, 10, altitude), night = 1 - smooth(-8, -2, altitude), twilight = 1 - day - night;
    return [day, morning ? twilight : 0, morning ? 0 : twilight, night];
  }

  /**
   * The light's colour for a sun height (degrees), morning or evening, and how much the moon lights the night (0..1).
   * @returns {{ r: number, g: number, b: number, grey: number, offset: number[] }}
   */
  static lightAt(altitude, morning, moonlight) {
    const nightColour = mix(NIGHT_DARK, NIGHT_MOON, moonlight);
    const keys = [...(morning ? MORNING : EVENING), [DayCycle.TWILIGHT, nightColour]];
    // above the first key it is full daylight; the loop below then finds the two keys the sun is between, down to night
    let colour = altitude >= keys[0][0] ? keys[0][1] : nightColour;
    for (let i = 1; i < keys.length; i++) {
      const [highAlt, high] = keys[i - 1], [lowAlt, low] = keys[i];
      if (altitude <= highAlt && altitude >= lowAlt) { colour = mix(low, high, (altitude - lowAlt) / (highAlt - lowAlt)); break; }
    }
    const [r, g, b] = colour;
    const night = 1 - smooth(DayCycle.TWILIGHT, 0, altitude);   // 0 by day, 1 at full night: grey and the offset fade together
    return { r, g, b, grey: NIGHT_GREY * night, offset: NIGHT_OFFSET.map(v => v * night + 0), night, moon: moonlight, phases: DayCycle.phasesAt(altitude, morning) };   // night, moon and phases go to the backdrop's palettes
  }

  /**
   * The light dimmed by cloud: heavy cover (from 0.3 up) takes up to CLOUD_DIM of the daylight and some of its colour.
   * At night it changes nothing (the clouds themselves are dark then). A clear sky gives back the very same light.
   */
  static underCloud(light, cover, darkness) {
    const k = smooth(0.3, 0.85, cover) * (1 - darkness);
    if (k === 0) return light;
    const dim = 1 - CLOUD_DIM * k;
    return { ...light, r: light.r * dim, g: light.g * dim, b: light.b * dim, grey: Math.min(1, light.grey + CLOUD_GREY * k) };
  }

  /** The shadow cast by a light at that compass direction and height (degrees), with that strength. */
  static #shadowFrom(azimuth, altitude, strength) {
    // the shadow falls away from the light: towards azimuth + 180. On the screen east is +x and north is -y.
    const length = Math.min(DayCycle.MAX_LENGTH, 1 / Math.tan(Math.max(1, altitude) * RAD) / REFERENCE);
    const toward = (azimuth + 180) * RAD;
    return { x: Math.sin(toward) * length, y: -Math.cos(toward) * length, length, strength };
  }
}
