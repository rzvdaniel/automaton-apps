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

/** A built island at a darkness (headless; the time of day is set by hand, not from the clock). */
// Every island test runs on the same fixed day, never the real date, so who is out is the same on every run.
// On this day the fox is not one of its rare daytime walks (see Presence).
const FIXED_DAY = Date.UTC(2026, 10, 14, 12);
function islandAt(darkness, seed = 7) {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000, debug: true, sound: recordingSound() }); w.skyClock.realNow = () => FIXED_DAY; w.generate(seed); return w; });
  world.day.darkness = darkness; world.presence.update(world.scene.entities);
  return world;
}

class Thing extends Entity { constructor() { super(null); this.x = 0; this.y = 0; this.updated = 0; this.drawn = 0; } update() { this.updated++; } draw() { this.drawn++; } }

// ----- Presence -----
const DATES = Array.from({ length: 20 }, (_, i) => `2026-11-${i + 1}`);

/** A scene with a Presence whose darkness and date the test sets by hand. */
function sceneOn(date = '2026-11-14') {
  const day = { darkness: NOON }, dates = { day: date, night: date };
  const scene = new Scene({ presence: new Presence({ day, dates: () => dates }) });
  return { day, scene, at(d) { day.darkness = d; scene.update(0); }, on(date) { dates.day = dates.night = date; } };
}

test('Presence: every class declares its share by day and by night, as the issue sets them', () => {
  const expect = (Type, day, night, keep) => { assert.equal(Type.presence.day, day, Type.name); assert.equal(Type.presence.night, night, Type.name); if (keep !== undefined) assert.equal(Type.presence.keep, keep, Type.name); };
  for (const Type of [E.House, E.Lighthouse, E.Car, E.Cat, E.MooredBoat, E.Cow]) expect(Type, 1, 1);
  expect(E.Person, 1, 0.1, 1); expect(E.Walker, 1, 0.1, 1);
  expect(E.Biplane, 1, 0.5); expect(E.Balloon, 1, 0.3); expect(E.Gull, 1, 0.15); expect(E.GullFlock, 1, 0.15);
  for (const Type of [E.Kite, E.Parasol, E.Puffin]) expect(Type, 1, 0);
  expect(E.Fox, 0.05, 1);
  assert.equal(Entity.presence.day, 1); assert.equal(Entity.presence.night, 1);
  for (const Type of [E.House, E.Person, E.Fox]) assert.equal(Type.active, undefined, 'the old statics are gone');
});

test('Presence: at night about one person in ten is out, and at least one', () => {
  for (const n of [1, 4, 25, 60]) {
    for (const date of DATES.slice(0, 5)) {
      const { scene, at, on } = sceneOn(); on(date);
      class Islander extends Thing { static presence = { day: 1, night: 0.1, keep: 1 }; }
      const people = Array.from({ length: n }, () => scene.add(new Islander()));
      at(NOON); assert.equal(people.filter(p => p.visible === 1).length, n, 'all out by day');
      at(MIDNIGHT);
      const out = people.filter(p => p.visible > 0).length;
      assert.ok(out >= 1, `${n} people: at least one stays`);
      assert.ok(out <= Math.max(1, Math.ceil(n * 0.1)) && out >= Math.min(n, Math.max(1, Math.floor(n * 0.1))), `${n} people: about a tenth (${out})`);
    }
  }
});

test('Presence: a single plane is out on some nights and not others, about half, the same each time for the same night', () => {
  class Plane extends Thing { static presence = { day: 1, night: 0.5 }; }
  const outOn = date => { const { scene, at, on } = sceneOn(); on(date); const p = scene.add(new Plane()); at(MIDNIGHT); return p.visible; };
  const nights = DATES.map(outOn);
  assert.ok(nights.every(v => v === 0 || v === 1));
  const out = nights.filter(v => v === 1).length;
  assert.ok(out >= 5 && out <= 15, `out on ${out} of 20 nights`);
  assert.deepEqual(DATES.map(outOn), nights, 'the same night gives the same answer (after a reload too)');
});

test('Presence: nothing changes within one night', () => {
  const { scene, at } = sceneOn();
  class Plane extends Thing { static presence = { day: 1, night: 0.5 }; }
  class Gull extends Thing { static presence = { day: 1, night: 0.15 }; }
  const all = [...Array.from({ length: 6 }, () => scene.add(new Plane())), ...Array.from({ length: 30 }, () => scene.add(new Gull()))];
  at(0.95); const first = all.map(e => e.visible);
  for (let i = 0; i < 50; i++) { at(0.95 + (i % 5) * 0.01); scene.update(0.1); }
  at(0.95); assert.deepEqual(all.map(e => e.visible), first);
});

test('Presence: day-only things are out at noon and gone at midnight; the fox the other way round, and rarely by day', () => {
  for (const order of [0, 0.5, 0.99]) {
    assert.equal(Presence.visibility(order, true, false, NOON), 1); assert.equal(Presence.visibility(order, true, false, MIDNIGHT), 0);
    assert.equal(Presence.visibility(order, false, true, NOON), 0); assert.equal(Presence.visibility(order, false, true, MIDNIGHT), 1);
    assert.equal(Presence.visibility(order, true, true, MIDNIGHT), 1);
  }
  const days = Array.from({ length: 400 }, (_, i) => `d${i}`).filter(date => {
    const { scene, at, on } = sceneOn(); on(date); const fox = scene.add(new (class Fox extends Thing { static presence = E.Fox.presence; })()); at(NOON); return fox.visible > 0;
  }).length;
  assert.ok(days >= 4 && days <= 45, `the fox is about by day on ${days} of 400 days`);
});

test('Presence: over dusk they leave one by one, and none comes back while it gets darker', () => {
  const { scene, at } = sceneOn();
  class Bird extends Thing { static presence = { day: 1, night: 0.25 }; }
  const birds = Array.from({ length: 16 }, () => scene.add(new Bird()));
  const last = birds.map(() => 1), leftAt = birds.map(() => null);
  for (let d = 0; d <= 1.0001; d += 0.01) {
    at(d);
    birds.forEach((b, i) => {
      assert.ok(b.visible <= last[i] + 1e-9, 'fading only goes one way at dusk');
      if (leftAt[i] === null && b.visible < 0.5) leftAt[i] = d;
      last[i] = b.visible;
    });
  }
  assert.equal(last.filter(v => v === 1).length, 4, 'a quarter stay out');
  assert.ok(last.every(v => v === 0 || v === 1), 'the rest are gone at full night');
  const left = leftAt.filter(d => d !== null);
  assert.ok(new Set(left.map(d => d.toFixed(2))).size >= 9, `they leave at different moments: ${left.map(d => d.toFixed(2))}`);
});

test('Scene: things that are not out are not updated, drawn or clicked', () => {
  const { scene, at } = sceneOn();
  class Bird extends Thing { static presence = { day: 1, night: 0 }; static clicks = 'many'; }
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

test('the lighthouse beam shines only out to sea: none towards the island, full straight out', () => {
  for (const seed of [3, 7, 11, 27]) {
    const house = islandAt(MIDNIGHT, seed).all(E.Lighthouse)[0];
    const inland = Math.atan2(-house.y, -house.x);   // towards the island's middle
    assert.equal(house.beamStrength(inland), 0, `seed ${seed}: dark towards the land`);
    assert.ok(house.beamStrength(house.seaward) > 0.99, `seed ${seed}: full out to sea`);
    assert.ok(house.beamStrength(house.seaward + 1.2) > 0, `seed ${seed}: still shining partway round`);
    // drawn: at a moment when the sweep points inland, no beam
    const c = recordingContext(); house.drawLights(c, ((inland % (2 * Math.PI)) + 2 * Math.PI) / 0.35);
    assert.ok(!c.calls.includes('fill'), `seed ${seed}: no beam drawn over the village`);
  }
});

// ----- the fox -----
test('the fox: on every island, out at night; a click makes it jump and yip', () => {
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

// ----- lights of things that fly at night -----
const drawnCalls = (e, t = 0) => { const c = recordingContext(); e.drawLights(c, t); return c.calls.length; };

test('the biplane: red and green wingtip lights and a blinking white strobe, only when dark', () => {
  const world = islandAt(MIDNIGHT), plane = world.all(E.Biplane)[0] ?? world.add(new E.Biplane(world, { x: 0, y: 0 }));
  plane.visible = 1;
  const counts = Array.from({ length: 40 }, (_, i) => drawnCalls(plane, i * 0.05));
  assert.ok(counts.every(n => n >= 4), 'both wingtip lights always on at night');
  assert.ok(Math.max(...counts) > Math.min(...counts), 'the strobe blinks');
  world.day.darkness = NOON; assert.equal(drawnCalls(plane), 0, 'nothing by day');
});

test('the balloon: a warm burner glow only when dark, brighter while the burner roars', () => {
  const world = islandAt(MIDNIGHT), balloon = world.add(new E.Balloon(world, { x: 0, y: 0 }));
  balloon.visible = 1;
  const alpha = () => { const c = recordingContext(); let a = 0; c.drawImage = () => { a = Math.max(a, c.globalAlpha); }; balloon.drawLights(c); return a; };
  const idle = alpha(); assert.ok(idle > 0, 'it glows at night');
  balloon.burn = 1; world.clock = 0.04; assert.ok(alpha() > idle, 'brighter with the burner on');
  world.day.darkness = NOON; assert.equal(drawnCalls(balloon), 0, 'nothing by day');
});

test('houses: a warm halo round each lit house that grows as more of its windows come on', () => {
  const world = islandAt(MIDNIGHT), house = world.all(E.House).find(h => h.lightsAt < 1);
  const haloAlpha = d => { world.day.darkness = d; const c = recordingContext(); const alphas = []; c.drawImage = () => alphas.push(c.globalAlpha); house.drawLights(c); return alphas.length ? alphas[alphas.length - 2] : 0; };
  const steps = [house.lightsAt + 0.05, house.lightsAt + 0.11, house.lightsAt + 0.17, house.lightsAt + 0.3, 1].map(haloAlpha);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1], `the halo only grows: ${steps}`);
  assert.ok(steps[4] > steps[0] * 1.5, 'much brighter with every window lit');
  assert.equal(haloAlpha(0), 0, 'no halo by day');
});
