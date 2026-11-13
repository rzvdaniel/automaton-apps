/**
 * The size of the screen and what it means for the picture: how many pixels a world unit is, how much of the world is
 * in view, and how many pixels the shader may paint. It knows nothing about the page: it is given numbers.
 */
export class Viewport {
  static SHADER_PIXEL_BUDGET = 3.0e6;   // the shader paints at most about this many pixels
  static MIN_QUALITY = 0.5;

  constructor({ width = 1500, height = 1000, dpr = 1 } = {}) {
    this.quality = 1;   // lowered step by step on a slow device
    this.portrait = undefined;
    this.resize(width, height, dpr);
  }

  /** Sets a new size. Returns true when the screen turned between landscape and portrait. */
  resize(width, height, dpr = this.dpr) {
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.dpr = Math.min(2, dpr || 1);
    // world units: the island is laid out for a 3:2 view; a tall phone screen fits it to its width instead
    this.scale = Math.min(this.height, this.width / (this.width >= this.height ? 1.5 : 1.0));   // pixels per world unit at zoom 1
    this.hw = this.width / (2 * this.scale);    // half the world in view, in world units
    this.hh = this.height / (2 * this.scale);
    this.glScale = Math.min(this.dpr, Math.sqrt(Viewport.SHADER_PIXEL_BUDGET / (this.width * this.height))) * this.quality;
    const portrait = this.width < this.height, turned = this.portrait !== undefined && portrait !== this.portrait;
    this.portrait = portrait;
    return turned;
  }

  /** One step down in shader resolution. Returns false when it cannot go lower. */
  lowerQuality() {
    if (this.quality <= Viewport.MIN_QUALITY) return false;
    this.quality *= 0.8; this.resize(this.width, this.height);
    return true;
  }
}
