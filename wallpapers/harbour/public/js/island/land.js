import { TAU } from '../core/math.js';

/** Land: a wide core and a handful of lobes, a rocky point for the lighthouse, and sandbanks out at sea. */
export function layOutLand(ctx) {
  const { G, map, hw, hh } = ctx, land = map.land;
  map.shift = [G() * 40, G() * 40];

  land.push([ctx.between(-0.08, 0.08), ctx.between(-0.04, 0.03), ctx.between(0.22, 0.26)]);
  const lobes = 5 + Math.floor(G() * 3);
  for (let i = 0; i < lobes; i++) {
    const base = ctx.pick(land), angle = G() * TAU, r = ctx.between(0.12, 0.2), dist = base[2] * ctx.between(0.85, 1.2);
    const x = base[0] + Math.cos(angle) * dist * 1.5, y = base[1] + Math.sin(angle) * dist * 0.65;
    land.push([Math.max(-hw + r + 0.16, Math.min(hw - r - 0.16, x)), Math.max(-hh + r + 0.1, Math.min(hh - r - 0.1, y)), r]);
  }

  // the middle of the island, weighted by size
  let cx = 0, cy = 0, mass = 0;
  land.forEach(b => { cx += b[0] * b[2]; cy += b[1] * b[2]; mass += b[2]; });
  cx /= mass; cy /= mass;
  ctx.centre = [cx, cy];

  // a rocky point for the lighthouse, on the lobe farthest from the middle
  const far = land.slice().sort((p, q) => Math.hypot(q[0] - cx, q[1] - cy) + q[2] - Math.hypot(p[0] - cx, p[1] - cy) - p[2])[0];
  const length = Math.hypot(far[0] - cx, far[1] - cy) || 1, ox = (far[0] - cx) / length, oy = (far[1] - cy) / length;
  const tip = [Math.max(-hw + 0.1, Math.min(hw - 0.1, far[0] + ox * (far[2] + 0.03))), Math.max(-hh + 0.09, Math.min(hh - 0.09, far[1] + oy * (far[2] + 0.03)))];
  land.push([tip[0], tip[1], 0.05]);
  ctx.tip = tip; ctx.outward = [ox, oy];
  ctx.light = { x: tip[0] + ox * 0.012, y: tip[1] + oy * 0.012 };

  // sandbanks out at sea
  for (let i = Math.floor(G() * 3); i > 0; i--) {
    for (let k = 0; k < 30; k++) {
      const x = ctx.between(-hw + 0.1, hw - 0.1), y = ctx.between(-hh + 0.1, hh - 0.1);
      if (ctx.field(x, y) > 0.22) { land.push([x, y, ctx.between(0.03, 0.048)]); break; }
    }
  }
}
