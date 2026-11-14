/**
 * Presence: decides who is out at this time of day. It is the only class that decides it.
 *
 * Each entity class says how much of its kind is out, with one static (see Entity):
 *
 *   static presence = { day: 1, night: 0.1, keep: 1 }
 *
 *   day, night  the share of that kind that is out by day and by night (0..1). The default is { day: 1, night: 1 }: always out.
 *   keep        for a group: how many stay out at least, whatever the share (people keep 1, so the quay is never empty).
 *
 * For a group (people, gulls) the share is the share of individuals: 25 people at 0.1 means two or three are out.
 * For a single thing (the biplane at night: 0.5) it is the chance it is out. That chance is drawn once per day and once per
 * night, from the date (see roll below), never per frame: so nothing pops in and out during one night, and the same night
 * looks the same after a reload. Any fraction left over in a group (2.5 people) is drawn the same way.
 *
 * Presence gives every entity a `visible` value, 0 (gone) to 1 (fully out), from how dark it is (world.day.darkness).
 * Over dusk the share slides from the day value to the night value: those who are out by day but not by night leave one by
 * one, each at its own moment between LEAVE_FROM and LEAVE_TO of darkness, and those out only at night arrive the same way.
 * At dawn it goes back. The Scene skips entities at 0: they are not updated, drawn or clicked.
 *
 * It only works anything out again when the darkness changes or entities come and go, not every frame.
 */
const LEAVE_FROM = 0.08, LEAVE_TO = 0.62;   // the darkness at which the first and the last of a group start to leave
const FADE = 0.18;                          // how much darkness one entity takes to fade out completely
const GOLDEN = 0.6180339887;                // spreads 0, 1, 2, 3... evenly but unevenly-looking over 0..1
const ALWAYS = { day: 1, night: 1 };

/** Which day and which night it is, as text. Without a clock (in tests) it is always the same day and night. */
const SAME_DATES = () => ({ day: 'day', night: 'night' });

/** A number 0..1 that is always the same for the same text, and looks random (an FNV-1a hash). */
export function roll(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export class Presence {
  /**
   * @param {{ day?: { darkness: number }, dates?: () => { day: string, night: string } }} parts
   * day: where the darkness comes from (world.day). dates: which day and which night it is now (see World), the seeds for the draws.
   */
  constructor({ day = null, dates = SAME_DATES } = {}) {
    this.day = day; this.dates = dates;
    this.darkness = -1; this.dirty = true; this.seeds = null; this.groups = new Map();
  }

  /** The list of entities changed: work out again who leaves when. */
  invalidate() { this.dirty = true; }

  /** How many of a group of `size` are out, for a share (0..1), a `keep` and a draw `chance` (0..1) for the fraction left over. */
  static count(size, share, keep, chance) {
    const exact = size * share, whole = Math.floor(exact);
    const drawn = whole + (chance < exact - whole ? 1 : 0);
    return Math.min(size, Math.max(Math.min(keep, size), drawn));
  }

  /**
   * How visible one entity is at a darkness: `order` (0..1) is its place in the queue (0 leaves first), `byDay` and
   * `byNight` whether it is out by day and by night. Out both times: always 1; out neither: 0; otherwise it fades at its moment.
   */
  static visibility(order, byDay, byNight, darkness) {
    if (byDay === byNight) return byDay ? 1 : 0;
    const start = LEAVE_FROM + (LEAVE_TO - LEAVE_FROM) * order;
    const t = Math.min(1, Math.max(0, (darkness - start) / FADE)), gone = t * t * (3 - 2 * t);
    return byDay ? 1 - gone : gone;
  }

  /** Sets `visible` on every entity in the list for the darkness now. */
  update(entities) {
    const darkness = this.day ? this.day.darkness : 0;
    if (!this.dirty && darkness === this.darkness) return;
    this.darkness = darkness;
    const seeds = this.dates(), newDate = !this.seeds || seeds.day !== this.seeds.day || seeds.night !== this.seeds.night;
    this.seeds = seeds;
    if (this.dirty) this.#enrol(entities);
    if (this.dirty || newDate) this.#choose();
    this.dirty = false;
    for (const e of entities) e.visible = Presence.visibility(e.presenceOrder ?? 0, e.outByDay ?? true, e.outByNight ?? true, darkness);
  }

  /** Gives each entity its place in the queue, and groups them by class. */
  #enrol(entities) {
    this.groups = new Map();
    for (const e of entities) {
      const Type = e.constructor;
      if (!this.groups.has(Type)) this.groups.set(Type, []);
      const group = this.groups.get(Type);
      e.presenceOrder = (group.length * GOLDEN) % 1;
      group.push(e);
    }
    for (const group of this.groups.values()) group.sort((p, q) => p.presenceOrder - q.presenceOrder);
  }

  /** Picks who of each group is out today and tonight: the last in the queue are the ones who stay out. */
  #choose() {
    for (const [Type, group] of this.groups) {
      const p = Type.presence ?? ALWAYS, keep = p.keep ?? 0, n = group.length;
      const byDay = Presence.count(n, p.day ?? 1, keep, roll(`${this.seeds.day}|day|${Type.name}`));
      const byNight = Presence.count(n, p.night ?? 1, keep, roll(`${this.seeds.night}|night|${Type.name}`));
      group.forEach((e, i) => { e.outByDay = i >= n - byDay; e.outByNight = i >= n - byNight; });
    }
  }
}
