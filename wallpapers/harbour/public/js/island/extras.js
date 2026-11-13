import { TAU, distTo } from '../core/math.js';
import { Seal, Balloon, Biplane, DolphinPod, Puffin, Cow, Kite, Buoy, JellyBloom } from '../entities/index.js';

const EXTRAS = ['Seal', 'Balloon', 'Biplane', 'DolphinPod', 'Puffin', 'Cow', 'Cottage', 'Kite', 'Buoy', 'JellyBloom'];

/**
 * Each island gets a random handful of extras, 4 to 6 of them (all of them with ?debug).
 * This picks which, and turns one or two ordinary houses into thatched cottages if the cottage was picked.
 */
export function chooseExtras(ctx) {
  const { G, world, houses } = ctx, everything = world.debug;
  const mix = EXTRAS.slice();
  for (let i = mix.length - 1; i > 0; i--) { const j = Math.floor(G() * (i + 1)); [mix[i], mix[j]] = [mix[j], mix[i]]; }
  const target = everything ? EXTRAS.length : 4 + Math.floor(G() * 3);
  const extras = ctx.extras = { mix, wanted: target, placed: [], everything };

  if (mix.slice(0, target).includes('Cottage')) {   // thatch replaces the roof of one or two ordinary houses
    const homes = houses.filter(h => h.w > 0.026);
    for (let k = 0; k < 2 && homes.length; k++) {
      const h = homes.splice(Math.floor(G() * homes.length), 1)[0];
      Object.assign(h, { cottage: true, w: 0.032, wall: '#f6f1e6', roof: ['#dcbd7e', '#c4a161'] });
    }
    extras.wanted--; extras.placed.push('Cottage');
  }
}

/**
 * Places the chosen extras, each where it belongs (shore, meadow, deep water, sky). One that finds no room is replaced by the next in line.
 * To add an extra: write its class, name it in EXTRAS, and add a placer here that returns true when it placed it.
 */
export function placeExtras(ctx) {
  const { G, world, hw, hh, bay, bayDirection: bd, pier, moored, parasols } = ctx, { extras } = ctx, add = e => ctx.add(e);

  const placers = {
    Seal() {   // basking on the sand with their backs to the sea
      for (let s = 0; s < 30; s++) {
        const p = ctx.shoreAt(G() * TAU), g = world.grad(p[0], p[1]);
        if (!ctx.offCove(p[0], p[1], 0.1) || !ctx.onScreen(p[0], p[1], 0.08) || !ctx.farFrom(parasols, p[0], p[1], 0.1) || (ctx.fisher && Math.hypot(p[0] - ctx.fisher.x, p[1] - ctx.fisher.y) < 0.1)) continue;
        const kinds = G() < 0.5 ? ['grey', 'pup'] : G() < 0.5 ? ['brown', 'grey'] : ['grey', 'brown', 'pup'], angle = Math.atan2(g.gy, g.gx);
        kinds.forEach((kind, n) => add(new Seal(world, { x: p[0] - g.gx * 0.004 - g.gy * n * 0.016, y: p[1] - g.gy * 0.004 + g.gx * n * 0.016, a: angle + (G() - 0.5) * 1.2, kind })));
        return true;
      }
      return false;
    },
    Balloon() { add(new Balloon(world, { x: ctx.between(-hw, hw), y: ctx.between(-hh, hh) })); return true; },
    Biplane() { add(new Biplane(world, { x: ctx.between(-hw, hw), y: ctx.between(-hh, hh), a: G() * TAU })); return true; },
    DolphinPod() { const p = ctx.water(0.25, 9, 0.12); if (!p) return false; add(new DolphinPod(world, { x: p[0], y: p[1], a: G() * TAU, count: 3 + Math.floor(G() * 3) })); return true; },
    Puffin() {   // a few together, on the grass just above the shore
      for (let s = 0; s < 30; s++) {
        const p = ctx.shoreAt(G() * TAU), g = world.grad(p[0], p[1]), x = p[0] - g.gx * 0.035, y = p[1] - g.gy * 0.035;
        if (!ctx.offCove(p[0], p[1], 0.1) || !ctx.onScreen(p[0], p[1], 0.06) || ctx.field(x, y) > -0.02 || !ctx.clear(x, y, 0.006)) continue;
        for (let n = 0; n < 3; n++) add(new Puffin(world, { x: x + (G() - 0.5) * 0.034, y: y + (G() - 0.5) * 0.022, flip: G() < 0.5 }));
        return true;
      }
      return false;
    },
    Cow() {
      const p = ctx.meadow(0.012, 0.03); if (!p) return false;
      for (let n = 2 + Math.floor(G() * 2); n > 0; n--) add(new Cow(world, { x: p[0] + (G() - 0.5) * 0.04, y: p[1] + (G() - 0.5) * 0.03, a: G() * TAU, kind: ctx.pick(['friesian', 'friesian', 'red', 'kerry']) }));
      return true;
    },
    Kite() { const p = ctx.meadow(0.01, 0.04); if (!p) return false; add(new Kite(world, { x: p[0], y: p[1] })); return true; },
    Buoy() {   // off the harbour mouth
      for (let s = 0; s < 120; s++) {
        const wide = s > 40 ? 2 : 1, d = bay[2] + 0.05 + G() * 0.1 * wide, a = bd[2] + (G() - 0.5) * 1.2 * wide, x = bay[0] + Math.cos(a) * d, y = bay[1] + Math.sin(a) * d;
        if (ctx.field(x, y) > 0.05 && ctx.onScreen(x, y, 0.06) && distTo(pier, x, y) > 0.04 && ctx.farFrom(moored, x, y, 0.03)) { add(new Buoy(world, { x, y })); return true; }
      }
      return false;
    },
    JellyBloom() { const p = ctx.water(0.06, 9, 0.1); if (!p) return false; add(new JellyBloom(world, { x: p[0], y: p[1], count: 5 + Math.floor(G() * 4) })); return true; }
  };

  for (let i = 0; i < extras.mix.length && extras.wanted > 0; i++) {
    const name = extras.mix[i];
    if (placers[name]?.()) { extras.wanted--; extras.placed.push(name); }
  }
  if (extras.everything) {
    const missing = EXTRAS.filter(n => !extras.placed.includes(n));
    console.log(`Harbour extras: ${extras.placed.join(', ')}${missing.length ? ` (no room for: ${missing.join(', ')})` : ''}`);
  }
}
