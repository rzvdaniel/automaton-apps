// Night lights: the one small drawing API every lamp, window and lantern uses (in its drawLights pass, see engine/scene.js).
// The lights are drawn on their own canvas above the tinted picture, with 'lighter' (adding light), so they stay warm and bright.

const WARM = '255,196,110', CORE = '255,244,214';
const SIZE = 64;           // pixels across the ready-made glow picture
const sprites = new Map(); // one ready-made soft glow per colour, painted the first time it is needed

/** A soft round glow, bright in the middle and fading to nothing at the edge, painted once onto a small canvas. */
function sprite(rgb) {
  let canvas = sprites.get(rgb);
  if (canvas) return canvas;
  canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d'), h = SIZE / 2, g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.25, `rgba(${rgb},0.45)`); g.addColorStop(0.6, `rgba(${rgb},0.12)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, SIZE, SIZE);
  sprites.set(rgb, canvas);
  return canvas;
}

/**
 * Draws one light at (x, y): a soft glow of radius `r` and a small bright core. `a` is its brightness (0..1); nothing is
 * drawn at 0. `rgb` is the glow's colour as 'r,g,b' (warm lamplight by default). No new objects are made per call.
 */
export function glow(c, x, y, r, a, rgb = WARM) {
  if (a <= 0.004) return;
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
  if (a <= 0.004) return;
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
