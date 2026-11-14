/**
 * SkyClock: the date and time the island shows.
 *
 * Normally that is simply the real time. If the viewer picks a start time such as 22:00, the clock shows 22:00 (at the chosen
 * place) at that moment and then keeps running forward at normal speed. To survive a reload it saves the start time and the
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
    const set = this.place.local(new Date(t.setAt));   // the day it was at the place when the viewer chose
    const start = this.place.instantOf({ ...set, hours, minutes });
    return new Date(start.getTime() + Math.max(0, real - t.setAt));
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
