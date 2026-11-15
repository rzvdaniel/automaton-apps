/**
 * Settings: the viewer's choices, kept in the browser.
 *
 * It remembers seven things: the place (a time zone, or null for "use my browser's"), the time ("now", a start time that
 * runs on, or a fixed time that holds), the weather (one of four levels, see WEATHER_LEVELS), the wind (Auto, or one of
 * three strengths, see WIND_STRENGTHS, which stays until they change it), how the sea's waves look (see WAVES), the
 * palette set (see palettes.js) and the moon (see MOONS). A saved weather or wind strength that is not one of the levels
 * (from an older version) snaps to the nearest level when it is loaded.
 * (Sound keeps its own switch in Sound.) Choices are saved in localStorage; if the browser will not let us (a private window),
 * the defaults are used and the choices last until the page is closed. Nothing is sent to a server.
 * Anyone who needs to know when a choice changes calls onChange().
 */
import { DEFAULT_PALETTE, isPaletteId } from './palettes.js';

const KEY = 'harbour-settings';

export const DEFAULTS = Object.freeze({
  place: null,                            // a time zone such as 'Europe/Bucharest'; null = the browser's own
  time: Object.freeze({ mode: 'now' }),   // { mode: 'now' }, { mode: 'start', start: 'HH:MM', setAt: milliseconds } (runs on) or { mode: 'fixed', at: 'HH:MM' } (holds)
  weather: 0.33,                          // one of WEATHER_LEVELS (the cloud mood: 0 more sun .. 1 more clouds)
  wind: Object.freeze({ mode: 'auto' }),  // { mode: 'auto' } or { mode: 'fixed', strength: one of WIND_STRENGTHS }
  waves: 'original',                      // one of WAVES
  palette: DEFAULT_PALETTE,               // the id of a palette set (see palettes.js)
  moon: 'real'                            // one of MOONS
});

/** The four weathers, sunny, partly sunny, cloudy and stormy, as the cloud mood each stands for. */
export const WEATHER_LEVELS = Object.freeze([0, 0.33, 0.67, 1]);
/** The three chosen winds, calm, windy and stormy, as the strength setting each stands for (Wind turns them into 0.05, 0.39 and 0.9). */
export const WIND_STRENGTHS = Object.freeze([0, 0.4, 1]);
/** The moon: the real one, always full, or always new (only the moon; the date and time are not touched). */
export const MOONS = Object.freeze(['real', 'full', 'new']);

/** The level nearest to `value` (the lower one when it is exactly between two). */
export function snap(value, levels) {
  return levels.reduce((best, x) => Math.abs(x - value) < Math.abs(best - value) - 1e-9 ? x : best);
}

/**
 * How the sea's waves look: 'off' a plain sea; 'original' the small white dots that twinkle now and then (the sea as it
 * always was); 'crescents' curved crests that come with the wind; 'dashes' straight crests that come with the wind.
 */
export const WAVES = Object.freeze(['off', 'original', 'crescents', 'dashes']);

export class Settings {
  /** @param {{ storage?: { getItem(k: string): string | null, setItem(k: string, v: string): void } | null }} options where to save; defaults to localStorage */
  constructor({ storage } = {}) {
    this.storage = storage === undefined ? Settings.#browserStorage() : storage;
    this.values = { ...DEFAULTS, ...this.#load() };
    this.listeners = new Set();
  }

  static #browserStorage() { try { return localStorage; } catch { return null; } }

  #load() {
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
      return saved && typeof saved === 'object' ? Settings.#clean(saved) : {};
    } catch { return {}; }
  }

  /** Keeps only values of the right kind, so a damaged save cannot break the island. */
  static #clean(saved) {
    const out = {}, unit = v => typeof v === 'number' && v >= 0 && v <= 1;
    if (typeof saved.place === 'string' || saved.place === null) out.place = saved.place;
    const t = saved.time;
    if (t?.mode === 'now') out.time = { mode: 'now' };
    else if (t?.mode === 'start' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.start) && Number.isFinite(t.setAt)) out.time = { mode: 'start', start: t.start, setAt: t.setAt };
    else if (t?.mode === 'fixed' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.at)) out.time = { mode: 'fixed', at: t.at };
    if (unit(saved.weather)) out.weather = snap(saved.weather, WEATHER_LEVELS);
    const w = saved.wind;   // an older save may carry a `day` (dropped: a choice lasts now), or be 'auto' or a bare number (Auto)
    if (w?.mode === 'fixed' && unit(w.strength)) out.wind = { mode: 'fixed', strength: snap(w.strength, WIND_STRENGTHS) };
    else if (w !== undefined) out.wind = { mode: 'auto' };
    if (saved.waves !== undefined) out.waves = WAVES.includes(saved.waves) ? saved.waves : 'original';
    if (saved.palette !== undefined) out.palette = isPaletteId(saved.palette) ? saved.palette : DEFAULT_PALETTE;
    if (saved.moon !== undefined) out.moon = MOONS.includes(saved.moon) ? saved.moon : 'real';
    return out;
  }

  /** The current value of one choice. */
  get(name) { return this.values[name]; }

  /** Changes one or more choices, saves them and tells the listeners: `settings.set({ weather: 0.8 })`. */
  set(changes) {
    if ('waves' in changes && !WAVES.includes(changes.waves)) changes = { ...changes, waves: 'original' };   // an unknown style is the original sea
    if ('moon' in changes && !MOONS.includes(changes.moon)) changes = { ...changes, moon: 'real' };
    if ('palette' in changes && !isPaletteId(changes.palette)) changes = { ...changes, palette: DEFAULT_PALETTE };
    this.values = { ...this.values, ...changes };
    try { this.storage?.setItem(KEY, JSON.stringify(this.values)); } catch { /* cannot save: carry on without */ }
    this.listeners.forEach(fn => fn(this.values, Object.keys(changes)));
  }

  /** Runs `fn(values, changedNames)` after every change. Returns a function that stops listening. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
