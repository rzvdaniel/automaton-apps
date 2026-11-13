import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../public/js/core/entity.js';
import { World } from '../public/js/engine/world.js';
import { Scene, LAYERS } from '../public/js/engine/scene.js';
import * as entities from '../public/js/entities/index.js';
import { SOUNDS } from '../public/js/audio/sounds.js';
import { fakeContext, recordingSound, quietly } from './helpers.mjs';

class Thing extends Entity {
  static clicks = 'many';
  constructor(world, x, y, r = 0.05) { super(world); this.x = x; this.y = y; this.r = r; this.clicked = 0; this.drawn = 0; }
  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.r; }
  click() { this.clicked++; }
  draw() { this.drawn++; }
}
const pixel = (world, x, y) => [750 + x * world.viewport.scale, 500 + y * world.viewport.scale];   // world units to screen pixels at zoom 1

// ----- the scene -----
test('a thing that throws is reported once and removed; the rest carries on', () => {
  const errors = [], scene = new Scene({ onError: line => errors.push(line) });
  class Bad extends Thing { update() { throw new Error('boom'); } }
  const good = scene.add(new Thing(null, 0, 0)); scene.add(new Bad(null, 1, 1));
  scene.update(0.1); scene.update(0.1);
  assert.equal(scene.entities.length, 1); assert.equal(scene.entities[0], good);
  assert.equal(errors.length, 1); assert.match(errors[0], /Bad\.update: boom/);
});

test('a drawing error is isolated too, and the context is left clean', () => {
  const errors = [], scene = new Scene({ onError: l => errors.push(l) }), calls = [];
  class BadDraw extends Thing { draw() { throw new Error('nope'); } }
  scene.add(new BadDraw(null, 0, 0)); const ok = scene.add(new Thing(null, 0, 0));
  const c = { save: () => calls.push('save'), restore: () => calls.push('restore'), translate() {}, scale() {} };
  scene.drawLayer('upright', c, 0);
  assert.equal(errors.length, 1); assert.equal(ok.drawn, 1);
  assert.equal(calls.filter(x => x === 'save').length, calls.filter(x => x === 'restore').length, 'every save has its restore');
});

test('entities are drawn in the passes they ask for, and upright ones nearer the viewer last', () => {
  const scene = new Scene();
  class Low extends Thing { static passes = { deep: 'draw' }; }
  const front = scene.add(new Thing(null, 0, 0.3)), back = scene.add(new Thing(null, 0, -0.3)), under = scene.add(new Low(null, 0, 0));
  const order = []; front.draw = () => order.push('front'); back.draw = () => order.push('back'); under.draw = () => order.push('under');
  const c = fakeContext(); for (const layer of LAYERS) scene.drawLayer(layer, c, 0);
  assert.deepEqual(order, ['under', 'back', 'front']);
});

test('all() and count() find a class and its subclasses', () => {
  const scene = new Scene(); class Sub extends Thing {}
  scene.add(new Thing(null, 0, 0)); scene.add(new Sub(null, 0, 0));
  assert.equal(scene.count(Thing), 2); assert.equal(scene.count(Sub), 1);
});

// ----- clicks -----
function island() {
  const sound = recordingSound(), world = new World({ width: 1500, height: 1000, sound, debug: false });
  world.terrain.map.land.push([5, 5, 0.1]);   // all the visible world is open water unless a test says otherwise
  return { world, sound };
}

test('tapping an entity reacts and plays its sound; tapping water ripples and splashes', () => {
  const { world, sound } = island();
  class Voiced extends Thing { static sound = 'sheep'; }
  const thing = world.add(new Voiced(world, 0, 0));
  world.interaction.tap(...pixel(world, 0, 0));
  assert.equal(thing.clicked, 1); assert.equal(sound.played[0], 'sheep', 'its own sound first');
  sound.played.length = 0; world.effects.clear();
  world.interaction.tap(...pixel(world, 0.3, 0.3));
  assert.equal(world.effects.ripples.length, 1); assert.deepEqual(sound.played, ['splash']);
});

test("a soundFor() method chooses the sound for this click", () => {
  const { world, sound } = island();
  class Two extends Thing { soundFor(x) { return x < this.x ? 'yay' : 'flutter'; } }
  world.add(new Two(world, 0, 0));
  world.interaction.tap(...pixel(world, -0.02, 0)); world.interaction.tap(...pixel(world, 0.02, 0));
  assert.deepEqual(sound.played.filter(n => n !== 'splash'), ['yay', 'flutter']);   // (open water splashes too)
});

test("click modes: 'top' swallows the click, 'one' lets only the topmost react, 'many' all of them", () => {
  const { world } = island();
  class One extends Thing { static clicks = 'one'; } class Top extends Thing { static clicks = 'top'; static passes = { clouds: 'draw' }; }
  const a = world.add(new One(world, 0, 0)), b = world.add(new One(world, 0, 0.001)), many1 = world.add(new Thing(world, 0, 0)), many2 = world.add(new Thing(world, 0, 0));
  world.interaction.tap(...pixel(world, 0, 0));
  assert.equal(a.clicked + b.clicked, 1, "only one of the 'one' things reacted");
  assert.equal(many1.clicked + many2.clicked, 2, "both 'many' things reacted");
  const top = world.add(new Top(world, 0, 0)); a.clicked = b.clicked = many1.clicked = many2.clicked = 0;
  world.interaction.tap(...pixel(world, 0, 0));
  assert.equal(top.clicked, 1); assert.equal(a.clicked + b.clicked + many1.clicked + many2.clicked, 0, 'nothing below a top thing reacts');
});

test('a scaled entity is hit where it is drawn, not where it was designed', () => {
  const { world } = island();
  const thing = world.add(new Thing(world, 0, 0, 0.05)); thing.scale = 2;
  world.interaction.tap(...pixel(world, 0.08, 0));   // outside 0.05, inside 0.1
  assert.equal(thing.clicked, 1);
});

test('an entity that throws when clicked is removed and does not break the tap', () => {
  const { world } = island();
  class Bad extends Thing { click() { throw new Error('x'); } }
  world.add(new Bad(world, 0, 0)); const good = world.add(new Thing(world, 0, 0));
  quietly(() => world.interaction.tap(...pixel(world, 0, 0)));
  assert.equal(good.clicked, 1); assert.equal(world.errors.length, 1);
});

test('hover leaves a faint wake in the water, only after moving a good way', () => {
  const { world } = island();
  world.interaction.hover(...pixel(world, 0, 0)); world.interaction.hover(...pixel(world, 0.01, 0));
  assert.equal(world.effects.ripples.length, 0);
  world.interaction.hover(...pixel(world, 0.3, 0));
  assert.equal(world.effects.ripples.length, 1); assert.equal(world.mouse.on, true);
  world.interaction.leave(); assert.equal(world.mouse.on, false);
});

// ----- every clickable class makes a sound that exists -----
test('every clickable entity class names a sound that exists', () => {
  for (const [name, Type] of Object.entries(entities)) {
    if (typeof Type !== 'function' || !(Type.prototype instanceof Entity) || !Type.clicks) continue;
    if (Type.prototype.soundFor) continue;
    assert.ok(Type.sound, `${name} takes clicks but names no sound`);
    assert.ok(Object.hasOwn(SOUNDS, Type.sound), `${name} names the sound "${Type.sound}" which does not exist`);
  }
});

test('every drawing pass an entity names is a real layer with a real method', () => {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000, debug: true }); w.generate(7); return w; });
  for (const e of world.scene.entities) {
    for (const [layer, method] of Object.entries(e.constructor.passes)) {
      assert.ok(LAYERS.includes(layer), `${e.constructor.name} draws in "${layer}", which is not a layer`);
      assert.equal(typeof e[method], 'function', `${e.constructor.name}.${method} is missing`);
    }
  }
});
