/**
 * Weather: how cloudy the sky is right now.
 *
 * The main number is `cover`, 0 (a clear sky) to CAP (heavily overcast). It is never 1: some of the island always stays
 * in the sun (or the moonlight). From it come the rest:
 *
 *   cover     0..CAP, how much of the sky is cloud
 *   clouds    how many clouds should be in the sky (more when it is cloudier)
 *   darkness  0..1, how grey the clouds are (white puffs on a fair day, grey ones when it is overcast)
 *   speed     how fast the clouds drift, as a multiple of their own speed (a cloudy sky moves a little faster)
 *
 * Where the cover comes from: a smooth "noise", a wavy line through time that rises and falls over hours. The line is the
 * same for every viewer and every reload, because it is worked out from the time itself (the hours since 1970), never from
 * Math.random or from the island's seed. When the line is high it is a cloudy spell, when it is low a clear one.
 *
 * The viewer's mood (settings.weather: 0 "more sun" .. 1 "more clouds") moves the line where it counts as cloudy: with more
 * sun only its highest peaks are cloudy (short, rare spells), with more clouds most of it is (long, common spells).
 *
 * Nothing jumps: the mood eases towards the slider, and the cover eases towards the line, over some real seconds, so moving
 * the slider or setting another time changes the sky gradually. The world calls update() about once a second.
 */
const CAP = 0.85;          // the most cloud there can ever be
const MAX_CLOUDS = 9;      // how many clouds a fully clouded sky (cover CAP) has
const EASE = 1 / 20;       // how quickly (per real second) the shown cover and mood catch up with where they are going
const HOUR = 3600000;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A number 0..1 for a whole number n, always the same for the same n (a "hash"): the heights the wavy line passes through. */
function hash(n) {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The wavy line: one height every `step` hours, joined by smooth curves (no corners). */
function wave(hours, step, offset) {
  const x = hours / step, i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash(i + offset) * (1 - s) + hash(i + 1 + offset) * s;
}

export class Weather {
  static CAP = CAP;
  static MAX_CLOUDS = MAX_CLOUDS;

  /**
   * Where the cover is heading at a moment, for a mood. Pure: the same date and mood always give the same answer.
   * @param {Date} date the moment the island shows
   * @param {number} mood 0 more sun .. 1 more clouds
   * @returns {number} cover 0..CAP
   */
  static coverAt(date, mood) {
    const hours = date.getTime() / HOUR;
    const line = 0.65 * wave(hours, 5, 1000) + 0.35 * wave(hours, 1.7, 7000);   // slow spells, with smaller changes on top
    const threshold = 0.78 - 0.20 * mood - 0.24 * mood * mood;                    // where on the line it turns cloudy: mostly sunny unless the viewer asks for clouds
    const cloudy = smooth(threshold - 0.12, threshold + 0.12, line);
    const fair = 0.04 + 0.12 * mood;                                              // a few clouds even on a fine day
    return CAP * (fair + (1 - fair) * cloudy);
  }

  /** @param {{ settings: import('./settings.js').Settings }} parts */
  constructor({ settings }) {
    this.settings = settings;
    this.mood = settings.get('weather');
    this.cover = 0; this.clouds = 1; this.darkness = 0; this.speed = 1;
    this.started = false;
  }

  /**
   * Moves the weather on to `date`. `seconds` is how much real time passed since the last call: the cover and the mood ease
   * by that much. Until real time has passed (seconds > 0) each call puts the sky straight where it should be, so a clock
   * set right after the world is built (as tests do) is followed at once, not eased towards from today's sky.
   * @returns {this}
   */
  update(date, seconds = 0) {
    const k = this.started ? Math.min(1, seconds * EASE) : 1;
    this.mood += (this.settings.get('weather') - this.mood) * k;
    this.cover += (Weather.coverAt(date, this.mood) - this.cover) * k;
    if (seconds > 0) this.started = true;
    this.clouds = Math.round(1 + (MAX_CLOUDS - 1) * this.cover / CAP);
    this.darkness = smooth(0.35, CAP, this.cover);
    this.speed = 0.8 + 0.6 * this.cover;
    return this;
  }
}
