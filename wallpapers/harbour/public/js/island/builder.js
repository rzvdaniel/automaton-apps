import { BuildContext } from './context.js';
import { layOutLand } from './land.js';
import { carveCove, buildHarbour } from './cove.js';
import { layRoads } from './roads.js';
import { buildTown } from './town.js';
import { layFields } from './fields.js';
import { growPlants } from './plants.js';
import { placeShore, moorBoats } from './shore.js';
import { chooseExtras, placeExtras } from './extras.js';
import { populateIsland, populateSky } from './populate.js';

/**
 * Builds an island for the random source `G` into the world, one step at a time. Each step reads what the earlier ones left
 * in the BuildContext and adds its own. The order matters: every step draws from the same random source, so a seed always
 * builds the same island. To add something to the island, write it as a step (or an extra, see extras.js) and add it here.
 *
 * Returns false when this seed's island has no room for a harbour; the caller then tries again.
 */
export function buildIsland(world, G) {
  world.reset();
  const ctx = new BuildContext(world, G);

  layOutLand(ctx);
  if (!carveCove(ctx) || !buildHarbour(ctx)) return false;
  layRoads(ctx);
  buildTown(ctx);
  layFields(ctx);
  growPlants(ctx);
  placeShore(ctx);
  moorBoats(ctx);

  chooseExtras(ctx);
  populateIsland(ctx);
  placeExtras(ctx);
  populateSky(ctx);
  return true;
}
