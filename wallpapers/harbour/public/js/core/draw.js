// Small drawing helpers for a 2D canvas context `c` working in world units.
import { TAU } from './math.js';

export const SHADE = '16,48,70';   // the colour (r,g,b) every shadow is made of
/** A shadow colour at the given opacity. */
export const shade = a => `rgba(${SHADE},${a})`;

export const disc = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fill(); };
export const oval = (c, x, y, rx, ry, col, rot = 0) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); c.fill(); };
/** Starts a path through the points. */
export const line = (c, pts) => { c.beginPath(); pts.forEach((p, n) => c[n ? 'lineTo' : 'moveTo'](p[0], p[1])); };
/** Starts a rounded-rectangle path. */
export const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
/** Painted sprites are drawn in their own roomy units: move to (x, y), turn, scale, then paint. */
export const sprite = (c, x, y, rot, scale, paint) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(scale, scale); paint(); c.restore(); };
export const fillPath = (c, path, col) => { c.fillStyle = col; c.fill(path); };
export const strokePath = (c, path, col, width) => { c.strokeStyle = col; c.lineWidth = width; c.stroke(path); };
