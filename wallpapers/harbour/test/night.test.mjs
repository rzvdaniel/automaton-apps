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
const FIXED_DAY = Date.UTC(2026, 10, 14, 12);
function islandAt(darkness, seed = 7) {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000, debug: false, everything: true, sound: recordingSound() }); w.skyClock.realNow = () => FIXED_DAY; w.generate(seed); return w; });
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
  assert.equal(Entity.presence.day, 1); assert.equal(Entity.presence.night, 1);
  for (const Type of [E.House, E.Person]) assert.equal(Type.active, undefined, 'the old statics are gone');
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

test('Presence: day-only things are out at noon and gone at midnight', () => {
  for (const order of [0, 0.5, 0.99]) {
    assert.equal(Presence.visibility(order, true, false, NOON), 1); assert.equal(Presence.visibility(order, true, false, MIDNIGHT), 0);
    assert.equal(Presence.visibility(order, false, true, NOON), 0); assert.equal(Presence.visibility(order, false, true, MIDNIGHT), 1);
    assert.equal(Presence.visibility(order, true, true, MIDNIGHT), 1);
  }
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

/** The windows of the island lit (drawn) when it is dark and the clock says `hour`. */
function litAt(world, hour, darkness = 1) {
  world.day.darkness = darkness; world.skyClock.minutes = () => hour * 60;
  let lit = 0, all = 0;
  for (const h of world.all(E.House)) for (let n = 0; n < h.windows.length; n++, all++) if (h.windowLight(n) > 0.5) lit++;
  return { lit, all };
}

test('lights: windows go out as the night goes on, by the clock: half at 21:00, a quarter at 23:00, one or two from 01:00 to 05:00', () => {
  for (const seed of [3, 7, 11]) {
    const world = islandAt(MIDNIGHT, seed), at = h => litAt(world, h);
    const { all } = at(21);
    assert.ok(all >= 20, `seed ${seed}: enough windows (${all})`);
    const f = h => at(h).lit / all;
    assert.ok(f(21) > 0.35 && f(21) < 0.65, `seed ${seed}: about half at 21:00 (${f(21)})`);
    assert.ok(f(23) > 0.15 && f(23) < 0.35, `seed ${seed}: about a quarter at 23:00 (${f(23)})`);
    assert.ok(f(21) > f(22) && f(22) > f(23) && f(23) > f(24), `seed ${seed}: fewer and fewer`);
    for (const h of [1.5, 2, 3, 4, 4.5]) assert.ok(at(h).lit >= 1 && at(h).lit <= 2, `seed ${seed}: one or two lit at ${h}:00 (${at(h).lit})`);
    assert.equal(at(12).lit, 0, `seed ${seed}: none at noon even in the dark`);
    assert.ok(at(6).lit <= Math.ceil(all * 0.15), `seed ${seed}: a few again at 06:00 (${at(6).lit})`);
    assert.equal(at(8).lit, 0, `seed ${seed}: none in the morning`);
  }
});

test('lights: by day no window is drawn, whatever the clock says', () => {
  const world = islandAt(NOON); world.skyClock.minutes = () => 22 * 60;
  const c = recordingContext(); world.scene.drawLayer(LIGHTS, c, 0);
  for (const h of world.all(E.House)) { const k = recordingContext(); h.drawLights(k); assert.deepEqual(k.calls, [], 'no pane by day'); }
});

test('lights: not every window of a house is lit at once, and the same island lights the same way twice', () => {
  const a = islandAt(MIDNIGHT, 7), b = islandAt(MIDNIGHT, 7);
  litAt(a, 22); litAt(b, 22);
  const row = w => w.all(E.House).map(h => h.windows.map((_, n) => h.windowLight(n).toFixed(3)).join());
  assert.deepEqual(row(a), row(b), 'seeded: stable across reloads');
  assert.ok(a.all(E.House).some(h => new Set(h.windows.map((_, n) => h.windowLight(n) > 0.5)).size === 2), 'a house with some windows lit and some dark');
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

test('houses: a lit window is a flat pane: no halo, no glow on the ground, not additive', () => {
  const world = islandAt(MIDNIGHT); litAt(world, 21);
  const house = world.all(E.House).find(h => h.windows.some((_, n) => h.windowLight(n) > 0.5));
  const c = recordingContext(); const ops = []; c.fillRect = () => ops.push('fillRect'); c.drawImage = () => ops.push('drawImage');
  house.drawLights(c);
  assert.ok(ops.includes('fillRect'), 'a pane is filled'); assert.ok(!ops.includes('drawImage'), 'no halo or glow picture');
  assert.equal(c.globalCompositeOperation, 'source-over', 'plain, not additive');
});

// ----- the night palette -----
import { FRAGMENT_SHADER } from '../public/js/engine/shader-source.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Backdrop } from '../public/js/engine/backdrop.js';

test('palettes: the shader mixes the day palette by u_phase.x and the blended rest divided by the light so they show as chosen', () => {
  assert.match(FRAGMENT_SHADER, /uniform vec4 u_phase;/);
  assert.match(FRAGMENT_SHADER, /uniform vec3 u_pal\[18\];/);
  ['dry', 'wet', 'grass', 'grass2', 'shallow', 'mid', 'deep', 'glow', 'foam'].forEach((n, k) => {
    assert.ok(FRAGMENT_SHADER.includes(`g_${n} = u_pal[${k}] * u_phase.x + u_pal[${9 + k}] * nsc;`), n);
  });
  assert.ok(!/[cn]_(dry|wet|grass|shallow|mid|deep|glow|foam)/.test(FRAGMENT_SHADER), 'no colour constants left: they live in palettes.js');
  assert.match(FRAGMENT_SHADER, /nsc = 1\.0 \/ max\(u_light \* vec3\(1\.0\)/);
  assert.ok(!/(?<!vec3 )u_pal\[(1[89]|[2-9][0-9])\]/.test(FRAGMENT_SHADER), 'only 18 colours are uniforms: phones can have few');
});

test('night palette: Lighting hands the amount and the moonlight to the backdrop', () => {
  const backdrop = new Backdrop({ getContext: () => null });
  backdrop.setLight([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 0.7, 0.4);
  assert.deepEqual([...backdrop.night].map(v => +v.toFixed(2)), [0.7, 0.4]);
});

test('night palette: dividing by the light and then applying it gives back the chosen colour (grey 0)', () => {
  const l = DayCycle.lightAt(-30, false, 0), k = [l.r, l.g, l.b], n = [0.62, 0.64, 0.74];
  const nsc = k.map(v => 1 / Math.max(v, 0.2));   // as the shader's nsc, moonlight 0
  n.forEach((v, i) => assert.ok(Math.abs(k[i] * v * nsc[i] - v) < 1e-12));
  const m = DayCycle.lightAt(-30, false, 1), km = [m.r, m.g, m.b];
  n.forEach((v, i) => assert.ok(Math.abs(km[i] * v * (1.15 / km[i]) - v * 1.15) < 1e-12, 'a full moon: 15% brighter on screen'));
});
