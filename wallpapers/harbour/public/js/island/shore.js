import { TAU, distTo } from '../core/math.js';
import { SCALES } from './scales.js';

/** The fisherman's rock and every other stone: clusters of boulders along the shore, loose ones, outcrops in the meadow, a reef off the point. */
export function placeShore(ctx) {
  const { G, hw, hh, tip, light, stones, parasols } = ctx;
  const fishSize = SCALES.Fisherman || 1;   // his float, rock and rod grow with him

  // the fisherman's rock: a quiet bit of shore with open water in front of it
  for (let i = 0; i < 40 && !ctx.fisher; i++) {
    const p = ctx.shoreAt(G() * TAU), g = ctx.world.grad(p[0], p[1]);
    if (!ctx.offCove(p[0], p[1], 0.1) || !ctx.onScreen(p[0] + g.gx * 0.05 * fishSize, p[1] + g.gy * 0.05 * fishSize, 0.05) || Math.hypot(p[0] - light.x, p[1] - light.y) < 0.12 || !ctx.farFrom(parasols, p[0], p[1], 0.1)) continue;
    if (ctx.field(p[0] + g.gx * 0.046 * fishSize, p[1] + g.gy * 0.046 * fishSize) < 0.022) continue;
    ctx.fisher = { x: p[0], y: p[1], dx: g.gx, dy: g.gy };
    stones.push({ x: p[0], y: p[1] - 0.0005, r: 0.0105 * fishSize, rot: G() * TAU, wet: false, moss: false, flat: true });
  }

  const stone = (x, y, r) => {
    const f = ctx.field(x, y);
    if (f > 0.03 || f < -0.03 || !ctx.offCove(x, y, 0.045) || !ctx.farFrom(parasols, x, y, 0.06) || !ctx.farFrom(stones, x, y, r * 1.3 + 0.003) || ctx.nearRoad(x, y) < 0.012 + r || !ctx.farFrom(ctx.houses, x, y, 0.024 + r)) return;
    stones.push({ x, y, r, rot: G() * TAU, wet: f > 0.001, moss: f < -0.004 && G() < 0.7 });
  };
  for (let i = 7 + Math.floor(G() * 4); i > 0; i--) {   // clusters
    const p = ctx.shoreAt(G() * TAU);
    for (let k = 4 + Math.floor(G() * 7); k > 0; k--) { const a = G() * TAU, d = Math.sqrt(G()) * 0.04; stone(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, 0.0035 + G() * G() * 0.009); }
  }
  for (let i = 0; i < 36; i++) { const p = ctx.shoreAt(G() * TAU); stone(p[0] + (G() - 0.5) * 0.03, p[1] + (G() - 0.5) * 0.03, 0.0028 + G() * 0.0035); }   // loose ones

  for (let i = 0, outcrops = 0; i < 40 && outcrops < 3; i++) {   // outcrops in the meadow
    const x = ctx.between(-hw, hw), y = ctx.between(-hh, hh);
    if (ctx.field(x, y) > -0.09 || !ctx.clear(x, y, 0.02) || !ctx.farFrom(ctx.trees, x, y, 0.03)) continue;
    for (let s = 3 + Math.floor(G() * 3); s > 0; s--) {
      const px = x + (G() - 0.5) * 0.036, py = y + (G() - 0.5) * 0.026, r = 0.004 + G() * 0.006;
      if (ctx.clear(px, py, r) && ctx.farFrom(stones, px, py, r * 1.3 + 0.003)) stones.push({ x: px, y: py, r, rot: G() * TAU, wet: false, moss: true });
    }
    outcrops++;
  }
  for (let i = 0; i < 22; i++) {   // a reef off the lighthouse point
    const a = G() * TAU, d = 0.05 + G() * 0.045, x = tip[0] + Math.cos(a) * d, y = tip[1] + Math.sin(a) * d * 0.9, r = 0.004 + G() * 0.006;
    if (ctx.field(x, y) > 0.004 && ctx.farFrom(stones, x, y, r * 1.3 + 0.003)) stones.push({ x, y, r, rot: G() * TAU, wet: true, moss: false });
  }
}

/** Boats at their moorings in the cove, and the people standing along the quay. */
export function moorBoats(ctx) {
  const { G, bay, back, pier, moored, quay } = ctx;
  for (let i = 0; i < 80 && moored.length < 9; i++) {
    const a = back + (G() - 0.5) * 2.4, d = 0.04 + G() * 0.08, x = bay[0] + Math.cos(a) * d, y = bay[1] + Math.sin(a) * d;
    if (ctx.field(x, y) > 0.018 && distTo(pier, x, y) > 0.016 && ctx.farFrom(moored, x, y, 0.022)) {
      moored.push({ x, y, a: G() * TAU, col: ctx.pick(['#e2553f', '#2b8089', '#f3c148', '#3f6fb5', '#f7f2e8']), mast: G() < 0.35 });
    }
  }
  quay.forEach((p, n) => { if (n % 6 === 3) ctx.standing.push([p[0] + (G() - 0.5) * 0.006, p[1] + (G() - 0.5) * 0.006]); });
}
