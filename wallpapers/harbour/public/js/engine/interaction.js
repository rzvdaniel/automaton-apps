import { SHADE } from '../core/draw.js';

/**
 * What a tap or a hover does to the island: finds what was touched (topmost first), lets it react and make its sound,
 * and otherwise ripples the water or scatters dust. It works on screen positions and knows nothing about gestures.
 */
export class Interaction {
  /**
   * @param {{ scene, camera, terrain, effects, sound, onActivity?: () => void }} parts the world's services it needs
   */
  constructor({ scene, camera, terrain, effects, sound, onActivity = () => {} }) {
    Object.assign(this, { scene, camera, terrain, effects, sound, onActivity });
    this.pointer = { x: 0, y: 0, on: false, lx: 0, ly: 0 };   // where the pointer is, in world units, and whether it is over the island
  }

  /** A tap or click at a screen position. Returns true when something reacted. */
  tap(px, py) {
    this.onActivity(4000);
    const { scene, camera, terrain, effects, sound } = this, [x, y] = camera.toWorld(px, py);
    let hit = false, solid = false;
    for (const e of scene.clickables()) {
      const mode = e.constructor.clicks;
      let lx = x, ly = y;
      const sc = e.scale;
      if (sc !== 1 && !e.constructor.ownScale && e.x !== undefined) { lx = e.x + (x - e.x) / sc; ly = e.y + (y - e.y) / sc; }   // the pointer, in the thing's own unscaled frame
      try {
        if ((mode === 'one' && solid) || !e.hit(lx, ly)) continue;
        e.click(lx, ly); hit = true;
        const sound_ = e.soundFor ? e.soundFor(lx, ly) : e.constructor.sound;   // a thing may have a sound of its own (most are silent for now)
        if (sound_) sound.play(sound_, { entity: e, pan: camera.screenFraction(e.x) });
      } catch (err) { scene.fail(e, 'click', err); continue; }
      if (mode === 'top') return true;
      if (mode === 'one') solid = true;
    }
    if (terrain.field(x, y) > 0.005) {   // open water
      effects.ripple(x, y, 1); scene.scare(x, y, 0.2, true);   // rings and frightened fish, and no sound: a click on the sea stays quiet
    } else {
      scene.scare(x, y, 0.08, false);
      if (!hit) effects.burst(x, y, 6, 0.03, SHADE, 0.003, 0.5);
    }
    return hit;
  }

  /** The pointer moved: it leaves a faint wake behind it in the water. */
  hover(px, py) {
    const [x, y] = this.camera.toWorld(px, py), m = this.pointer;
    m.x = x; m.y = y; m.on = true;
    this.onActivity(1500);
    if (Math.hypot(m.x - m.lx, m.y - m.ly) > 0.09) {
      m.lx = m.x; m.ly = m.y;
      if (this.terrain.field(m.x, m.y) > 0.01) this.effects.ripple(m.x, m.y, 0.28);
    }
  }

  /** The pointer left the screen. */
  leave() { this.pointer.on = false; }
}
