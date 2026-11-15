/**
 * Weather: which sky the island has right now.
 *
 * The viewer picks one of four weathers (settings.weather, see WEATHER_LEVELS) and each has a sky of its own (LOOKS):
 *
 *   sunny          a few small white clouds, drifting slowly
 *   partly sunny   some fair clouds
 *   cloudy         many large grey clouds over a good part of the view
 *   stormy         no fair clouds at all: the sky crowded with dark storm clouds (another shape, see Cloud), racing with
 *                  the wind, and the island beneath them dimmer
 *
 * What the rest of the island reads:
 *
 *   cover        0..CAP, how much of the sky is cloud. It is never 1: some of the island always stays in the light
 *   clouds       how many fair clouds a 3:2 view should hold (CloudBank scales it to the screen)
 *   stormClouds  how many storm clouds
 *   size         how much bigger than its own size a fair cloud is drawn
 *   darkness     0..1, how grey the fair clouds are (white on a fine day, grey when it is cloudy)
 *   speed        how fast the clouds drift, as a multiple of their own speed
 *   storm        0..1, how much of a storm it is (0 up to cloudy, 1 when stormy): the daylight dims with it
 *
 * Inside a weather the sky still breathes: a smooth "noise", a wavy line through time that rises and falls over hours,
 * moves the cover and the number of clouds between that weather's fewest and most. The line is the same for every viewer
 * and every reload, because it is worked out from the time itself (the hours since 1970), never from Math.random or from
 * the island's seed.
 *
 * Nothing jumps: the mood eases towards the chosen weather over a few real seconds and every number above is blended
 * between the two weathers it is passing, so one sky turns into the next (CloudBank lets the clouds form and fade to
 * match). The world calls update() about once a second.
 */
import { WEATHER_LEVELS } from './settings.js';

const CAP = 0.85;              // the most cloud there can ever be
const MAX_CLOUDS = 15;         // the most fair clouds a 3:2 view is asked to hold (a cloudy sky at its fullest)
const MAX_STORM_CLOUDS = 24;   // and the most storm clouds
const MOOD_EASE = 1 / 4;       // how quickly (per real second) the mood catches up with the chosen weather: there in about ten seconds
const EASE = 1 / 8;            // and the cover with where it is heading
const HOUR = 3600000;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// One sky per weather, in the order of WEATHER_LEVELS. cover, clouds and stormClouds are [fewest, most]: the wavy line
// moves between them.
const LOOKS = [
  { cover: [0.03, 0.14], clouds: [2, 4], stormClouds: [0, 0], size: 0.8, darkness: 0, speed: 0.7 },
  { cover: [0.14, 0.34], clouds: [5, 8], stormClouds: [0, 0], size: 1.15, darkness: 0.1, speed: 1 },
  { cover: [0.50, 0.72], clouds: [11, MAX_CLOUDS], stormClouds: [0, 0], size: 1.9, darkness: 0.85, speed: 1.3 },
  { cover: [0.74, CAP], clouds: [0, 0], stormClouds: [18, MAX_STORM_CLOUDS], size: 1.9, darkness: 1, speed: 4 }
];

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

/** Between which two weathers a mood lies: the index of the lower one and how far (0..1) towards the next. */
function between(mood) {
  const m = Math.min(1, Math.max(0, mood)), L = WEATHER_LEVELS;
  let i = 0; while (i < L.length - 2 && m > L[i + 1]) i++;
  return [i, Math.min(1, Math.max(0, (m - L[i]) / (L[i + 1] - L[i])))];
}

/** One number of the look for a mood, blended between the two weathers it lies between; `spell` picks within a [fewest, most] pair. */
function blend(mood, name, spell = 0) {
  const [i, f] = between(mood), at = look => { const v = look[name]; return typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * spell; };
  return at(LOOKS[i]) * (1 - f) + at(LOOKS[i + 1]) * f;
}

export class Weather {
  static CAP = CAP;
  static MAX_CLOUDS = MAX_CLOUDS;
  static MAX_STORM_CLOUDS = MAX_STORM_CLOUDS;
  static LOOKS = LOOKS;

  /** Where the wavy line is at a moment: 0 (this weather at its clearest) .. 1 (at its fullest). Pure. */
  static spellAt(date) {
    const hours = date.getTime() / HOUR;
    return smooth(0.25, 0.75, 0.65 * wave(hours, 5, 1000) + 0.35 * wave(hours, 1.7, 7000));   // slow spells, with smaller changes on top
  }

  /**
   * Where the cover is heading at a moment, for a mood. Pure: the same date and mood always give the same answer.
   * @param {Date} date the moment the island shows
   * @param {number} mood one of WEATHER_LEVELS, or between two while the sky changes
   * @returns {number} cover 0..CAP
   */
  static coverAt(date, mood) { return blend(mood, 'cover', Weather.spellAt(date)); }

  /** @param {{ settings: import('./settings.js').Settings }} parts */
  constructor({ settings }) {
    this.settings = settings;
    this.mood = settings.get('weather');
    this.cover = 0; this.clouds = 1; this.stormClouds = 0; this.size = 1; this.darkness = 0; this.speed = 1; this.storm = 0;
    this.started = false;
  }

  /**
   * Moves the weather on to `date`. `seconds` is how much real time passed since the last call: the cover and the mood ease
   * by that much. Until real time has passed (seconds > 0) each call puts the sky straight where it should be, so a clock
   * set right after the world is built (as tests do) is followed at once, not eased towards from today's sky.
   * @returns {this}
   */
  update(date, seconds = 0) {
    const started = this.started;
    this.mood += (this.settings.get('weather') - this.mood) * (started ? Math.min(1, seconds * MOOD_EASE) : 1);
    this.cover += (Weather.coverAt(date, this.mood) - this.cover) * (started ? Math.min(1, seconds * EASE) : 1);
    if (seconds > 0) this.started = true;
    const mood = this.mood, spell = Weather.spellAt(date), [i, f] = between(mood);
    this.clouds = Math.round(blend(mood, 'clouds', spell));
    this.stormClouds = Math.round(blend(mood, 'stormClouds', spell));
    this.size = blend(mood, 'size');
    this.darkness = blend(mood, 'darkness');
    this.speed = blend(mood, 'speed');
    this.storm = i === LOOKS.length - 2 ? f : 0;
    return this;
  }
}
