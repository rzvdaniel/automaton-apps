// The island generator: lays out land, cove, harbour, roads, town, fields, plants and stones from a seed,
// then fills the world with entities. To add something new to the scene, write its class and add it at the end.
(function (H) {
  'use strict';
  const { TAU, dense, distTo } = H;
  const WALLS = ['#f6d55c', '#ef8a7a', '#7fc4d8', '#f6f1e6', '#9ed39a', '#e9a4c4', '#f2a65a', '#7fa6e6', '#f6f1e6'];
  const ROOFS = [['#677785', '#515f6c'], ['#677785', '#515f6c'], ['#72808a', '#5a6872'], ['#dcbd7e', '#c4a161'], ['#d2694c', '#b6513a']];

  // How big each kind of thing is drawn: 1 is as designed. Change a number to resize every one of that kind (any class name from entities/).
  // Not for Cloud, Roads, Quay, Fields, Heather or DuneGrass: they have no single position to scale about.
  H.SCALES = { Fisherman: 1, Currach: 1, Sailboat: 1 };

  // Returns false when the seed's island has no room for a harbour; the caller tries again.
  H.buildIsland = function (world, G) {
    world.reset();
    const map = world.map, LAND = map.LAND, hw = world.hw, hh = world.hh;
    const pick = list => list[Math.floor(G() * list.length)], between = (lo, hi) => lo + G() * (hi - lo);
    const field = (x, y) => world.field(x, y), pushIn = (p, d) => world.pushIn(p, d);
    const farFrom = (list, x2, y2, gap) => list.every(o => Math.hypot(o.x - x2, o.y - y2) > gap);
    let i, k, x, y, th;
    map.shift = [G() * 40, G() * 40];

    // Land: a wide core and a handful of lobes, stretched along the screen.
    LAND.push([between(-0.08, 0.08), between(-0.04, 0.03), between(0.22, 0.26)]);
    const lobes = 5 + Math.floor(G() * 3);
    for (i = 0; i < lobes; i++) {
      const base = pick(LAND), ang = G() * TAU, r = between(0.12, 0.2), dist = base[2] * between(0.85, 1.2);
      x = base[0] + Math.cos(ang) * dist * 1.5; y = base[1] + Math.sin(ang) * dist * 0.65;
      LAND.push([Math.max(-hw + r + 0.16, Math.min(hw - r - 0.16, x)), Math.max(-hh + r + 0.1, Math.min(hh - r - 0.1, y)), r]);
    }
    let cx = 0, cy = 0, mass = 0; LAND.forEach(b => { cx += b[0] * b[2]; cy += b[1] * b[2]; mass += b[2]; }); cx /= mass; cy /= mass;
    // A rocky point for the lighthouse, on the lobe farthest from the middle.
    const far = LAND.slice().sort((p, q) => Math.hypot(q[0] - cx, q[1] - cy) + q[2] - Math.hypot(p[0] - cx, p[1] - cy) - p[2])[0];
    const ol = Math.hypot(far[0] - cx, far[1] - cy) || 1, ox = (far[0] - cx) / ol, oy = (far[1] - cy) / ol;
    const tip = [Math.max(-hw + 0.1, Math.min(hw - 0.1, far[0] + ox * (far[2] + 0.03))), Math.max(-hh + 0.09, Math.min(hh - 0.09, far[1] + oy * (far[2] + 0.03)))];
    LAND.push([tip[0], tip[1], 0.05]);
    const light = { x: tip[0] + ox * 0.012, y: tip[1] + oy * 0.012 };
    // Sandbanks out at sea.
    for (i = Math.floor(G() * 3); i > 0; i--) for (k = 0; k < 30; k++) { x = between(-hw + 0.1, hw - 0.1); y = between(-hh + 0.1, hh - 0.1); if (field(x, y) > 0.22) { LAND.push([x, y, between(0.03, 0.048)]); break; } }

    // The cove: a bite out of the shore, away from the lighthouse, with deep land behind it for the town.
    let BAY = null, bd = null;
    for (i = 0; i < 24 && !BAY; i++) {
      th = i < 14 ? 1.571 + (G() - 0.5) * 2.4 : G() * TAU;
      const dx = Math.cos(th), dy = Math.sin(th); x = cx; y = cy;
      for (k = 0; k < 80 && field(x, y) < 0; k++) { x += dx * 0.01; y += dy * 0.01; }
      if (Math.hypot(x - light.x, y - light.y) < 0.3 || Math.abs(x) > hw - 0.14 || Math.abs(y) > hh - 0.05) continue;
      if (field(x - dx * 0.2, y - dy * 0.2) > -0.1 || field(x - dx * 0.3, y - dy * 0.3) > -0.05) continue;
      BAY = map.BAY = [x, y, between(0.12, 0.15)]; bd = [dx, dy, th];
    }
    if (!BAY) return false;
    const back = bd[2] + Math.PI;   // the direction from the cove into the land

    // Harbour wall around the cove, and the pier with its sheltering arm.
    let quay = [], run = [];
    for (th = back - 1.6; th <= back + 1.6; th += 0.05) {
      x = BAY[0] + Math.cos(th) * (BAY[2] + 0.012); y = BAY[1] + Math.sin(th) * (BAY[2] + 0.012);
      if (field(x, y) < -0.004) run.push([x, y]); else { if (run.length > quay.length) quay = run; run = []; }
    }
    if (run.length > quay.length) quay = run;
    if (quay.length < 8) return false;
    map.quay = quay;
    x = BAY[0] - bd[0] * (BAY[2] + 0.03); y = BAY[1] - bd[1] * (BAY[2] + 0.03);
    for (k = 0; k < 40 && field(x, y) < 0.004; k++) { x += bd[0] * 0.004; y += bd[1] * 0.004; }
    const side = G() < 0.5 ? 1 : -1;
    const pier = map.pier = [[x - bd[0] * 0.012, y - bd[1] * 0.012], [x + bd[0] * 0.078, y + bd[1] * 0.078], [x + bd[0] * 0.084 - bd[1] * 0.06 * side, y + bd[1] * 0.084 + bd[0] * 0.06 * side]];

    // Roads: from the quay up to a crossroads, on to the far end of the island, and out to the lighthouse.
    const roads = map.roads;
    const road = (from, to, width) => {
      const n = Math.max(2, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.08)), pts = [from.slice()], px = -(to[1] - from[1]), py = to[0] - from[0], pl = Math.hypot(px, py) || 1;
      for (let s = 1; s < n; s++) { const j = (G() - 0.5) * 0.06; pts.push(pushIn([from[0] + (to[0] - from[0]) * s / n + px / pl * j, from[1] + (to[1] - from[1]) * s / n + py / pl * j], 0.05)); }
      pts.push(to.slice()); roads.push({ pts: dense(pts), w: width });
    };
    const hub = pushIn([BAY[0] - bd[0] * (BAY[2] + 0.14), BAY[1] - bd[1] * (BAY[2] + 0.14)], 0.09);
    const big = LAND.filter(b => b[2] > 0.09).sort((p, q) => Math.hypot(q[0] - light.x, q[1] - light.y) + Math.hypot(q[0] - BAY[0], q[1] - BAY[1]) - Math.hypot(p[0] - light.x, p[1] - light.y) - Math.hypot(p[0] - BAY[0], p[1] - BAY[1]))[0];
    road([BAY[0] - bd[0] * (BAY[2] + 0.014), BAY[1] - bd[1] * (BAY[2] + 0.014)], hub, 0.0105);
    road(hub, pushIn([big[0], big[1]], 0.05), 0.0105);
    road(hub, [tip[0] - ox * 0.02, tip[1] - oy * 0.02], 0.0085);
    // The beach is on a shore facing away from the cove; a footpath leads to it.
    const beachDir = bd[2] + Math.PI + (G() - 0.5) * 1.6; let bx = cx, by = cy;
    for (k = 0; k < 90 && field(bx, by) < -0.022; k++) { bx += Math.cos(beachDir) * 0.01; by += Math.sin(beachDir) * 0.01; }
    const mid = roads[1].pts[Math.floor(roads[1].pts.length / 2)];
    map.path = dense([mid.slice(), pushIn([(mid[0] + bx) / 2 + (G() - 0.5) * 0.06, (mid[1] + by) / 2 + (G() - 0.5) * 0.06], 0.04), [bx, by]]);
    const nearRoad = (x2, y2) => { let d = distTo(map.path, x2, y2); roads.forEach(r => { d = Math.min(d, distTo(r.pts, x2, y2)); }); return d; };
    const parasols = [], standing = [];
    for (i = -3; i <= 3; i++) {
      const pt = pushIn([bx - Math.sin(beachDir) * i * 0.028, by + Math.cos(beachDir) * i * 0.028], 0.014);
      if (i !== 0 && field(pt[0], pt[1]) > -0.045 && G() < 0.8) parasols.push({ x: pt[0], y: pt[1], col: pick(['#ff6f61', '#f3c148', '#2fa7a0']), rot: G() * TAU });
    }
    parasols.forEach(p => standing.push([p.x + 0.012, p.y + 0.006]));

    // The church stands behind the town.
    let church = null;
    for (i = 0; i < 20 && !church; i++) { th = back + (G() - 0.5) * 1.6; x = BAY[0] + Math.cos(th) * (BAY[2] + between(0.13, 0.19)); y = BAY[1] + Math.sin(th) * (BAY[2] + 0.16); if (field(x, y) < -0.06 && nearRoad(x, y) > 0.035) church = { x: x, y: y, a: (G() - 0.5) * 0.8 }; }
    const offChurch = (x2, y2, gap) => !church || Math.hypot(x2 - church.x, y2 - church.y) > gap;
    // Three rows of houses facing the water.
    const houses = [];
    [[0.048, 0.036, 0], [0.105, 0.04, 0.25], [0.165, 0.05, 0.5]].forEach(row => {
      const rad = BAY[2] + row[0];
      for (th = back - 1.3; th <= back + 1.3; th += row[1] / rad) {
        const a2 = th + (G() - 0.5) * 0.03; x = BAY[0] + Math.cos(a2) * rad; y = BAY[1] + Math.sin(a2) * rad;
        if (G() < row[2] || field(x, y) > -0.02 || nearRoad(x, y) < 0.02 || !offChurch(x, y, 0.045)) continue;
        houses.push({ x: x, y: y, a: a2 + 1.571 + (G() - 0.5) * 0.2, wall: pick(WALLS), roof: pick(ROOFS), w: 0.026 + G() * 0.008, smoke: G() < 0.22 });
      }
    });
    // Farmhouses beside the roads, away from the town.
    for (i = 0; i < 30 && houses.filter(h => h.farm).length < 5; i++) {
      const rd = pick(roads).pts, rp = pick(rd), off = (G() < 0.5 ? 1 : -1) * 0.03; x = rp[0] + off * (G() - 0.5) * 2; y = rp[1] + off;
      if (field(x, y) < -0.05 && nearRoad(x, y) > 0.02 && farFrom(houses, x, y, 0.07) && Math.hypot(x - BAY[0], y - BAY[1]) > BAY[2] + 0.22) houses.push({ x: x, y: y, a: (G() - 0.5) * 1.2, wall: '#f6f1e6', roof: ROOFS[3], w: 0.03, smoke: true, farm: true });
    }
    // The keeper's cottage, beside the road to the lighthouse.
    for (i = 0; i < 2; i++) {
      const s = i ? -1 : 1; x = tip[0] - ox * 0.05 - oy * 0.026 * s; y = tip[1] - oy * 0.05 + ox * 0.026 * s;
      if (field(x, y) < -0.016 && nearRoad(x, y) > 0.016 && farFrom(houses, x, y, 0.05)) { houses.push({ x: x, y: y, a: (G() - 0.5) * 0.5, wall: '#f6f1e6', roof: ROOFS[0], w: 0.023, smoke: true }); break; }
    }

    // Walled fields: small grids with shared, slightly wandering corners.
    let cells = [];
    for (i = 0, k = 0; i < 120 && k < 4; i++) {
      x = between(-hw, hw); y = between(-hh, hh); if (field(x, y) > -0.1) continue;
      const ga = between(-0.6, 0.6), cols = 2 + Math.floor(G() * 3), rows = 2 + Math.floor(G() * 2), ux = Math.cos(ga), uy = Math.sin(ga), v = [], made = [];
      let gx, gy;
      for (gy = 0; gy <= rows; gy++) for (gx = 0; gx <= cols; gx++) v.push([x + ux * (gx - cols / 2) * 0.066 - uy * (gy - rows / 2) * 0.052 + (G() - 0.5) * 0.012, y + uy * (gx - cols / 2) * 0.066 + ux * (gy - rows / 2) * 0.052 + (G() - 0.5) * 0.012]);
      for (gy = 0; gy < rows; gy++) for (gx = 0; gx < cols; gx++) {
        const n = gy * (cols + 1) + gx, quad = [v[n], v[n + 1], v[n + cols + 2], v[n + cols + 1]], mx = (quad[0][0] + quad[2][0]) / 2, my = (quad[0][1] + quad[2][1]) / 2;
        const ok = quad.every(p => field(p[0], p[1]) < -0.064) && nearRoad(mx, my) > 0.032 && farFrom(houses, mx, my, 0.045) && offChurch(mx, my, 0.06) && cells.every(o => Math.hypot(o.mx - mx, o.my - my) > 0.062);
        if (ok) made.push({ quad: quad, mx: mx, my: my, col: pick(['#b9dc7c', '#8dc262', '#e6d77c', '#a2cf6a', '#7db557', '#d3e38c']), rows: G() < 0.45, ang: ga });
      }
      if (made.length >= 2) { made[Math.floor(G() * made.length)].flock = true; cells = cells.concat(made); k++; }
    }
    map.cells = cells;
    const sheep = [];
    cells.forEach(cell => {
      if (!cell.flock) return;
      cell.rows = false; cell.col = '#a2cf6a';
      for (let s = 5 + Math.floor(G() * 4); s > 0; s--) sheep.push({ x: cell.mx + (G() - 0.5) * 0.036, y: cell.my + (G() - 0.5) * 0.028, a: G() * TAU, cell: cell, lamb: G() < 0.3, wait: G() * 6 });
    });

    // Plants: woods and single trees, gorse along the meadow's edge, heather, dune grass on the sand.
    const inCell = (x2, y2) => cells.some(o => Math.hypot(o.mx - x2, o.my - y2) < 0.045);
    const clear = (x2, y2, r2) => nearRoad(x2, y2) > 0.011 + r2 && !inCell(x2, y2) && farFrom(houses, x2, y2, 0.022 + r2) && offChurch(x2, y2, 0.045) && Math.hypot(x2 - light.x, y2 - light.y) > 0.03;
    const scatter = (list, n, sx, sy, rad, lo, hi, size, tag) => {
      for (let s = 0; s < n * 5 && n > 0; s++) { const a2 = G() * TAU, d2 = Math.sqrt(G()) * rad, px = sx + Math.cos(a2) * d2, py = sy + Math.sin(a2) * d2, f = field(px, py); if (f < -lo && f > -hi && clear(px, py, 0.004)) { const o = { x: px, y: py, r: size * (0.75 + G() * 0.5), rot: G() * TAU }; if (tag) tag(o, f); list.push(o); n--; } }
    };
    const trees = [], gorse = [], heather = [];
    let marram = [];
    // Trees grow in groves of one kind: the island has a few grove centres, and a tree takes the kind of the nearest centre
    // (nine times in ten, so there are now and then strays). Every kind appears somewhere.
    const KINDS = ['Oak', 'Pine', 'Birch'], groves = KINDS.concat([pick(KINDS)]).map(kind => { let g = null; for (let s2 = 0; s2 < 60 && !g; s2++) { const gx = between(-hw, hw), gy = between(-hh, hh); if (field(gx, gy) < -0.08) g = { x: gx, y: gy, kind: kind }; } return g || { x: cx, y: cy, kind: kind }; });
    const kindAt = (px, py) => { if (G() > 0.9) return pick(KINDS); let best = groves[0], bd = 1e9; groves.forEach(g => { const d = Math.hypot(g.x - px, g.y - py); if (d < bd) { bd = d; best = g; } }); return best.kind; };
    for (i = 0; i < 3; i++) for (k = 0; k < 30; k++) {   // woods
      x = between(-hw, hw); y = between(-hh, hh);
      if (field(x, y) < -0.11 && !inCell(x, y)) { scatter(trees, 12 + Math.floor(G() * 14), x, y, between(0.05, 0.08), 0.072, 9, 0.015, o => { o.kind = kindAt(o.x, o.y); }); break; }
    }
    scatter(trees, 18, cx, cy, 0.6, 0.068, 9, 0.012, o => { o.kind = kindAt(o.x, o.y); });   // single trees, by the same rule
    scatter(gorse, 46, cx, cy, 0.8, 0.04, 0.085, 0.0062);
    scatter(heather, 22, cx, cy, 0.8, 0.075, 9, 0.008);
    scatter(marram, 90, cx, cy, 0.9, 0.01, 0.042, 0.006);
    marram = marram.filter(m => Math.hypot(m.x - BAY[0], m.y - BAY[1]) > BAY[2] + 0.03);

    // Where the shore is, walking out from the middle of the island in a given direction.
    const shoreAt = ang => { let px = cx, py = cy; for (let s = 0; s < 140 && field(px, py) < -0.003; s++) { px += Math.cos(ang) * 0.008; py += Math.sin(ang) * 0.008; } return [px, py]; };
    const offCove = (px, py, gap) => Math.hypot(px - BAY[0], py - BAY[1]) > BAY[2] + gap;
    const onScreen = (px, py, edge) => Math.abs(px) < hw - edge && Math.abs(py) < hh - edge;

    // The fisherman's rock: a quiet bit of shore with open water in front of it.
    const stones = []; let fisher = null; const fishSize = H.SCALES.Fisherman || 1;   // his float, rock and rod grow with him
    for (i = 0; i < 40 && !fisher; i++) {
      const p = shoreAt(G() * TAU), g = world.grad(p[0], p[1]);
      if (!offCove(p[0], p[1], 0.1) || !onScreen(p[0] + g.gx * 0.05 * fishSize, p[1] + g.gy * 0.05 * fishSize, 0.05) || Math.hypot(p[0] - light.x, p[1] - light.y) < 0.12 || !farFrom(parasols, p[0], p[1], 0.1)) continue;
      if (field(p[0] + g.gx * 0.046 * fishSize, p[1] + g.gy * 0.046 * fishSize) < 0.022) continue;
      fisher = { x: p[0], y: p[1], dx: g.gx, dy: g.gy };
      stones.push({ x: p[0], y: p[1] - 0.0005, r: 0.0105 * fishSize, rot: G() * TAU, wet: false, moss: false, flat: true });
    }
    // Stones: clusters of boulders along the shore, loose ones between them, outcrops in the meadow, a reef off the point.
    const stone = (px, py, r) => {
      const f = field(px, py);
      if (f > 0.03 || f < -0.03 || !offCove(px, py, 0.045) || !farFrom(parasols, px, py, 0.06) || !farFrom(stones, px, py, r * 1.3 + 0.003) || nearRoad(px, py) < 0.012 + r || !farFrom(houses, px, py, 0.024 + r)) return;
      stones.push({ x: px, y: py, r: r, rot: G() * TAU, wet: f > 0.001, moss: f < -0.004 && G() < 0.7 });
    };
    for (i = 7 + Math.floor(G() * 4); i > 0; i--) { const p = shoreAt(G() * TAU); for (k = 4 + Math.floor(G() * 7); k > 0; k--) { const a2 = G() * TAU, d2 = Math.sqrt(G()) * 0.04; stone(p[0] + Math.cos(a2) * d2, p[1] + Math.sin(a2) * d2, 0.0035 + G() * G() * 0.009); } }
    for (i = 0; i < 36; i++) { const p = shoreAt(G() * TAU); stone(p[0] + (G() - 0.5) * 0.03, p[1] + (G() - 0.5) * 0.03, 0.0028 + G() * 0.0035); }
    for (i = 0, k = 0; i < 40 && k < 3; i++) {
      x = between(-hw, hw); y = between(-hh, hh); if (field(x, y) > -0.09 || !clear(x, y, 0.02) || !farFrom(trees, x, y, 0.03)) continue;
      for (let s = 3 + Math.floor(G() * 3); s > 0; s--) { const px = x + (G() - 0.5) * 0.036, py = y + (G() - 0.5) * 0.026, r = 0.004 + G() * 0.006; if (clear(px, py, r) && farFrom(stones, px, py, r * 1.3 + 0.003)) stones.push({ x: px, y: py, r: r, rot: G() * TAU, wet: false, moss: true }); }
      k++;
    }
    for (i = 0; i < 22; i++) { const ra = G() * TAU, rdist = 0.05 + G() * 0.045; x = tip[0] + Math.cos(ra) * rdist; y = tip[1] + Math.sin(ra) * rdist * 0.9; const r = 0.004 + G() * 0.006; if (field(x, y) > 0.004 && farFrom(stones, x, y, r * 1.3 + 0.003)) stones.push({ x: x, y: y, r: r, rot: G() * TAU, wet: true, moss: false }); }

    // Boats at their moorings.
    const moored = [];
    for (i = 0; i < 80 && moored.length < 9; i++) { const ma = back + (G() - 0.5) * 2.4, md = 0.04 + G() * 0.08; x = BAY[0] + Math.cos(ma) * md; y = BAY[1] + Math.sin(ma) * md; if (field(x, y) > 0.018 && distTo(pier, x, y) > 0.016 && farFrom(moored, x, y, 0.022)) moored.push({ x: x, y: y, a: G() * TAU, col: pick(['#e2553f', '#2b8089', '#f3c148', '#3f6fb5', '#f7f2e8']), mast: G() < 0.35 }); }
    quay.forEach((p, n) => { if (n % 6 === 3) standing.push([p[0] + (G() - 0.5) * 0.006, p[1] + (G() - 0.5) * 0.006]); });

    // ---------- the extras: each island gets a random handful of these, on top of everything above ----------
    const EXTRAS = ['Seal', 'Balloon', 'Biplane', 'DolphinPod', 'Currach', 'Puffin', 'Cow', 'Dolmen', 'Cottage', 'Kite', 'Buoy', 'JellyBloom'];
    const mix = EXTRAS.slice(); for (i = mix.length - 1; i > 0; i--) { const j = Math.floor(G() * (i + 1)); [mix[i], mix[j]] = [mix[j], mix[i]]; }
    const query = new URLSearchParams(location.search), everything = query.has('debug') || query.has('all');   // ?debug puts every extra on the island
    const target = everything ? EXTRAS.length : 4 + Math.floor(G() * 3);   // otherwise a third to a half of them
    const placed = [];
    let wanted = target;
    if (mix.slice(0, target).includes('Cottage')) {   // thatch replaces the roof of one or two ordinary houses
      const homes = houses.filter(h => h.w > 0.026);
      for (k = 0; k < 2 && homes.length; k++) { const h = homes.splice(Math.floor(G() * homes.length), 1)[0]; h.cottage = true; h.w = 0.032; h.wall = '#f6f1e6'; h.roof = ['#dcbd7e', '#c4a161']; }
      wanted--; placed.push('Cottage');
    }

    // ---------- everything above becomes entities; within a layer, later ones are drawn on top ----------
    const sizes = new Map(Object.keys(H.SCALES).filter(n => H[n]).map(n => [H[n], H.SCALES[n]]));
    const add = e => { for (let k = e.constructor; k && k !== H.Entity; k = Object.getPrototypeOf(k)) if (sizes.has(k)) { e.scale = sizes.get(k); break; } return world.add(e); };
    const whale = add(new H.Whale(world, G)); world.debug = everything; whale.at = world.clock + (everything ? 0.5 : 5 + G() * 40); const bigSleek = G() < 0.5; add(new H.Shark(world, G, bigSleek ? 0.7 : 1.3)); add(new H.SleekShark(world, G, bigSleek ? 1.3 : 0.7));   // two sharks, one of each shape: a smaller and a bigger   // the first whale comes by within seconds
    for (i = 3 + Math.floor(G() * 3); i > 0; i--) {
      for (k = 0; k < 40; k++) { x = between(-hw + 0.1, hw - 0.1); y = between(-hh + 0.1, hh - 0.1); if (field(x, y) > 0.14) break; }
      const fish = [], count = 9 + Math.floor(G() * 14);
      for (k = 0; k < count; k++) fish.push({ x: x + between(-0.04, 0.04), y: y + between(-0.04, 0.04), vx: 0, vy: 0, ph: G() * TAU, rad: between(0.01, 0.03 + count * 0.0015), sz: between(0.75, 1.25) });
      add(new H.FishSchool(world, { x: x, y: y, a: G() * TAU, ph: G() * 10, bright: G() < 0.25, fish: fish }));
    }
    add(new H.DuneGrass(world, marram)); add(new H.Heather(world, heather)); add(new H.Fields(world));
    sheep.forEach(s => add(new H.Sheep(world, s)));
    add(new H.Roads(world)); add(new H.Quay(world));
    moored.forEach(m => add(new H.MooredBoat(world, m)));
    for (i = 2 + Math.floor(G() * 2); i > 0; i--) for (k = 0; k < 40; k++) { x = between(-hw, hw); y = between(-hh, hh); if (field(x, y) > 0.2) { add(new H.Sailboat(world, { x: x, y: y, a: G() * TAU, sail: G() < 0.3 ? '#e2553f' : '#fffaf0' })); break; } }

    stones.forEach(s => add(new H.Rock(world, s)));
    add(new H.Lighthouse(world, light.x, light.y));
    parasols.forEach(p => add(new H.Parasol(world, p)));
    gorse.forEach(g => add(new H.Gorse(world, g)));
    houses.forEach(h => add(new H[h.cottage ? 'Cottage' : 'House'](world, h)));
    if (church) add(new H.Church(world, church));
    trees.forEach(t => add(new H[t.kind](world, t)));
    standing.forEach((p, n) => add(new H.Person(world, p[0], p[1], n)));
    roads.forEach((r, n) => { for (let s = 0; s < (n === 2 ? 1 : 2); s++) add(new H.Walker(world, { road: r.pts, s: G() * (r.pts.length - 1), dir: G() < 0.5 ? 1 : -1, speed: between(0.008, 0.013), col: Math.floor(G() * 4) })); });
    add(new H.Cat(world)); add(new H.Car(world, G));
    if (fisher) add(new H.Fisherman(world, fisher));

    // A spot in open water (field between lo and hi) or in clear meadow; null when there is none.
    const water = (lo, hi, edge) => { for (let s = 0; s < 60; s++) { const px = between(-hw + edge, hw - edge), py = between(-hh + edge, hh - edge), f = field(px, py); if (f > lo && f < hi && offCove(px, py, 0.08)) return [px, py]; } return null; };
    const meadow = (r, gap) => {   // tries hard first, then settles for tighter spots
      for (let s = 0; s < 240; s++) { const px = between(-hw, hw), py = between(-hh, hh), loose = s > 100 ? 0.6 : 1; if (field(px, py) < (loose < 1 ? -0.07 : -0.09) && clear(px, py, r * loose) && farFrom(trees, px, py, gap * loose) && farFrom(stones, px, py, gap * loose)) return [px, py]; }
      return null;
    };
    const put = {
      Seal() {   // basking on the sand with their backs to the sea
        for (let s = 0; s < 30; s++) {
          const p = shoreAt(G() * TAU), g = world.grad(p[0], p[1]);
          if (!offCove(p[0], p[1], 0.1) || !onScreen(p[0], p[1], 0.08) || !farFrom(parasols, p[0], p[1], 0.1) || (fisher && Math.hypot(p[0] - fisher.x, p[1] - fisher.y) < 0.1)) continue;
          const kinds = G() < 0.5 ? ['grey', 'pup'] : G() < 0.5 ? ['brown', 'grey'] : ['grey', 'brown', 'pup'], ang = Math.atan2(g.gy, g.gx);
          kinds.forEach((kind, n) => add(new H.Seal(world, { x: p[0] - g.gx * 0.004 - g.gy * n * 0.016, y: p[1] - g.gy * 0.004 + g.gx * n * 0.016, a: ang + (G() - 0.5) * 1.2, kind: kind })));
          return true;
        }
        return false;
      },
      Balloon() { add(new H.Balloon(world, { x: between(-hw, hw), y: between(-hh, hh) })); return true; },
      Biplane() { add(new H.Biplane(world, { x: between(-hw, hw), y: between(-hh, hh), a: G() * TAU })); return true; },
      DolphinPod() { const p = water(0.25, 9, 0.12); if (!p) return false; add(new H.DolphinPod(world, { x: p[0], y: p[1], a: G() * TAU, count: 3 + Math.floor(G() * 3) })); return true; },
      Currach() { const p = water(0.06, 0.16, 0.08); if (!p || !farFrom(moored, p[0], p[1], 0.05)) return false; add(new H.Currach(world, { x: p[0], y: p[1], a: G() * TAU })); return true; },
      Puffin() {   // a few together, on the grass just above the shore
        for (let s = 0; s < 30; s++) {
          const p = shoreAt(G() * TAU), g = world.grad(p[0], p[1]), x2 = p[0] - g.gx * 0.035, y2 = p[1] - g.gy * 0.035;
          if (!offCove(p[0], p[1], 0.1) || !onScreen(p[0], p[1], 0.06) || field(x2, y2) > -0.02 || !clear(x2, y2, 0.006)) continue;
          for (let n = 0; n < 3; n++) add(new H.Puffin(world, { x: x2 + (G() - 0.5) * 0.034, y: y2 + (G() - 0.5) * 0.022, flip: G() < 0.5 }));
          return true;
        }
        return false;
      },
      Cow() { const p = meadow(0.012, 0.03); if (!p) return false; for (let n = 2 + Math.floor(G() * 2); n > 0; n--) add(new H.Cow(world, { x: p[0] + (G() - 0.5) * 0.04, y: p[1] + (G() - 0.5) * 0.03, a: G() * TAU, kind: pick(['friesian', 'friesian', 'red', 'kerry']) })); return true; },
      Dolmen() { const p = meadow(0.025, 0.04); if (!p) return false; add(new H.Dolmen(world, { x: p[0], y: p[1] })); return true; },
      Kite() { const p = meadow(0.01, 0.04); if (!p) return false; add(new H.Kite(world, { x: p[0], y: p[1] })); return true; },
      Buoy() {   // off the harbour mouth
        for (let s = 0; s < 120; s++) {
          const wide = s > 40 ? 2 : 1, d = BAY[2] + 0.05 + G() * 0.1 * wide, a2 = bd[2] + (G() - 0.5) * 1.2 * wide, px = BAY[0] + Math.cos(a2) * d, py = BAY[1] + Math.sin(a2) * d;
          if (field(px, py) > 0.05 && onScreen(px, py, 0.06) && distTo(pier, px, py) > 0.04 && farFrom(moored, px, py, 0.03)) { add(new H.Buoy(world, { x: px, y: py })); return true; }
        }
        return false;
      },
      JellyBloom() { const p = water(0.06, 9, 0.1); if (!p) return false; add(new H.JellyBloom(world, { x: p[0], y: p[1], count: 5 + Math.floor(G() * 4) })); return true; }
    };
    for (i = 0; i < mix.length && wanted > 0; i++) if (put[mix[i]] && put[mix[i]]()) { wanted--; placed.push(mix[i]); }   // one that finds no room is replaced by the next in line
    if (everything) console.log('Harbour extras: ' + placed.join(', ') + (placed.length < EXTRAS.length ? ' (no room for: ' + EXTRAS.filter(n => !placed.includes(n)).join(', ') + ')' : ''));

    // The sky: a flock of gulls, a few loners, clouds on one wind.
    add(new H.GullFlock(world, G));
    for (i = 3 + Math.floor(G() * 3); i > 0; i--) add(new H.Gull(world, between(-hw, hw), between(-hh, hh), G() * TAU));
    const wd = G() * TAU; world.wind = [Math.cos(wd), Math.sin(wd) * 0.5];
    for (i = 2 + Math.floor(G() * 3); i > 0; i--) add(new H.Cloud(world, G, between(-hw, hw), between(-hh, hh)));
    return true;
  };
})(window.Harbour);
