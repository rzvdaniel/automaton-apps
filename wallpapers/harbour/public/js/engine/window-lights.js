/**
 * Which house windows are lit, by the clock. Every window of the island has its own evening and its own night, drawn once from
 * its position (so the same island always lights the same way, after a reload too):
 *
 *   on     it comes on between 18:00 and 21:30
 *   off    it goes out when it likes: about half the windows are lit at 21:00, a quarter at 23:00, a few at 00:30 and then, from
 *          01:00 to 05:00, only one or two (the "owls") in the whole island
 *   dawn   about one window in ten comes on again between 05:30 and 06:30, and goes out with the daylight
 *
 * The times are on the local clock hour (the sky clock), so it works in summer and winter; the light itself also waits for
 * the dusk (see `House.drawLights`), so no window is lit by day. The windows register here as houses are built; the times
 * are worked out on first use, from the windows' order by a hash, so a window's fate does not depend on the build order.
 */
export class WindowLights {
  static ON_FROM = 18; static ON_SPAN = 3.5;   // hours; after noon, 24 + h is the next morning
  static FADE = 0.25;                           // hours a window takes to light or go out
  /** [hour after noon, the share of windows still lit]: how the evening thins out. The last point is 01:00. */
  static SURVIVAL = [[19, 1], [21, 0.58], [23, 0.25], [24, 0.1], [25, 0]];
  static DAWN_SHARE = 0.1; static DAWN_FROM = 29.5; static DAWN_SPAN = 1; static DAWN_END = 31.5;

  constructor() { this.list = []; this.ready = false; }
  clear() { this.list.length = 0; this.ready = false; }

  /** A number in [0, 1) from a window's place; the same place always gives the same number. */
  static hash(x, y, n, salt) {
    let h = Math.imul(Math.round(x * 1e5) | 0, 374761393) ^ Math.imul(Math.round(y * 1e5) | 0, 668265263) ^ Math.imul(n + 1, 2246822519) ^ Math.imul(salt + 1, 3266489917);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Adds a window at (x, y), the `n`th of its house; returns it (its times are filled in by `plan`). */
  add(x, y, n) {
    const H = WindowLights.hash;
    const w = { on: 0, off: 0, dawn: null, key: H(x, y, n, 0), u: H(x, y, n, 1), v: H(x, y, n, 2) };
    this.list.push(w); this.ready = false;
    return w;
  }

  /** The hour (after noon, 12..36) at which a share `p` (0..1) of the windows is still lit. */
  static goesOutAt(p) {
    const S = WindowLights.SURVIVAL;
    for (let i = 1; i < S.length; i++) if (p >= S[i][1]) return S[i][0] + (S[i - 1][0] - S[i][0]) * (p - S[i][1]) / (S[i - 1][1] - S[i][1]);
    return S[S.length - 1][0];
  }

  /** Gives every window its times. The windows are ranked by hash: the first one or two are the owls, the rest are spread over the evening. */
  plan() {
    const L = WindowLights, ranked = [...this.list].sort((a, b) => a.key - b.key);
    const owls = ranked.length >= 20 ? 2 : Math.min(1, ranked.length), rest = ranked.length - owls;
    ranked.forEach((w, i) => {
      w.on = L.ON_FROM + L.ON_SPAN * w.u;
      if (i < owls) { w.on = Math.min(w.on, 21); w.off = 28 + 1.5 * w.v; w.dawn = null; return; }   // lit through the night, out between 04:00 and 05:30
      w.off = Math.max(w.on + 0.4, L.goesOutAt((i - owls + 0.5) / rest));
      w.dawn = w.v < L.DAWN_SHARE ? L.DAWN_FROM + L.DAWN_SPAN * (w.v / L.DAWN_SHARE) : null;
    });
    this.ready = true;
  }

  /** The hour of the clock (0..24) as hours after noon (12..36). */
  static after(hour) { return hour >= 12 ? hour : hour + 24; }

  /** How lit a window is at `hour` (0..24 on the clock), 0..1, ignoring how dark it is. */
  level(w, hour) {
    if (!this.ready) this.plan();
    const t = WindowLights.after(hour), f = WindowLights.FADE, ramp = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
    const evening = ramp((t - w.on) / f) * (1 - ramp((t - w.off) / f));
    const morning = w.dawn === null ? 0 : ramp((t - w.dawn) / f) * (1 - ramp((t - WindowLights.DAWN_END) / f));
    return Math.max(evening, morning);
  }
}
