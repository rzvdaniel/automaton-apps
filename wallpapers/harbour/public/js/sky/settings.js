/**
 * Settings: the viewer's choices, kept in the browser.
 *
 * It remembers four things: the place (a time zone, or null for "use my browser's"), the time ("now" or a start time),
 * the weather mood (0 = more sun, 1 = more clouds) and the wind ("auto", or 0 calm to 1 stormy).
 * (Sound keeps its own switch in Sound.) Choices are saved in localStorage; if the browser will not let us (a private window),
 * the defaults are used and the choices last until the page is closed. Nothing is sent to a server.
 * Anyone who needs to know when a choice changes calls onChange().
 */
const KEY = 'harbour-settings';

export const DEFAULTS = Object.freeze({
  place: null,                            // a time zone such as 'Europe/Bucharest'; null = the browser's own
  time: Object.freeze({ mode: 'now' }),   // { mode: 'now' } or { mode: 'start', start: 'HH:MM', setAt: milliseconds }
  weather: 0.5,                           // 0 more sun .. 1 more clouds
  wind: 'auto'                            // 'auto' or 0 calm .. 1 stormy
});

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
    if (unit(saved.weather)) out.weather = saved.weather;
    if (saved.wind === 'auto' || unit(saved.wind)) out.wind = saved.wind;
    return out;
  }

  /** The current value of one choice. */
  get(name) { return this.values[name]; }

  /** Changes one or more choices, saves them and tells the listeners: `settings.set({ weather: 0.8 })`. */
  set(changes) {
    this.values = { ...this.values, ...changes };
    try { this.storage?.setItem(KEY, JSON.stringify(this.values)); } catch { /* cannot save: carry on without */ }
    this.listeners.forEach(fn => fn(this.values, Object.keys(changes)));
  }

  /** Runs `fn(values, changedNames)` after every change. Returns a function that stops listening. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
