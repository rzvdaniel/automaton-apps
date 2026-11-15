/**
 * SkyClock: the date and time the island shows.
 *
 * Normally that is simply the real time. If the viewer picks a start time such as 22:00, the clock shows 22:00 (at the chosen
 * place, the 22:00 nearest to that moment, so 01:00 picked at 23:30 is 1.5 hours ahead) at that moment and then keeps running forward at normal speed. To survive a reload it saves the start time and the
 * real moment it was set; the time now is the start plus however long has passed since. Ask it with now(), which gives a Date.
 * Or the viewer fixes the time ("fixed", 22:00): the island shows 22:00 on the real date at the place and holds it.
 * For tests, the way of reading the real time can be handed in.
 */
export class SkyClock {
  /**
   * @param {{ settings: import('./settings.js').Settings, place: import('./place.js').Place, realNow?: () => number }} parts
   * realNow: returns the real time in milliseconds (default Date.now)
   */
  constructor({ settings, place, realNow = () => Date.now() }) {
    this.settings = settings; this.place = place; this.realNow = realNow;
    this.override = null; this.listeners = new Set();
  }

  /**
   * A time for this page only, never saved (the debug panel's slider): null follows the setting, a number is a frozen moment in milliseconds. Listeners hear of every change.
   */
  setOverride(value) { this.override = value; this.listeners.forEach(fn => fn(this)); }
  /** Calls fn(clock) whenever the override changes. Returns a function that stops it. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Freezes the island at `minutes` past midnight (0..1440, 1440 = the next midnight) of the real day at the place. */
  setLocalMinutes(minutes) {
    const m = Math.min(1440, Math.max(0, Math.round(minutes))), l = this.place.local(new Date(this.realNow()));
    const day = new Date(Date.UTC(l.year, l.month - 1, l.day + Math.floor(m / 1440))), r = m % 1440;
    this.setOverride(this.place.instantOf({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hours: Math.floor(r / 60), minutes: r % 60 }).getTime());
  }

  /** The time shown, as minutes past midnight at the place (0..1440). */
  minutes() { const l = this.place.local(this.now()); return l.hours * 60 + l.minutes + l.seconds / 60; }

  /** The time shown as "HH:MM" at the place (to the minute). */
  shownText() {
    const l = this.place.local(this.now()), two = n => String(n).padStart(2, '0');
    return `${two(l.hours)}:${two(l.minutes)}`;
  }

  /** Saves the time shown (the slider's) as a fixed time, or as a start time that runs on, and drops the override. */
  save(fixed) { const at = this.shownText(); if (fixed) this.setFixed(at); else this.setStart(at); }

  /** The time the island shows, as a Date. */
  now() {
    const real = this.realNow(), t = this.settings.get('time');
    if (typeof this.override === 'number') return new Date(this.override);
    if (t?.mode === 'fixed') {   // the real date at the place, at the chosen time
      const [h, m] = t.at.split(':').map(Number), l = this.place.local(new Date(real));
      return this.place.instantOf({ year: l.year, month: l.month, day: l.day, hours: h, minutes: m });
    }
    if (t?.mode !== 'start') return new Date(real);
    const [hours, minutes] = t.start.split(':').map(Number);
    // the occurrence of HH:MM at the place nearest to the moment it was set: yesterday's, today's or tomorrow's
    const set = this.place.local(new Date(t.setAt));
    const at = k => { const d = new Date(Date.UTC(set.year, set.month - 1, set.day + k)); return this.place.instantOf({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours, minutes }).getTime(); };
    const start = [at(-1), at(0), at(1)].reduce((best, x) => Math.abs(x - t.setAt) < Math.abs(best - t.setAt) ? x : best);
    return new Date(start + Math.max(0, real - t.setAt));
  }

  /** Is the clock showing the real time? */
  get isNow() { return this.override === null && !['start', 'fixed'].includes(this.settings.get('time')?.mode); }

  /** The island shows the real time. */
  setNow() { this.#drop(); this.settings.set({ time: { mode: 'now' } }); }

  /** The island shows `hhmm` ("22:00") right now and runs forward from there. */
  setStart(hhmm) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return;
    this.#drop(); this.settings.set({ time: { mode: 'start', start: hhmm, setAt: this.realNow() } });
  }

  /** The island shows `hhmm` ("22:00") on the real date and holds it. */
  setFixed(hhmm) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return;
    this.#drop(); this.settings.set({ time: { mode: 'fixed', at: hhmm } });
  }

  #drop() { if (this.override !== null) { this.override = null; this.listeners.forEach(fn => fn(this)); } }

  /** The time as text at the place, "22:00:05", for the debug panel. */
  text() {
    const l = this.place.local(this.now()), two = n => String(n).padStart(2, '0');
    return `${two(l.hours)}:${two(l.minutes)}:${two(l.seconds)}`;
  }
}
