/**
 * Decides when the picture should be drawn with fewer pixels, and when it can have them back.
 *
 * It measures the WORK of a frame (update + render, in milliseconds), not the gap between frames. A host such as Lively
 * caps the frame rate, pauses the page behind a window or throttles it on battery; that stretches the gaps on a fast
 * computer too, while the work stays short. Work time says "this computer is slow", gap time only says "something
 * slowed the page". (WebGL draws run on the GPU after the call returns, so a GPU-bound slowdown shows up only as
 * far as the driver blocks the call; that is the price of not reading the gap.)
 *
 * Frames are averaged over windows of `windowMs` of page time. `slowStrikes` slow windows in a row (a few seconds)
 * lower quality one step; `fastStrikes` fast windows in a row (longer) raise it one step. Every drop that follows a
 * raise doubles the wait for the next raise (up to 8x), so it does not flap. Hiding the page, a single frame that
 * took longer than `maxFrameMs` (a pause, not slowness) and the first frames after the page is shown again are skipped.
 */
export class QualityMonitor {
  constructor({ slowMs = 25, fastMs = 12, windowMs = 4000, slowStrikes = 2, fastStrikes = 5, maxFrameMs = 250, settleFrames = 10 } = {}) {
    Object.assign(this, { slowMs, fastMs, windowMs, slowStrikes, fastStrikes, maxFrameMs, settleFrames });
    this.backoff = 1; this.raised = false;
    this.#restart(); this.slow = 0; this.fast = 0;
  }

  #restart() { this.count = 0; this.total = 0; this.elapsed = 0; this.settle = this.settleFrames; }

  /** The page was hidden or shown again: drop the window in progress, the streaks and the first frames after it. */
  reset() { this.#restart(); this.slow = 0; this.fast = 0; }

  /**
   * Feed one frame: the work it took and the page time since the previous frame, both in milliseconds.
   * Returns -1 when quality should go down a step, 1 when it can go up a step, else 0.
   */
  sample(workMs, gapMs) {
    if (!(workMs >= 0) || !(gapMs > 0)) return 0;
    if (gapMs > this.maxFrameMs || workMs > this.maxFrameMs) { this.#restart(); return 0; }   // a pause or throttle, not slowness
    if (this.settle > 0) { this.settle--; return 0; }
    this.total += workMs; this.count++; this.elapsed += gapMs;
    if (this.elapsed < this.windowMs) return 0;
    const mean = this.total / this.count;
    this.count = 0; this.total = 0; this.elapsed = 0;
    if (mean > this.slowMs) { this.fast = 0; if (++this.slow >= this.slowStrikes) return this.#down(); return 0; }
    this.slow = 0;
    if (mean < this.fastMs) { if (++this.fast >= this.fastStrikes * this.backoff) return this.#up(); }
    else this.fast = 0;
    return 0;
  }

  #down() {
    this.slow = 0; this.fast = 0;
    if (this.raised) this.backoff = Math.min(8, this.backoff * 2);
    this.raised = false;
    return -1;
  }
  #up() { this.slow = 0; this.fast = 0; this.raised = true; return 1; }
}
