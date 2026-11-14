/**
 * Lighting: puts the time of day's light (world.day.light) over the whole picture, once, instead of every entity
 * tinting itself.
 *
 * The light is one small colour sum, the same for every pixel: first drain some colour (mix each colour with its grey,
 * `grey` of the way), then multiply red, green and blue by the light's r, g, b. Both steps together are one 3 x 3 matrix
 * (see matrix()). It is applied in two places, both run by the graphics chip and costing next to nothing:
 *
 *   the backdrop  (sea and land) gets the matrix as a shader uniform and multiplies each pixel by it
 *   the drawing   (every entity) gets a CSS filter: an SVG feColorMatrix with the same numbers, on its canvas
 *
 * By plain daylight there is no filter at all. The light changes at most once a second, and only then is anything redone.
 */
const SVG = 'http://www.w3.org/2000/svg';
const FILTER_ID = 'harbour-light';
const LUMA = [0.299, 0.587, 0.114];   // how bright red, green and blue look to the eye

export class Lighting {
  /**
   * The 3 x 3 matrix (row by row: the new red from old red, green, blue; then green; then blue) for a light.
   * @param {{ r: number, g: number, b: number, grey: number }} light
   * @returns {number[]} nine numbers
   */
  static matrix({ r, g, b, grey }) {
    return [r, g, b].flatMap((k, row) => LUMA.map((l, col) => k * ((row === col ? 1 - grey : 0) + grey * l)));
  }

  /** Is this light plain daylight (nothing to do)? */
  static isPlain({ r, g, b, grey }) { return r === 1 && g === 1 && b === 1 && grey === 0; }

  /**
   * @param {{ canvas: HTMLCanvasElement, backdrop: { setLight(m: number[]): void } }} parts the 2D canvas and the backdrop
   */
  constructor({ canvas, backdrop }) {
    this.canvas = canvas; this.backdrop = backdrop; this.key = '';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    const filter = document.createElementNS(SVG, 'filter');
    filter.setAttribute('id', FILTER_ID);
    filter.setAttribute('color-interpolation-filters', 'sRGB');   // the numbers are for the colours as stored, not linear light
    this.colorMatrix = document.createElementNS(SVG, 'feColorMatrix');
    this.colorMatrix.setAttribute('type', 'matrix');
    filter.appendChild(this.colorMatrix); svg.appendChild(filter); document.body.appendChild(svg);
  }

  /** Uses this light from now on. Does nothing when it has not changed. */
  apply(light) {
    if (light === this.last) return;   // world.day makes a new light only when it changes (about once a second)
    this.last = light;
    const m = Lighting.matrix(light), key = m.map(v => v.toFixed(3)).join(' ');
    if (key === this.key) return;
    this.key = key;
    this.backdrop.setLight(m);
    if (Lighting.isPlain(light)) { this.canvas.style.filter = ''; return; }
    // feColorMatrix is 4 x 5 (red, green, blue, alpha; the fifth column adds a constant): alpha stays as it is
    this.colorMatrix.setAttribute('values', `${m.slice(0, 3).join(' ')} 0 0 ${m.slice(3, 6).join(' ')} 0 0 ${m.slice(6).join(' ')} 0 0 0 0 0 1 0`);
    this.canvas.style.filter = `url(#${FILTER_ID})`;
  }
}
