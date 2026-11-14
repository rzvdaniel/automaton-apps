/**
 * The wind: one direction for the whole island and one strength, with gusts that roll across it. Plants lean with it;
 * smoke, clouds and boats go with it; the sea gets whitecaps and bigger surf when it blows hard.
 *
 *   vector    the direction, x and y (y is flattened, as the island is seen from above at an angle). It never changes
 *             length with the strength, so code that only wants "which way" can use it as it is.
 *   strength  0 (dead calm) .. 1 (a storm).
 *
 * Where the strength comes from: the viewer's setting `wind` (see Settings).
 *   - Auto (the default): every day has its own wind, drawn from that day's local date ("2026-11-14"), so it is the same
 *     for every viewer and every reload. Most days are calm or a light breeze, now and then a day is breezy, and rarely
 *     one is stormy. Within the day it rises and falls slowly (gusty spells), and it is a little stronger when the sky
 *     is cloudy (Weather.cover).
 *   - A choice: { mode: 'fixed', strength 0 calm .. 1 stormy }. It lasts, whatever the date, until the viewer
 *     switches back to Auto (like the Weather setting).
 * Either way the shown strength eases towards where it is going over about ten real seconds, so it never snaps.
 *
 * Nothing here uses Math.random or the island's seed: the island's layout must not change because of the wind.
 */
const EASE = 1 / 10;          // how much of the way (per real second) the strength moves towards its target
const CALM = 0.05, STORMY = 0.9;
const SEA_CALM = 0.12;        // below this the sea looks as it does on a calm day: no whitecaps, no extra surf
const REFERENCE = 0.375;      // the strength at which plants, smoke and boats move exactly as they did before the wind had a strength

/** A number 0..1 for a piece of text, always the same for the same text (a "hash"). */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Wind {
  static CALM = CALM;
  static STORMY = STORMY;
  static REFERENCE = REFERENCE;

  /** The local date at a place, as "YYYY-MM-DD": the day Auto draws its wind for. */
  static dayAt(place, date) {
    const l = place.local(date), two = n => String(n).padStart(2, '0');
    return `${l.year}-${two(l.month)}-${two(l.day)}`;
  }

  /** The viewer's own choice: its strength 0..1; null on Auto. */
  static chosen(setting) {
    return setting?.mode === 'fixed' ? setting.strength : null;
  }

  /**
   * The wind a day has on Auto, before its spells and clouds: mostly calm (about seven days in ten, 0.05..0.3),
   * sometimes breezy (0.3..0.55), rarely stormy (about one day in twenty, 0.6..0.9).
   */
  static dayBase(day) {
    const u = hash('wind ' + day), v = hash('strength ' + day);
    if (u < 0.72) return 0.05 + 0.25 * v;
    if (u < 0.95) return 0.3 + 0.25 * v;
    return 0.6 + 0.3 * v;
  }

  /**
   * Where the strength is heading. Pure: the same inputs always give the same answer.
   * @param {{ mode: 'auto' } | { mode: 'fixed', strength: number }} setting the viewer's choice
   * @param {number} cover how cloudy the sky is (Weather.cover)
   * @param {Date} date the moment the island shows (for the slow gusty spells)
   * @param {string} day the island's local date, "YYYY-MM-DD" (Auto draws its wind from it; a choice ignores it)
   * @returns {number} 0..1
   */
  static targetFor(setting, cover, date, day) {
    const own = Wind.chosen(setting);
    if (own !== null) return CALM + (STORMY - CALM) * Math.min(1, Math.max(0, own));
    const s = date.getTime() / 1000, base = Wind.dayBase(day), phase = hash('gusts ' + day) * 100;
    const spells = 0.5 + 0.5 * (0.6 * Math.sin(s / 2300 + phase) + 0.4 * Math.sin(s / 870 + phase * 1.7));   // slow rises and lulls, 0..1
    return Math.min(1, Math.max(0, base * (0.75 + 0.5 * spells) + 0.15 * cover));
  }

  constructor() { this.vector = [1, 0]; this.strength = REFERENCE; this.started = false; }

  /** Blows from the given angle. */
  setAngle(angle) { this.vector = [Math.cos(angle), Math.sin(angle) * 0.5]; }

  /**
   * Moves the strength on. `seconds` is how much real time passed since the last call; until real time has passed the
   * strength is put straight where it should be (as the island is being built, or in a test that sets a clock).
   * @param {{ setting: object, cover: number, date: Date, day: string, seconds?: number }} now
   * @returns {this}
   */
  update({ setting, cover, date, day, seconds = 0 }) {
    const k = this.started ? Math.min(1, seconds * EASE) : 1;
    this.strength += (Wind.targetFor(setting, cover, date, day) - this.strength) * k;
    if (seconds > 0) this.started = true;
    return this;
  }

  /** How strong the wind is for the sea shader: 0 on a calm day (the sea as it always was), rising to 1 in a storm. */
  get sea() { return Math.max(0, (this.strength - SEA_CALM) / (1 - SEA_CALM)); }

  /**
   * How the wind crests look for a waves style (see Settings `waves`) at a wind strength 0..1. The shader works out the
   * same numbers (shader-source.js, the crest block); this copy is here so they can be checked. Only Crescents and
   * Dashes have crests. Two ramps, and the bigger one wins:
   *   - light wind: from strength 0.06 a sprinkling of small, faint crests appears, full by 0.2 (a few per screen,
   *     at most 0.36 opaque, a bit smaller than a breeze's), so the style shows a little on most Auto days;
   *   - the storm ramp from #181: from sea strength 0.15 up, more, bigger and whiter crests, up to the full look at 0.9.
   * @param {number} strength the wind strength 0..1
   * @param {string} waves 'off' | 'original' | 'crescents' | 'dashes'
   * @returns {{ density: number, size: number, opacity: number }} density: the share of cells that get a crest (before
   *   the gusty patches); size: how big (1 = a middling crest); opacity: how white at their peak
   */
  static crests(strength, waves) {
    if (waves !== 'crescents' && waves !== 'dashes') return { density: 0, size: 0, opacity: 0 };
    const ws = Math.max(0, (strength - SEA_CALM) / (1 - SEA_CALM));
    const ramp = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };   // GLSL smoothstep
    const light = ramp(0.06, 0.2, strength);
    return {
      density: Math.max(Math.min(1, Math.max(0, (ws - 0.15) * 1.2)), 0.05 * light),
      size: Math.max(0.6 + 0.6 * ws, 0.5 + 0.1 * light),
      opacity: Math.max(ramp(0, 0.2, ws) * (0.58 + 0.12 * ws), 0.36 * light)
    };
  }

  /** How much more than usual things move in this wind: 1 at the reference strength, about 0.5 when calm, about 1.8 in a storm. */
  get push() { return 0.4 + 0.6 * this.strength / REFERENCE; }

  /** How far the wind bends a plant at this spot at time t, as a fraction of its size. A stronger wind bends it further. */
  sway(x, y, t) {
    const w = this.vector, gust = 0.5 + 0.5 * Math.sin(t * 0.8 - (x * w[0] + y * w[1]) * 7);
    const k = (0.02 + 0.1 * gust * gust) * (1 + 0.25 * Math.sin(t * 2.3 + x * 31 + y * 17)) * this.push;
    return [w[0] * k, w[1] * k];
  }
}
