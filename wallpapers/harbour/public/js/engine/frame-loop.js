/**
 * Calls `step(dt, gap)` once per displayed frame. On a calm sea it runs at about half the screen's rate (the island is
 * slow and this saves power); while something is happening it runs every frame. It pauses while the page is hidden.
 */
export class FrameLoop {
  static CALM_GAP_MS = 30;     // the shortest time between steps when nothing is going on
  static MAX_STEP_SECONDS = 0.05;
  static IGNORE_GAP_MS = 400;  // a longer gap is a pause (a hidden tab), not a slow frame

  /**
   * @param {(dt: number, gapMs: number) => void} step
   * @param {{ timeScale?: number }} options timeScale below 1 slows everything (for people who prefer reduced motion)
   */
  constructor(step, { timeScale = 1 } = {}) {
    this.step = step; this.timeScale = timeScale;
    this.busyUntil = 0; this.last = performance.now(); this.running = false;
  }

  /** Keeps the loop at full speed for the next `ms` milliseconds. */
  keepBusy(ms) { this.busyUntil = Math.max(this.busyUntil, performance.now() + ms); }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = now => { if (!this.running) return; requestAnimationFrame(tick); this.#frame(now); };
    requestAnimationFrame(tick);
  }
  stop() { this.running = false; }

  #frame(now) {
    if (document.hidden) { this.last = now; return; }
    if (now - this.last < (now < this.busyUntil ? 0 : FrameLoop.CALM_GAP_MS)) return;
    const gap = now - this.last; this.last = now;
    this.step(Math.min(FrameLoop.MAX_STEP_SECONDS, gap / 1000) * this.timeScale, gap < FrameLoop.IGNORE_GAP_MS ? gap : 0);
  }
}
