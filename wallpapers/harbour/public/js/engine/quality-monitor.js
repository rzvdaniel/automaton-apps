/**
 * Watches how long frames take. A slow device is one where frames keep arriving late: after two stretches of
 * `window` frames in a row averaging more than `slowMs`, it says the picture should be drawn with fewer pixels.
 * Two stretches, so a hiccup while the page loads cannot trigger it.
 */
export class QualityMonitor {
  constructor({ slowMs = 55, window = 40, strikes = 2 } = {}) {
    Object.assign(this, { slowMs, window, strikes });
    this.count = 0; this.total = 0; this.bad = 0;
  }

  /** Feed the time between two frames in milliseconds (0 or less is ignored). Returns true when quality should go down a step. */
  sample(gapMs) {
    if (gapMs <= 0) return false;
    this.total += gapMs;
    if (++this.count < this.window) return false;
    this.bad = this.total / this.count > this.slowMs ? this.bad + 1 : 0;
    this.count = 0; this.total = 0;
    if (this.bad < this.strikes) return false;
    this.bad = 0;
    return true;
  }
}
