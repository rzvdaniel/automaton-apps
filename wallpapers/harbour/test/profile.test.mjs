import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Profiler } from '../public/js/engine/profiler.js';
import { Camera } from '../public/js/engine/camera.js';
import { Viewport } from '../public/js/engine/viewport.js';
import { Lighting } from '../public/js/engine/lighting.js';

test('Profiler: off without ?profile, and it only runs the pass', () => {
  for (const query of ['', '?debug', '?profiler']) {
    const p = new Profiler({ query, now: () => { throw new Error('the clock must not be read'); } });
    assert.equal(p.on, false); assert.equal(p.time('x', () => 7), 7); p.endFrame();
  }
});

test('Profiler: ?profile, ?profile=nofilter,nolights and ?x&profile are read', () => {
  assert.equal(new Profiler({ query: '?profile' }).on, true);
  const p = new Profiler({ query: '?debug&profile=nofilter,nolights&all' });
  assert.ok(p.on && p.noFilter && p.noLights);
  const q = new Profiler({ query: '?profile=nolights' }); assert.ok(q.noLights && !q.noFilter);
});

test('Profiler: logs the average and the worst per pass once every 5 seconds, then starts again', () => {
  let t = 0; const lines = [], p = new Profiler({ query: '?profile', now: () => t, log: l => lines.push(l) });
  for (let i = 0; i < 11; i++) {
    p.time('lights', () => { t += i === 3 ? 8 : 2; });
    t += 498; p.endFrame();   // 500 ms a frame; the first frame starts the 5 s
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /11 frames/); assert.match(lines[0], /lights 2\.55ms \(max 8\.0\)/);
  p.time('lights', () => { t += 1; }); p.endFrame(); assert.equal(lines.length, 1);
});

test('Camera.applyTo: a canvas at half size gets half the transform, so the lights stay in place', () => {
  const v = new Viewport({ width: 1000, height: 600, dpr: 2 }), cam = new Camera(v), seen = [];
  const ctx = { setTransform: (...m) => seen.push(m) };
  cam.applyTo(ctx); cam.applyTo(ctx, 0.5);
  seen[0].forEach((n, i) => assert.ok(Math.abs(n * 0.5 - seen[1][i]) < 1e-9));
});

test('Lighting: the filter can be left off for ?profile=nofilter', () => {
  const style = {}, calls = [];
  globalThis.document.createElementNS = () => ({ setAttribute() {}, appendChild() {}, style: {} });
  globalThis.document.body = { appendChild() {} };
  const l = new Lighting({ canvas: { style }, backdrop: { setLight: (...a) => calls.push(a) } });
  l.disabled = true; l.apply({ r: 0.5, g: 0.5, b: 0.6, grey: 0.2, offset: [-0.1, -0.1, -0.05], night: 1 });
  assert.equal(calls.length, 1, 'the backdrop still gets the light'); assert.ok(!style.filter);
});

test('World: the hour for the windows is read once a second, not per window per frame (an Intl formatter per call cost ~10 ms a frame at night)', async () => {
  const { World } = await import('../public/js/engine/world.js');
  const { House } = await import('../public/js/entities/house.js');
  const { quietly, recordingSound } = await import('./helpers.mjs');
  const world = quietly(() => new World({ width: 1500, height: 1000, sound: recordingSound() }));
  const house = world.add(new House(world, { x: 0.2, y: 0.2, a: 0, w: 0.03 }));
  world.day.darkness = 1;
  let reads = 0; const real = world.skyClock.minutes.bind(world.skyClock); world.skyClock.minutes = () => { reads++; return real(); };
  for (let f = 0; f < 100; f++) for (let n = 0; n < house.windows.length; n++) house.windowLight(n);
  assert.equal(reads, 0, 'windowLight does not ask the clock');
  world.update(1.5);
  assert.ok(world.hourNow >= 0 && world.hourNow < 24, `hour ${world.hourNow}`);
});
