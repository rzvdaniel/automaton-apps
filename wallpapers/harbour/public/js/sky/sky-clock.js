/**
 * SkyClock: the date and time the island shows.
 *
 * Normally that is simply the real time. If the viewer picks a start time such as 22:00, the clock shows 22:00 (at the chosen
 * place, the 22:00 nearest to that moment, so 01:00 picked at 23:30 is 1.5 hours ahead) at that moment and then keeps running forward at normal speed. To survive a reload it saves the start time and the
 * real moment it was set; the time now is the start plus however long has passed since. Ask it with now(), which gives a Date.
 * For tests, the way of reading the real time can be handed in.
 */
export class SkyClock {
  /**
   * @param {{ settings: import('./settings.js').Settings, place: import('./place.js').Place, realNow?: () => number }} parts
   * realNow: returns the real time in milliseconds (default Date.now)
   */
  constructor({ settings, place, realNow = () => Date.now() }) {
    this.settings = settings; this.place = place; this.realNow = realNow;
  }

  /** The time the island shows, as a Date. */
  now() {
    const real = this.realNow(), t = this.settings.get('time');
    if (t?.mode !== 'start') return new Date(real);
    const [hours, minutes] = t.start.split(':').map(Number);
    // the occurrence of HH:MM at the place nearest to the moment it was set: yesterday's, today's or tomorrow's
    const set = this.place.local(new Date(t.setAt));
    const at = k => { const d = new Date(Date.UTC(set.year, set.month - 1, set.day + k)); return this.place.instantOf({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours, minutes }).getTime(); };
    const start = [at(-1), at(0), at(1)].reduce((best, x) => Math.abs(x - t.setAt) < Math.abs(best - t.setAt) ? x : best);
    return new Date(start + Math.max(0, real - t.setAt));
  }

  /** Is the clock showing the real time? */
  get isNow() { return this.settings.get('time')?.mode !== 'start'; }

  /** The island shows the real time. */
  setNow() { this.settings.set({ time: { mode: 'now' } }); }

  /** The island shows `hhmm` ("22:00") right now and runs forward from there. */
  setStart(hhmm) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return;
    this.settings.set({ time: { mode: 'start', start: hhmm, setAt: this.realNow() } });
  }

  /** The time as text at the place, "22:00:05", for the debug panel. */
  text() {
    const l = this.place.local(this.now()), two = n => String(n).padStart(2, '0');
    return `${two(l.hours)}:${two(l.minutes)}:${two(l.seconds)}`;
  }
}
