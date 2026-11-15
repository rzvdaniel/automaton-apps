/**
 * Decides when the picture should be drawn with fewer pixels, and when it can have them back.
 *
 * It measures the WORK of a frame (update + render, in milliseconds), not the gap between frames. A host such as Lively
 * caps the frame rate, pauses the page behind a window or throttles it on battery; that stretches the gaps on a fast
 * computer too, while the work stays short. Work time says "this computer is slow", gap time only says "something
 * slowed the page". A window also counts as slow when frames arrive late and unevenly (mean gap over `slowGapMs`, over `slowUneven` of the gaps off the two usual lengths):
 * a steady cap is not slowness, a GPU that cannot keep up is. Quality only goes up while the gaps are short too.
 * (WebGL draws run on the GPU after the call returns, so a GPU-bound slowdown shows up only as
 * far as the driver blocks the call; that is the price of not reading the gap.)
 *
 * Frames are averaged over windows of `windowMs` of page time. `slowStrikes` slow windows in a row (a few seconds)
 * lower quality one step; `fastStrikes` fast windows in a row (longer) raise it one step. Every drop that follows a
 * raise doubles the wait for the next raise (up to 8x), so it does not flap. Hiding the page, a gap longer than
 * `maxFrameMs` with short work (a pause, not slowness) and the first frames after the page is shown again are skipped.
 */
export class QualityMonitor {
  constructor({ slowMs = 25, fastMs = 12, windowMs = 4000, slowStrikes = 2, fastStrikes = 5, maxFrameMs = 250, settleFrames = 10, slowGapMs = 55, slowUneven = 0.3, fastGapMs = 40 } = {}) {
    Object.assign(this, { slowMs, fastMs, windowMs, slowStrikes, fastStrikes, maxFrameMs, settleFrames, slowGapMs, slowUneven, fastGapMs });
    this.backoff = 1; this.raised = false;
    this.#restart(); this.slow = 0; this.fast = 0;
  }

  /**
   * The share of gaps that are not near one of the two most common gap lengths (10 ms buckets, each with its
   * neighbours). A frame cap, and a screen's vsync steps (33 / 50 ms), give one or two usual lengths whatever the
   * hitches; a device that cannot keep up gives gaps all over. One outlier moves this by one frame only.
   */
  static unevenShare(gaps) {
    const buckets = new Map(); for (const g of gaps) { const b = Math.floor(g / 10); buckets.set(b, (buckets.get(b) ?? 0) + 1); }
    const near = b => (buckets.get(b - 1) ?? 0) + (buckets.get(b) ?? 0) + (buckets.get(b + 1) ?? 0);
    let first = -Infinity, firstN = 0; for (const b of buckets.keys()) if (near(b) > firstN) { first = b; firstN = near(b); }
    let secondN = 0; for (const b of buckets.keys()) if (Math.abs(b - first) >= 3 && near(b) > secondN) secondN = near(b);
    return 1 - (firstN + secondN) / gaps.length;
  }

  #restart() { this.count = 0; this.total = 0; this.elapsed = 0; this.gaps = []; this.settle = this.settleFrames; }

  /** The page was hidden or shown again: drop the window in progress, the streaks and the first frames after it. */
  reset() { this.#restart(); this.slow = 0; this.fast = 0; }

  /**
   * Feed one frame: the work it took and the page time since the previous frame, both in milliseconds.
   * Returns -1 when quality should go down a step, 1 when it can go up a step, else 0.
   */
  sample(workMs, gapMs) {
    if (!(workMs >= 0) || !(gapMs > 0)) return 0;
    if (gapMs > this.maxFrameMs && workMs < this.slowMs) { this.#restart(); return 0; }   // a pause or throttle with short work, not slowness
    if (this.settle > 0) { this.settle--; return 0; }
    const work = Math.min(workMs, this.maxFrameMs), gap = Math.min(gapMs, this.maxFrameMs);   // very long work still counts as slow, capped
    this.total += work; this.count++; this.elapsed += gap; this.gaps.push(gap);
    if (this.elapsed < this.windowMs) return 0;
    const mean = this.total / this.count, meanGap = this.elapsed / this.count;
    const uneven = QualityMonitor.unevenShare(this.gaps);
    this.count = 0; this.total = 0; this.elapsed = 0; this.gaps = [];
    // slow: the work is long, or the frames come late and unevenly (a GPU-bound device; a host's frame cap is steady)
    if (mean > this.slowMs || (meanGap > this.slowGapMs && uneven > this.slowUneven)) { this.fast = 0; if (++this.slow >= this.slowStrikes) return this.#down(); return 0; }
    this.slow = 0;
    if (mean < this.fastMs && meanGap < this.fastGapMs) { if (++this.fast >= this.fastStrikes * this.backoff) return this.#up(); }
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
