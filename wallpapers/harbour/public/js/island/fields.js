import { TAU } from '../core/math.js';

const FIELD_COLOURS = ['#b9dc7c', '#8dc262', '#e6d77c', '#a2cf6a', '#7db557', '#d3e38c'];

/** Walled fields: small grids of fields with shared, slightly wandering corners; one field of each grid holds sheep. */
export function layFields(ctx) {
  const { G, hw, hh, map } = ctx;
  let cells = [];
  for (let i = 0, grids = 0; i < 120 && grids < 4; i++) {
    const x = ctx.between(-hw, hw), y = ctx.between(-hh, hh);
    if (ctx.field(x, y) > -0.1) continue;
    const angle = ctx.between(-0.6, 0.6), cols = 2 + Math.floor(G() * 3), rows = 2 + Math.floor(G() * 2), ux = Math.cos(angle), uy = Math.sin(angle);
    const corners = [], made = [];
    for (let gy = 0; gy <= rows; gy++) for (let gx = 0; gx <= cols; gx++) {
      corners.push([x + ux * (gx - cols / 2) * 0.066 - uy * (gy - rows / 2) * 0.052 + (G() - 0.5) * 0.012, y + uy * (gx - cols / 2) * 0.066 + ux * (gy - rows / 2) * 0.052 + (G() - 0.5) * 0.012]);
    }
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const n = gy * (cols + 1) + gx, quad = [corners[n], corners[n + 1], corners[n + cols + 2], corners[n + cols + 1]];
      const mx = (quad[0][0] + quad[2][0]) / 2, my = (quad[0][1] + quad[2][1]) / 2;
      const ok = quad.every(p => ctx.field(p[0], p[1]) < -0.064) && ctx.nearRoad(mx, my) > 0.032 && ctx.farFrom(ctx.houses, mx, my, 0.045)
        && ctx.offChurch(mx, my, 0.06) && cells.every(o => Math.hypot(o.mx - mx, o.my - my) > 0.062);
      if (ok) made.push({ quad, mx, my, col: ctx.pick(FIELD_COLOURS), rows: G() < 0.45, ang: angle });
    }
    if (made.length >= 2) { made[Math.floor(G() * made.length)].flock = true; cells = cells.concat(made); grids++; }
  }
  map.cells = cells;

  cells.forEach(cell => {
    if (!cell.flock) return;
    cell.rows = false; cell.col = '#a2cf6a';
    for (let s = 5 + Math.floor(G() * 4); s > 0; s--) {
      ctx.sheep.push({ x: cell.mx + (G() - 0.5) * 0.036, y: cell.my + (G() - 0.5) * 0.028, a: G() * TAU, cell, lamb: G() < 0.3, wait: G() * 6 });
    }
  });
}
