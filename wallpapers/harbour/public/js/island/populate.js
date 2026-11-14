import { TAU } from '../core/math.js';
import {
  Whale, Shark, SleekShark, FishSchool, DuneGrass, Heather, Fields, Sheep, Roads, Quay, MooredBoat, Sailboat, Rock, Lighthouse, Parasol, Gorse,
  House, Cottage, Church, Oak, Pine, Birch, Person, Walker, Cat, Car, Fisherman, Fox, GullFlock, Gull, Cloud
} from '../entities/index.js';

const TREES = { Oak, Pine, Birch };

/** Turns everything laid out so far into entities. Within a drawing layer, later ones are drawn on top. */
export function populateIsland(ctx) {
  const { G, world, hw, hh } = ctx, add = e => ctx.add(e), everything = ctx.extras.everything;

  // the sea: a whale (the first one comes by within seconds), two sharks (a smaller and a bigger, one of each shape), schools of fish
  const whale = add(new Whale(world, G));
  whale.at = world.clock + (everything ? 0.5 : 5 + G() * 40);
  const bigSleek = G() < 0.5;
  add(new Shark(world, G, bigSleek ? 0.7 : 1.3)); add(new SleekShark(world, G, bigSleek ? 1.3 : 0.7));
  for (let i = 3 + Math.floor(G() * 3); i > 0; i--) {
    let x, y;
    for (let k = 0; k < 40; k++) { x = ctx.between(-hw + 0.1, hw - 0.1); y = ctx.between(-hh + 0.1, hh - 0.1); if (ctx.field(x, y) > 0.14) break; }
    const fish = [], count = 9 + Math.floor(G() * 14);
    for (let k = 0; k < count; k++) fish.push({ x: x + ctx.between(-0.04, 0.04), y: y + ctx.between(-0.04, 0.04), vx: 0, vy: 0, ph: G() * TAU, rad: ctx.between(0.01, 0.03 + count * 0.0015), sz: ctx.between(0.75, 1.25) });
    add(new FishSchool(world, { x, y, a: G() * TAU, ph: G() * 10, bright: G() < 0.25, fish }));
  }

  // the ground, roads, harbour and boats
  add(new DuneGrass(world, ctx.marram)); add(new Heather(world, ctx.heather)); add(new Fields(world));
  ctx.sheep.forEach(s => add(new Sheep(world, s)));
  add(new Roads(world)); add(new Quay(world));
  ctx.moored.forEach(m => add(new MooredBoat(world, m)));
  for (let i = 2 + Math.floor(G() * 2); i > 0; i--) {
    for (let k = 0; k < 40; k++) {
      const x = ctx.between(-hw, hw), y = ctx.between(-hh, hh);
      if (ctx.field(x, y) > 0.2) { add(new Sailboat(world, { x, y, a: G() * TAU, sail: G() < 0.3 ? '#e2553f' : '#fffaf0' })); break; }
    }
  }

  // things standing on the land
  ctx.stones.forEach(s => add(new Rock(world, s)));
  add(new Lighthouse(world, ctx.light.x, ctx.light.y));
  ctx.parasols.forEach(p => add(new Parasol(world, p)));
  ctx.gorse.forEach(g => add(new Gorse(world, g)));
  ctx.houses.forEach(h => add(h.cottage ? new Cottage(world, h) : new House(world, h)));
  if (ctx.church) add(new Church(world, ctx.church));
  ctx.trees.forEach(t => add(new TREES[t.kind](world, t)));

  // the islanders: people standing about, people walking the roads, the cat, the car, the fisherman, and the fox (out only at night)
  ctx.standing.forEach((p, n) => add(new Person(world, p[0], p[1], n)));
  ctx.map.roads.forEach((r, n) => {
    for (let s = 0; s < (n === 2 ? 1 : 2); s++) add(new Walker(world, { road: r.pts, s: G() * (r.pts.length - 1), dir: G() < 0.5 ? 1 : -1, speed: ctx.between(0.008, 0.013), col: Math.floor(G() * 4) }));
  });
  add(new Cat(world)); add(new Car(world, G));
  if (ctx.fisher) add(new Fisherman(world, ctx.fisher));
  add(new Fox(world));   // roams from a random spot (not the island's random source G), so it does not change the island's layout
}

/** The sky: a flock of gulls, a few loners, and clouds on one wind. */
export function populateSky(ctx) {
  const { G, world, hw, hh } = ctx, add = e => ctx.add(e);
  add(new GullFlock(world, G));
  for (let i = 3 + Math.floor(G() * 3); i > 0; i--) add(new Gull(world, ctx.between(-hw, hw), ctx.between(-hh, hh), G() * TAU));
  world.windField.setAngle(G() * TAU);
  for (let i = 2 + Math.floor(G() * 3); i > 0; i--) add(new Cloud(world, G, ctx.between(-hw, hw), ctx.between(-hh, hh)));
}
