/** Drawing passes, bottom to top. 'upright' is sorted by depth so nearer things overlap farther ones. */
export const LAYERS = ['deep', 'ground', 'roads', 'water', 'upright', 'air', 'effects', 'skyShadow', 'birds', 'clouds'];

/**
 * The list of everything in the island. It updates and draws entities, and keeps one broken entity from stopping the rest:
 * a thing that throws is reported once and taken out of the scene.
 */
export class Scene {
  /** @param {{ onError?: (line: string, error: Error) => void }} options */
  constructor({ onError = () => {} } = {}) {
    this.entities = [];
    this.onError = onError;
    this.layerLists = null;   // built when first needed, dropped when the list of entities changes
  }

  add(entity) { this.entities.push(entity); this.layerLists = null; return entity; }
  clear() { this.entities = []; this.layerLists = null; }
  /** Every entity of a class (or a subclass). */
  all(Type) { return this.entities.filter(e => e instanceof Type); }
  count(Type) { return this.all(Type).length; }

  /** Tells every entity that something frightened the creatures near (x, y). Those with an onScare method decide what to do. */
  scare(x, y, reach, water) { this.entities.forEach(e => e.onScare?.(x, y, reach, water)); }

  update(dt) {
    this.entities.forEach(e => { try { e.update(dt); } catch (err) { this.fail(e, 'update', err); } });
    if (this.entities.some(e => e.dead)) { this.entities = this.entities.filter(e => !e.dead); this.layerLists = null; }
  }

  /** Draws every entity that appears in the named pass. Each draws in a clean state, so one that forgets to restore cannot spoil the rest. */
  drawLayer(name, c, t, resetTransform = () => {}) {
    for (const [e, method] of this.#layer(name)) {
      if (e.dead) continue;
      c.save();
      try {
        const sc = e.scale;
        if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { c.translate(e.x, e.y); c.scale(sc, sc); c.translate(-e.x, -e.y); }
        e[method](c, t);
      } catch (err) { this.fail(e, method, err); resetTransform(); c.globalAlpha = 1; }
      c.restore();
    }
  }

  /** The entities that take clicks, topmost first, each once. */
  * clickables() {
    const seen = new Set();
    for (let l = LAYERS.length - 1; l >= 0; l--) {
      const list = this.#layer(LAYERS[l]);
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i][0];
        if (!e.constructor.clicks || seen.has(e) || e.dead) continue;
        seen.add(e); yield e;
      }
    }
  }

  fail(entity, where, err) {
    entity.dead = true;
    this.onError(`${entity.constructor.name}.${where}: ${err?.message}`, err);
  }

  #layer(name) {
    if (!this.layerLists) {
      this.layerLists = Object.fromEntries(LAYERS.map(n => [n, []]));
      this.entities.forEach(e => { for (const [layer, method] of Object.entries(e.constructor.passes)) this.layerLists[layer].push([e, method]); });
    }
    if (name === 'upright') this.layerLists.upright.sort((p, q) => p[0].y - q[0].y);
    return this.layerLists[name];
  }
}
