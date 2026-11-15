// Night lights: the one small drawing API every lamp, window and lantern uses (in its drawLights pass, see engine/scene.js).
// At night the lights canvas is a light map: the night's colour with every light added to it ('lighter'), multiplied over the
// picture, so a lamp's pool shows the ground in its real colours. A multiply cannot brighten past the picture, so the renderer
// also runs the same passes once on the main canvas in "bulb mode" (bulbMode): glow() then draws only a small bright dot and
// halo() nothing. Entities with other light drawing (the lighthouse beam) skip it while drawingBulbs() is true.

const WARM = '255,196,110', CORE = '255,244,214';
const SIZE = 64;           // pixels across the ready-made glow picture
const DOT = '255,248,226';
const MAX_DOT = 0.0016;    // the biggest radius of a bulb's dot, in world units
let bulbs = false;
const sprites = new Map(); // one ready-made soft glow per colour, painted the first time it is needed

/** A soft round glow, bright in the middle and fading to nothing at the edge, painted once onto a small canvas. */
function sprite(rgb) {
  let canvas = sprites.get(rgb);
  if (canvas) return canvas;
  canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d'), h = SIZE / 2, g = c.createRadialGradient(h, h, 0, h, h, h);
  // a bright middle, a firm shoulder and a short fall: a pool with a clear edge, not a haze
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.3, `rgba(${rgb},0.8)`); g.addColorStop(0.65, `rgba(${rgb},0.22)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, SIZE, SIZE);
  sprites.set(rgb, canvas);
  return canvas;
}

/** Switches bulb mode on or off (see the top of this file). The renderer does this around the second run of the lights passes. */
export function bulbMode(on) { bulbs = on; }
/** True while the lights passes are drawing bulb dots on the main canvas: draw nothing but dots then. */
export function drawingBulbs() { return bulbs; }

const colours = new WeakMap();
/**
 * The CSS colour of a light's red, green and blue multipliers: what the light map is filled with at night. Made once per
 * light (it changes about once a second). Without a light, white (multiplies nothing).
 */
export function lightColour(light) {
  if (!light) return 'rgb(255,255,255)';
  let css = colours.get(light);
  if (!css) { css = `rgb(${[light.r, light.g, light.b].map(v => Math.round(Math.min(1, v) * 255)).join(',')})`; colours.set(light, css); }
  return css;
}

/**
 * Draws one light at (x, y): a soft glow of radius `r` and a small bright core. `a` is its brightness (0..1); nothing is
 * drawn at 0. `rgb` is the glow's colour as 'r,g,b' (warm lamplight by default). No new objects are made per call.
 */
export function glow(c, x, y, r, a, rgb = WARM) {
  if (a <= 0.004) return;
  if (bulbs) { const d = Math.min(r * 0.16, MAX_DOT); c.globalAlpha = Math.min(1, a * 1.2); c.drawImage(sprite(DOT), x - d, y - d, d * 2, d * 2); return; }
  c.globalAlpha = Math.min(1, a);
  c.drawImage(sprite(rgb), x - r, y - r, r * 2, r * 2);
  c.globalAlpha = Math.min(1, a * 1.2);
  c.drawImage(sprite(CORE), x - r * 0.18, y - r * 0.18, r * 0.36, r * 0.36);
}

/**
 * A soft glow with no bright core: the warm haze around a lit house, or light spilling on the ground. `sy` squashes it
 * up and down (1: round, 0.5: an oval twice as wide as tall). Nothing is drawn at a brightness of 0.
 */
export function halo(c, x, y, r, a, rgb = WARM, sy = 1) {
  if (a <= 0.004 || bulbs) return;
  c.globalAlpha = Math.min(1, a);
  c.drawImage(sprite(rgb), x - r, y - r * sy, r * 2, r * 2 * sy);
}

/**
 * How bright a light is that switches on at darkness `at` (0..1; above 1: it never does): it fades on over a little more
 * darkness, then follows the darkness. So lights come on one by one at dusk, and are brightest in full night.
 */
export function switchOn(at, darkness) {
  const t = Math.min(1, Math.max(0, (darkness - at) / 0.12));
  return t * t * (3 - 2 * t) * darkness;
}
