/** Drawing passes, bottom to top. 'upright' is sorted by depth so nearer things overlap farther ones. */
export const LAYERS = ['deep', 'ground', 'roads', 'water', 'upright', 'air', 'effects', 'skyShadow', 'birds', 'clouds'];
/**
 * The night-lights pass: windows, lamps, lanterns, headlights, the lighthouse. It is not one of LAYERS: the renderer draws it
 * on its own canvas above the others, where the time of day's tint does not dim it, and only when it is dark.
 */
export const LIGHTS = 'lights';
/** Drawn on the lights canvas right after LIGHTS: clouds rub out the lights beneath them (see Cloud.drawShade). */
export const CLOUD_SHADE = 'cloudShade';

/**
 * The list of everything in the island. It updates and draws entities, and keeps one broken entity from stopping the rest:
 * a thing that throws is reported once and taken out of the scene.
 * With a Presence, it also leaves out whoever is not out at this hour (visible 0): they are not updated, drawn or clicked,
 * and those coming or going are drawn faded.
 */
export class Scene {
  /** @param {{ onError?: (line: string, error: Error) => void, presence?: import('./presence.js').Presence }} options */
  constructor({ onError = () => {}, presence = null } = {}) {
    this.entities = [];
    this.onError = onError;
    this.presence = presence;
    this.layerLists = null;   // built when first needed, dropped when the list of entities changes
  }

  add(entity) { this.entities.push(entity); this.#changed(); return entity; }
  clear() { this.entities = []; this.#changed(); }
  /** Every entity of a class (or a subclass). */
  all(Type) { return this.entities.filter(e => e instanceof Type); }
  count(Type) { return this.all(Type).length; }

  /** Tells every entity that something frightened the creatures near (x, y). Those with an onScare method decide what to do. */
  scare(x, y, reach, water) { this.entities.forEach(e => e.onScare?.(x, y, reach, water)); }

  update(dt) {
    this.presence?.update(this.entities);
    this.entities.forEach(e => { if (e.visible === 0) return; try { e.update(dt); } catch (err) { this.fail(e, 'update', err); } });
    if (this.entities.some(e => e.dead)) { this.entities = this.entities.filter(e => !e.dead); this.#changed(); }
  }

  /**
   * Draws every entity that appears in the named pass. Each draws in a clean state, so one that forgets to restore cannot spoil the rest.
   * `view` ({ minX, maxX, minY, maxY } in world units) skips what is wholly off screen, which matters most when zoomed in.
   */
  drawLayer(name, c, t, resetTransform = () => {}, view = null) {
    for (const [e, method] of this.#layer(name)) {
      if (e.dead || e.visible === 0 || (view && !Scene.inView(e, view))) continue;
      c.save();
      if (e.visible < 1) c.globalAlpha = e.visible;   // coming out or going home: fades in or out
      try {
        const sc = e.scale;
        if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { c.translate(e.x, e.y); c.scale(sc, sc); c.translate(-e.x, -e.y); }
        e[method](c, t);
      } catch (err) { this.fail(e, method, err); resetTransform(); c.globalAlpha = 1; }
      c.restore();
    }
  }

  /** Could any part of the entity be inside the view? Things with no position are always drawn. */
  static inView(e, view) {
    if (e.x === undefined) return true;
    const r = e.constructor.cullRadius * e.scale;
    return e.x + r >= view.minX && e.x - r <= view.maxX && e.y + r >= view.minY && e.y - r <= view.maxY;
  }

  /** The entities that take clicks, topmost first, each once. */
  * clickables() {
    const seen = new Set();
    for (let l = LAYERS.length - 1; l >= 0; l--) {
      const list = this.#layer(LAYERS[l]);
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i][0];
        if (!e.constructor.clicks || seen.has(e) || e.dead || e.visible === 0) continue;
        seen.add(e); yield e;
      }
    }
  }

  fail(entity, where, err) {
    entity.dead = true;
    this.onError(`${entity.constructor.name}.${where}: ${err?.message}`, err);
  }

  /** Entities came or went: the drawing lists and who-is-out are worked out again. */
  #changed() { this.layerLists = null; this.presence?.invalidate(); }

  #layer(name) {
    if (!this.layerLists) {
      this.layerLists = Object.fromEntries([...LAYERS, LIGHTS, CLOUD_SHADE].map(n => [n, []]));
      this.entities.forEach(e => { for (const [layer, method] of Object.entries(e.constructor.passes)) this.layerLists[layer].push([e, method]); });
    }
    if (name === 'upright') this.layerLists.upright.sort((p, q) => p[0].y - q[0].y);
    return this.layerLists[name];
  }
}
