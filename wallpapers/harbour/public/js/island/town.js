const WALLS = ['#f6d55c', '#ef8a7a', '#7fc4d8', '#f6f1e6', '#9ed39a', '#e9a4c4', '#f2a65a', '#7fa6e6', '#f6f1e6'];
const ROOFS = [['#677785', '#515f6c'], ['#677785', '#515f6c'], ['#72808a', '#5a6872'], ['#dcbd7e', '#c4a161'], ['#d2694c', '#b6513a']];
const HOUSE_ROWS = [[0.048, 0.036, 0], [0.105, 0.04, 0.25], [0.165, 0.05, 0.5]];   // [distance from the cove, spacing, chance to leave a gap]

/** The church behind the town, three rows of houses facing the water, farmhouses by the roads, and the keeper's cottage. */
export function buildTown(ctx) {
  const { G, bay, back, tip, outward: [ox, oy], houses } = ctx;

  for (let i = 0; i < 20 && !ctx.church; i++) {
    const th = back + (G() - 0.5) * 1.6, x = bay[0] + Math.cos(th) * (bay[2] + ctx.between(0.13, 0.19)), y = bay[1] + Math.sin(th) * (bay[2] + 0.16);
    if (ctx.field(x, y) < -0.06 && ctx.nearRoad(x, y) > 0.035) ctx.church = { x, y, a: (G() - 0.5) * 0.8 };
  }

  for (const [distance, spacing, gap] of HOUSE_ROWS) {
    const radius = bay[2] + distance;
    for (let th = back - 1.3; th <= back + 1.3; th += spacing / radius) {
      const a = th + (G() - 0.5) * 0.03, x = bay[0] + Math.cos(a) * radius, y = bay[1] + Math.sin(a) * radius;
      if (G() < gap || ctx.field(x, y) > -0.02 || ctx.nearRoad(x, y) < 0.02 || !ctx.offChurch(x, y, 0.045)) continue;
      houses.push({ x, y, a: a + 1.571 + (G() - 0.5) * 0.2, wall: ctx.pick(WALLS), roof: ctx.pick(ROOFS), w: 0.026 + G() * 0.008, smoke: G() < 0.22 });
    }
  }

  // farmhouses beside the roads, away from the town
  for (let i = 0; i < 30 && houses.filter(h => h.farm).length < 5; i++) {
    const road = ctx.pick(ctx.map.roads).pts, p = ctx.pick(road), off = (G() < 0.5 ? 1 : -1) * 0.03;
    const x = p[0] + off * (G() - 0.5) * 2, y = p[1] + off;
    if (ctx.field(x, y) < -0.05 && ctx.nearRoad(x, y) > 0.02 && ctx.farFrom(houses, x, y, 0.07) && Math.hypot(x - bay[0], y - bay[1]) > bay[2] + 0.22) {
      houses.push({ x, y, a: (G() - 0.5) * 1.2, wall: '#f6f1e6', roof: ROOFS[3], w: 0.03, smoke: true, farm: true });
    }
  }

  // the keeper's cottage, beside the road to the lighthouse
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1, x = tip[0] - ox * 0.05 - oy * 0.026 * s, y = tip[1] - oy * 0.05 + ox * 0.026 * s;
    if (ctx.field(x, y) < -0.016 && ctx.nearRoad(x, y) > 0.016 && ctx.farFrom(houses, x, y, 0.05)) {
      houses.push({ x, y, a: (G() - 0.5) * 0.5, wall: '#f6f1e6', roof: ROOFS[0], w: 0.023, smoke: true });
      break;
    }
  }
}
