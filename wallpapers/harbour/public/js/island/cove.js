import { TAU } from '../core/math.js';

/**
 * The cove: a bite out of the shore, away from the lighthouse, with deep land behind it for the town.
 * Returns false when this island has no suitable place (the generator then tries another).
 */
export function carveCove(ctx) {
  const { G, map, hw, hh, centre: [cx, cy], light } = ctx;
  let bay = null, direction = null;
  for (let i = 0; i < 24 && !bay; i++) {
    const th = i < 14 ? 1.571 + (G() - 0.5) * 2.4 : G() * TAU, dx = Math.cos(th), dy = Math.sin(th);
    let x = cx, y = cy;
    for (let k = 0; k < 80 && ctx.field(x, y) < 0; k++) { x += dx * 0.01; y += dy * 0.01; }
    if (Math.hypot(x - light.x, y - light.y) < 0.3 || Math.abs(x) > hw - 0.14 || Math.abs(y) > hh - 0.05) continue;
    if (ctx.field(x - dx * 0.2, y - dy * 0.2) > -0.1 || ctx.field(x - dx * 0.3, y - dy * 0.3) > -0.05) continue;
    bay = map.bay = [x, y, ctx.between(0.12, 0.15)]; direction = [dx, dy, th];
  }
  if (!bay) return false;
  ctx.bay = bay; ctx.bayDirection = direction;
  ctx.back = direction[2] + Math.PI;   // the direction from the cove into the land
  return true;
}

/**
 * The harbour wall around the cove, and the pier with its sheltering arm.
 * Returns false when the wall would be too short.
 */
export function buildHarbour(ctx) {
  const { G, map, bay, bayDirection: bd, back } = ctx;
  let quay = [], run = [];
  for (let th = back - 1.6; th <= back + 1.6; th += 0.05) {
    const x = bay[0] + Math.cos(th) * (bay[2] + 0.012), y = bay[1] + Math.sin(th) * (bay[2] + 0.012);
    if (ctx.field(x, y) < -0.004) run.push([x, y]);
    else { if (run.length > quay.length) quay = run; run = []; }
  }
  if (run.length > quay.length) quay = run;
  if (quay.length < 8) return false;
  map.quay = ctx.quay = quay;

  let x = bay[0] - bd[0] * (bay[2] + 0.03), y = bay[1] - bd[1] * (bay[2] + 0.03);
  for (let k = 0; k < 40 && ctx.field(x, y) < 0.004; k++) { x += bd[0] * 0.004; y += bd[1] * 0.004; }
  const side = G() < 0.5 ? 1 : -1;
  map.pier = ctx.pier = [
    [x - bd[0] * 0.012, y - bd[1] * 0.012],
    [x + bd[0] * 0.078, y + bd[1] * 0.078],
    [x + bd[0] * 0.084 - bd[1] * 0.06 * side, y + bd[1] * 0.084 + bd[0] * 0.06 * side]
  ];
  return true;
}
