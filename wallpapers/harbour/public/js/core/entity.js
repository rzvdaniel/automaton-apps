/**
 * Everything in the scene is an Entity: it has its own state, and says how it moves, how it looks and how it reacts to a click.
 * A subclass overrides the pieces it needs.
 */
export class Entity {
  /** In which drawing passes it appears: { layer: methodName }. See LAYERS in engine/scene.js. */
  static passes = { upright: 'draw' };
  /** How it takes clicks: 'top' swallows the click, 'one' lets only the topmost such thing react, 'many' lets all react, null ignores them. */
  static clicks = null;
  /** The name of the sound made when it is clicked (see audio/sounds.js); or give the class a soundFor(x, y) method. */
  static sound = null;
  /** How far from its x, y it can draw, in world units (times its scale). It is not drawn when all of that is off screen; something with no x, y is always drawn. */
  static cullRadius = 0.15;
  /** True for a class that applies its own `scale` (it has several anchor points, or it needs a wake). */
  static ownScale = false;

  /** @param {import('../engine/world.js').World} world what the entity lives in */
  constructor(world) { this.world = world; this.dead = false; this.scale = 1; }
  update(dt) {}
  /** Is the point (x, y), in world units, on this entity? */
  hit(x, y) { return false; }
  click(x, y) {}
}
