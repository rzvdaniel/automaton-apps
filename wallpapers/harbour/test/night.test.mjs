import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../public/js/core/entity.js';
import { World } from '../public/js/engine/world.js';
import { Scene, LIGHTS } from '../public/js/engine/scene.js';
import { Presence } from '../public/js/engine/presence.js';
import * as E from '../public/js/entities/index.js';
import { fakeContext, recordingSound, quietly } from './helpers.mjs';

const NOON = 0, MIDNIGHT = 1;

/** A drawing context that draws nothing and remembers which drawing calls were made. */
function recordingContext() {
  const calls = [], gradient = { addColorStop() {} };
  const own = { calls, createLinearGradient: () => gradient, createRadialGradient: () => gradient, measureText: () => ({ width: 0 }) };
  const drawing = new Set(['fill', 'stroke', 'fillRect', 'drawImage']);
  return new Proxy(own, {
    get: (t, key) => (key in t ? t[key] : (...args) => { if (drawing.has(key)) calls.push(key); }),
    set: (t, key, value) => { t[key] = value; return true; }
  });
}

/** A scene with a Presence whose darkness the test sets by hand. */
function sceneAt() {
  const day = { darkness: NOON }, scene = new Scene({ presence: new Presence({ day }) });
  return { day, scene, at(d) { day.darkness = d; scene.update(0); } };
}

/** A built island at a darkness (headless; the time of day is set by hand, not from the clock). */
function islandAt(darkness, seed = 7) {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000, debug: true, sound: recordingSound() }); w.generate(seed); return w; });
  world.day.darkness = darkness; world.presence.update(world.scene.entities);
  return world;
}

class Thing extends Entity { constructor() { super(null); this.x = 0; this.y = 0; this.updated = 0; this.drawn = 0; } update() { this.updated++; } draw() { this.drawn++; } }

// ----- Presence -----
test('Presence: day-only things are out at noon and gone at midnight; night-only things the other way round', () => {
  for (const order of [0, 0.5, 0.99]) {
    const at = (Type, d) => Presence.visibility(Type, order, false, d);
    assert.equal(at(E.Balloon, NOON), 1); assert.equal(at(E.Balloon, MIDNIGHT), 0);
    assert.equal(at(E.Fox, NOON), 0); assert.equal(at(E.Fox, MIDNIGHT), 1);
    assert.equal(at(E.House, NOON), 1); assert.equal(at(E.House, MIDNIGHT), 1, 'houses are always there');
  }
});

test('Presence: every plainly daytime class is day-only, the fox night-only', () => {
  for (const Type of [E.Balloon, E.Biplane, E.Kite, E.Gull, E.GullFlock, E.Puffin, E.Parasol]) assert.equal(Type.active, 'day', Type.name);
  assert.equal(E.Fox.active, 'night');
  for (const Type of [E.House, E.Lighthouse, E.Car, E.Cat, E.MooredBoat]) assert.equal(Type.active, 'always', Type.name);
});

test('Presence: most people go home at night, but at least one stays', () => {
  for (const n of [1, 4, 25]) {
    const { scene, at } = sceneAt();
    class Islander extends Thing { static nightShare = 0.1; }
    const people = Array.from({ length: n }, () => scene.add(new Islander()));
    at(NOON); assert.equal(people.filter(p => p.visible === 1).length, n, 'all out by day');
    at(MIDNIGHT);
    const out = people.filter(p => p.visible > 0).length;
    assert.ok(out >= 1, `${n} people: at least one stays`); assert.ok(out <= Math.max(1, Math.round(n * 0.1)), `${n} people: most go home (${out} stayed)`);
  }
});

test('Presence: over dusk they leave one by one, and none comes back while it gets darker', () => {
  const { scene, at } = sceneAt();
  class Bird extends Thing { static active = 'day'; }
  const birds = Array.from({ length: 12 }, () => scene.add(new Bird()));
  const last = birds.map(() => 1), leftAt = birds.map(() => null);
  for (let d = 0; d <= 1.0001; d += 0.01) {
    at(d);
    birds.forEach((b, i) => {
      assert.ok(b.visible <= last[i] + 1e-9, 'fading only goes one way at dusk');
      if (leftAt[i] === null && b.visible < 0.5) leftAt[i] = d;
      last[i] = b.visible;
    });
  }
  assert.ok(last.every(v => v === 0), 'all gone at full night');
  assert.ok(new Set(leftAt.map(d => d.toFixed(2))).size >= 8, `they leave at different moments: ${leftAt.map(d => d.toFixed(2))}`);
});

test('Scene: things that are not out are not updated, drawn or clicked', () => {
  const { scene, at } = sceneAt();
  class Bird extends Thing { static active = 'day'; static clicks = 'many'; }
  const bird = scene.add(new Bird());
  at(MIDNIGHT); const updated = bird.updated;
  scene.update(0.1); scene.drawLayer('upright', fakeContext(), 0);
  assert.equal(bird.updated, updated); assert.equal(bird.drawn, 0); assert.deepEqual([...scene.clickables()], []);
  at(NOON); scene.drawLayer('upright', fakeContext(), 0);
  assert.equal(bird.drawn, 1); assert.deepEqual([...scene.clickables()], [bird]);
});

// ----- lights -----
test('lights: nothing is drawn by day; at night windows, lamps, lanterns and the lighthouse are', () => {
  const noon = islandAt(NOON), c = recordingContext();
  noon.scene.drawLayer(LIGHTS, c, 0);
  assert.deepEqual(c.calls, [], 'no light drawn at noon');

  const night = islandAt(MIDNIGHT), n = recordingContext();
  night.scene.drawLayer(LIGHTS, n, 0);
  assert.ok(n.calls.filter(k => k === 'drawImage').length > 40, `many lights at midnight (${n.calls.length})`);
});

test('lights: some house windows stay dark, the rest switch on one by one as dusk deepens', () => {
  const world = islandAt(MIDNIGHT), houses = world.all(E.House);
  assert.ok(houses.some(h => h.lightsAt < 1), 'some houses light up');
  const lit = d => { world.day.darkness = d; return houses.filter(h => { const c = recordingContext(); h.drawLights(c); return c.calls.length > 0; }).length; };
  assert.equal(lit(0), 0); assert.ok(lit(0.3) <= lit(0.5)); assert.ok(lit(0.5) <= lit(1));
  assert.equal(lit(1), houses.filter(h => h.lightsAt < 1).length);
});

test('the lighthouse: lantern and beam on at night, off at noon, off when clicked off', () => {
  const world = islandAt(MIDNIGHT), house = world.all(E.Lighthouse)[0];
  const drawn = () => { const c = recordingContext(); house.drawLights(c, 3); return c.calls; };
  assert.ok(drawn().includes('fill'), 'the beam is drawn at night'); assert.ok(drawn().includes('drawImage'), 'the lantern glows');
  world.day.darkness = NOON; assert.deepEqual(drawn(), [], 'nothing at noon');
  world.day.darkness = MIDNIGHT; house.click(); assert.deepEqual(drawn(), [], 'switched off');
});

// ----- the fox -----
test('the fox: on every island, out only at night; a click makes it jump and yip', () => {
  const day = islandAt(NOON), fox = day.all(E.Fox)[0];
  assert.ok(fox, 'there is a fox'); assert.equal(fox.visible, 0, 'gone by day');
  assert.ok(day.field(fox.x, fox.y) < 0, 'it lives on the land');

  const night = islandAt(MIDNIGHT), f = night.all(E.Fox)[0], sound = night.sound;
  assert.equal(f.visible, 1);
  const k = night.viewport.scale;
  night.interaction.tap(750 + f.x * k, 500 + f.y * k);
  assert.ok(f.jump > 0, 'it jumps'); assert.ok(sound.played.includes('yip'), 'and yips');
  for (let i = 0; i < 100; i++) f.update(0.05);
  f.draw(fakeContext(), 1);   // draws, with its moon shadow, without throwing
});
