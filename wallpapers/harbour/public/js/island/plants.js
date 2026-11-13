const TREE_KINDS = ['Oak', 'Pine', 'Birch'];

/**
 * Plants: woods and single trees, gorse along the meadow's edge, heather, dune grass on the sand.
 * Trees grow in groves of one kind: the island has a few grove centres, and a tree takes the kind of the nearest centre
 * (nine times in ten, so there are now and then strays). Every kind appears somewhere.
 */
export function growPlants(ctx) {
  const { G, hw, hh, centre: [cx, cy], bay } = ctx;
  const groves = TREE_KINDS.concat([ctx.pick(TREE_KINDS)]).map(kind => {
    let grove = null;
    for (let s = 0; s < 60 && !grove; s++) { const x = ctx.between(-hw, hw), y = ctx.between(-hh, hh); if (ctx.field(x, y) < -0.08) grove = { x, y, kind }; }
    return grove ?? { x: cx, y: cy, kind };
  });
  const kindAt = (x, y) => {
    if (G() > 0.9) return ctx.pick(TREE_KINDS);
    let best = groves[0], bestDistance = 1e9;
    groves.forEach(g => { const d = Math.hypot(g.x - x, g.y - y); if (d < bestDistance) { bestDistance = d; best = g; } });
    return best.kind;
  };
  const growTree = thing => { thing.kind = kindAt(thing.x, thing.y); };

  for (let i = 0; i < 3; i++) {   // woods
    for (let k = 0; k < 30; k++) {
      const x = ctx.between(-hw, hw), y = ctx.between(-hh, hh);
      if (ctx.field(x, y) < -0.11 && !ctx.inCell(x, y)) { ctx.scatter(ctx.trees, 12 + Math.floor(G() * 14), x, y, ctx.between(0.05, 0.08), 0.072, 9, 0.015, growTree); break; }
    }
  }
  ctx.scatter(ctx.trees, 18, cx, cy, 0.6, 0.068, 9, 0.012, growTree);   // single trees, by the same rule
  ctx.scatter(ctx.gorse, 46, cx, cy, 0.8, 0.04, 0.085, 0.0062);
  ctx.scatter(ctx.heather, 22, cx, cy, 0.8, 0.075, 9, 0.008);
  ctx.scatter(ctx.marram, 90, cx, cy, 0.9, 0.01, 0.042, 0.006);
  ctx.marram = ctx.marram.filter(m => Math.hypot(m.x - bay[0], m.y - bay[1]) > bay[2] + 0.03);
}
