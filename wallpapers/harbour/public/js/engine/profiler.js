/**
 * ?profile: adds up the time each pass of a frame takes (milliseconds of JavaScript, measured around the pass) and
 * logs one line per pass every 5 seconds to the console: the average per frame and the worst frame.
 * The graphics chip's own work (a CSS filter, compositing a canvas) is not in these numbers; for that, ?profile=nofilter
 * leaves the time of day's filter off and ?profile=nolights leaves the lights canvas out, so the frame rate with and
 * without each shows what it costs. Without ?profile nothing is measured: `time` just runs the pass.
 */
export class Profiler {
  static EVERY_MS = 5000;

  /** @param {{ query?: string, now?: () => number, log?: (line: string) => void }} options */
  constructor({ query = '', now = () => performance.now(), log = line => console.log(line) } = {}) {
    const m = /[?&]profile(?:=([\w,]*))?(?:&|$)/.exec(query);
    this.on = !!m;
    const flags = (m?.[1] ?? '').split(',');
    this.noFilter = flags.includes('nofilter'); this.noLights = flags.includes('nolights');
    this.now = now; this.logLine = log; this.passes = new Map(); this.frames = 0; this.since = null;
  }

  /** Runs `fn` and counts its time under `name`. */
  time(name, fn) {
    if (!this.on) return fn();
    const t0 = this.now();
    try { return fn(); } finally { this.add(name, this.now() - t0); }
  }

  add(name, ms) {
    const p = this.passes.get(name) ?? { total: 0, worst: 0 };
    p.total += ms; p.worst = Math.max(p.worst, ms); this.passes.set(name, p);
  }

  /** Called once at the end of every frame: logs and starts again after EVERY_MS. */
  endFrame() {
    if (!this.on) return;
    const t = this.now(); this.since ??= t; this.frames++;
    if (t - this.since < Profiler.EVERY_MS) return;
    this.logLine(this.report(t - this.since)); this.passes.clear(); this.frames = 0; this.since = t;
  }

  report(ms) {
    const rows = [...this.passes].map(([name, p]) => `${name} ${(p.total / this.frames).toFixed(2)}ms (max ${p.worst.toFixed(1)})`);
    return `Harbour profile: ${this.frames} frames in ${(ms / 1000).toFixed(1)} s (${(this.frames * 1000 / ms).toFixed(1)} fps); per frame: ${rows.join(', ')}`;
  }
}
