/**
 * Presence: decides who is out at this time of day.
 *
 * Each entity class says when it lives, with two statics (see Entity):
 *
 *   active      'day'    out by day, goes home over dusk, comes back over dawn (balloons, gulls, the biplane...)
 *               'night'  the other way round (the fox)
 *               'always' out at any hour (the default)
 *   nightShare  for an 'always' group that thins out at night: the share that stays out (0..1). People have 0.1: most go
 *               home, and at least `nightKeep` (1 by default) of each class always stay, so the quay is never empty.
 *
 * Presence gives every entity a `visible` value, 0 (gone) to 1 (fully out), from how dark it is (world.day.darkness).
 * They do not all leave at once: each one gets its own moment between LEAVE_FROM and LEAVE_TO of darkness, so they go one
 * by one as the evening falls, and come back one by one at dawn. The Scene skips entities at 0: they are not updated,
 * drawn or clicked.
 *
 * It only works anything out again when the darkness changes or entities come and go, not every frame.
 */
const LEAVE_FROM = 0.08, LEAVE_TO = 0.62;   // the darkness at which the first and the last of a group start to leave
const FADE = 0.18;                          // how much darkness one entity takes to fade out completely
const GOLDEN = 0.6180339887;                // spreads 0, 1, 2, 3... evenly but unevenly-looking over 0..1

export class Presence {
  /** @param {{ day?: { darkness: number } }} parts where the darkness comes from (world.day) */
  constructor({ day = null } = {}) { this.day = day; this.darkness = -1; this.dirty = true; }

  /** The list of entities changed: work out again who leaves when. */
  invalidate() { this.dirty = true; }

  /**
   * How visible an entity is at a darkness, from its class's rule, its own place in the queue (`order`, 0..1: 0 leaves
   * first) and whether it is one of those who stay out at night (`stays`).
   */
  static visibility(Type, order, stays, darkness) {
    const active = Type.active ?? 'always';
    if (active === 'always' && (stays || (Type.nightShare ?? 1) >= 1)) return 1;
    const start = LEAVE_FROM + (LEAVE_TO - LEAVE_FROM) * order;
    const t = Math.min(1, Math.max(0, (darkness - start) / FADE)), gone = t * t * (3 - 2 * t);
    return active === 'night' ? gone : 1 - gone;
  }

  /** Sets `visible` on every entity in the list for the darkness now. */
  update(entities) {
    const darkness = this.day ? this.day.darkness : 0;
    if (this.dirty) this.#enrol(entities);
    else if (darkness === this.darkness) return;
    this.darkness = darkness;
    for (const e of entities) e.visible = Presence.visibility(e.constructor, e.presenceOrder ?? 0, e.staysOut ?? false, darkness);
  }

  /** Gives each entity its place in the queue, and picks those of a thinning group who stay out. */
  #enrol(entities) {
    this.dirty = false;
    const groups = new Map();
    for (const e of entities) {
      const Type = e.constructor;
      if (!groups.has(Type)) groups.set(Type, []);
      const group = groups.get(Type);
      e.presenceOrder = (group.length * GOLDEN) % 1;
      group.push(e);
    }
    for (const [Type, group] of groups) {
      const share = Type.nightShare ?? 1;
      const keep = share >= 1 ? group.length : Math.min(group.length, Math.max(Type.nightKeep ?? 1, Math.round(group.length * share)));
      // the last in the queue are the ones who stay
      const byOrder = group.slice().sort((p, q) => p.presenceOrder - q.presenceOrder);
      byOrder.forEach((e, n) => { e.staysOut = n >= byOrder.length - keep; });
    }
  }
}
