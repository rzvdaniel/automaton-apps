import { TAU, dense } from '../core/math.js';

/** One road from `from` to `to`, wandering a little, pushed inland so it stays on the grass. */
function road(ctx, from, to, width) {
  const { G } = ctx, n = Math.max(2, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.08)), pts = [from.slice()];
  const px = -(to[1] - from[1]), py = to[0] - from[0], pl = Math.hypot(px, py) || 1;
  for (let s = 1; s < n; s++) {
    const j = (G() - 0.5) * 0.06;
    pts.push(ctx.pushIn([from[0] + (to[0] - from[0]) * s / n + px / pl * j, from[1] + (to[1] - from[1]) * s / n + py / pl * j], 0.05));
  }
  pts.push(to.slice());
  ctx.map.roads.push({ pts: dense(pts), w: width });
}

/**
 * Roads from the quay up to a crossroads, on to the far end of the island, and out to the lighthouse;
 * a footpath to the beach, and the parasols and the people standing about on it.
 */
export function layRoads(ctx) {
  const { G, map, bay, bayDirection: bd, tip, outward: [ox, oy], light } = ctx, roads = map.roads;
  const hub = ctx.pushIn([bay[0] - bd[0] * (bay[2] + 0.14), bay[1] - bd[1] * (bay[2] + 0.14)], 0.09);
  const toBay = b => Math.hypot(b[0] - bay[0], b[1] - bay[1]), toLight = b => Math.hypot(b[0] - light.x, b[1] - light.y);
  const big = map.land.filter(b => b[2] > 0.09).sort((p, q) => toLight(q) + toBay(q) - toLight(p) - toBay(p))[0];
  road(ctx, [bay[0] - bd[0] * (bay[2] + 0.014), bay[1] - bd[1] * (bay[2] + 0.014)], hub, 0.0105);
  road(ctx, hub, ctx.pushIn([big[0], big[1]], 0.05), 0.0105);
  road(ctx, hub, [tip[0] - ox * 0.02, tip[1] - oy * 0.02], 0.0085);

  // the beach is on a shore facing away from the cove; a footpath leads to it
  const beachDir = bd[2] + Math.PI + (G() - 0.5) * 1.6;
  let [bx, by] = ctx.centre;
  for (let k = 0; k < 90 && ctx.field(bx, by) < -0.022; k++) { bx += Math.cos(beachDir) * 0.01; by += Math.sin(beachDir) * 0.01; }
  const mid = roads[1].pts[Math.floor(roads[1].pts.length / 2)];
  map.path = dense([mid.slice(), ctx.pushIn([(mid[0] + bx) / 2 + (G() - 0.5) * 0.06, (mid[1] + by) / 2 + (G() - 0.5) * 0.06], 0.04), [bx, by]]);

  for (let i = -3; i <= 3; i++) {
    const pt = ctx.pushIn([bx - Math.sin(beachDir) * i * 0.028, by + Math.cos(beachDir) * i * 0.028], 0.014);
    if (i !== 0 && ctx.field(pt[0], pt[1]) > -0.045 && G() < 0.8) ctx.parasols.push({ x: pt[0], y: pt[1], col: ctx.pick(['#ff6f61', '#f3c148', '#2fa7a0']), rot: G() * TAU });
  }
  ctx.parasols.forEach(p => ctx.standing.push([p.x + 0.012, p.y + 0.006]));
}
