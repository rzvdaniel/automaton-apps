import { Entity } from '../core/entity.js';

/**
 * How big each kind of thing is drawn: 1 is as designed. Change a number to resize every one of that kind
 * (any class name from entities/). Not for Cloud, Roads, Quay, Fields, Heather or DuneGrass: they have no single position to scale about.
 */
export const SCALES = { Fisherman: 1, Currach: 1, Sailboat: 1 };

/** The size set for an entity's class, or for the nearest class it extends that has one; 1 when none does. */
export function scaleFor(entity) {
  for (let type = entity.constructor; type && type !== Entity; type = Object.getPrototypeOf(type)) {
    if (Object.hasOwn(SCALES, type.name)) return SCALES[type.name];
  }
  return 1;
}
