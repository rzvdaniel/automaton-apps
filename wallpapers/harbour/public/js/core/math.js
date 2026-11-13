// Small pure maths helpers. Nothing here touches the page.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, u) => a + (b - a) * u;
/** The signed shortest turn from angle `from` to angle `to`, in radians. */
export const angDiff = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Smooth minimum: blends two distances so shapes merge softly (k is the blend width). */
export const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };

/** A seeded random source returning numbers in [0, 1): the same seed always gives the same sequence. */
export const rng = seed => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A few corner points become one smooth, closely sampled line (roads are drawn and travelled along it). */
export const dense = pts => {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]]; let prev = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = i === pts.length - 2 ? pts[i + 1] : [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    for (let k = 1; k <= 8; k++) { const u = k / 8, v = 1 - u; out.push([v * v * prev[0] + 2 * v * u * pts[i][0] + u * u * mid[0], v * v * prev[1] + 2 * v * u * pts[i][1] + u * u * mid[1]]); }
    prev = mid;
  }
  return out;
};

/** The distance from a point to a polyline. */
export const distTo = (pts, x, y) => {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0] - ax, by = pts[i + 1][1] - ay;
    const t = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - bx * t, y - ay - by * t));
  }
  return best;
};
