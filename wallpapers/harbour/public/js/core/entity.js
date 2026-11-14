const NOON = { x: 0, y: -1, strength: 1 };   // the shadow for a world without a day (a bare test world)

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
  /**
   * Where this thing's shadow falls, from the sun (world.day.shadow). `lift` is how far the shadow would lie from it with the
   * sun at the height the pictures were drawn for (bigger for taller things and things up in the air).
   * Returns { x, y } (the step from the thing to its shadow, in world units) and `a`, the shadow's strength (0..1, multiply opacity by it).
   * Drawing inside a turned frame (after c.rotate(turn))? Pass the same `turn` and the step comes back in that frame.
   */
  castShadow(lift, turn = 0) {
    const s = this.world?.day?.shadow ?? NOON, cos = Math.cos(turn), sin = Math.sin(turn);
    return { x: (s.x * cos + s.y * sin) * lift, y: (s.y * cos - s.x * sin) * lift, a: s.strength };
  }
  update(dt) {}
  /** Is the point (x, y), in world units, on this entity? */
  hit(x, y) { return false; }
  click(x, y) {}
}
