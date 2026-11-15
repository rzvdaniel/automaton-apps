import test from 'node:test';
import assert from 'node:assert/strict';
import { TAU, clamp, lerp, angDiff, smin, rng, dense, distTo } from '../public/js/core/math.js';
import { Viewport } from '../public/js/engine/viewport.js';
import { Terrain } from '../public/js/engine/terrain.js';
import { Wind } from '../public/js/engine/wind.js';
import { Effects } from '../public/js/engine/effects.js';
import { QualityMonitor } from '../public/js/engine/quality-monitor.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} is not near ${b}`);

test('maths helpers', () => {
  assert.equal(clamp(5, 0, 1), 1); assert.equal(clamp(-5, 0, 1), 0); assert.equal(clamp(0.4, 0, 1), 0.4);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  near(angDiff(0.1, TAU - 0.1), 0.2);   // the short way round, across the wrap
  near(angDiff(TAU - 0.1, 0.1), -0.2);
  assert.ok(smin(1, 2, 0.5) <= 1, 'the smooth minimum is never above the smaller value');
});

test('the seeded random source repeats for a seed and differs between seeds', () => {
  const a = rng(5), b = rng(5), c = rng(6);
  const first = [a(), a(), a()], again = [b(), b(), b()];
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, [c(), c(), c()]);
  assert.ok(first.every(v => v >= 0 && v < 1));
});

test('dense() makes a smooth line through the corners; distTo() measures to it', () => {
  const corners = [[0, 0], [1, 0], [1, 1]], line = dense(corners);
  assert.ok(line.length > corners.length);
  assert.deepEqual(line[0], [0, 0]); assert.deepEqual(line.at(-1), [1, 1]);
  near(distTo([[0, 0], [10, 0]], 5, 3), 3);          // beside the middle of a segment
  near(distTo([[0, 0], [10, 0]], 13, 4), 5);         // beyond its end
  assert.deepEqual(dense([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
});

test('Viewport: a wide screen fits a 3:2 view, a tall one fits its width, and a turn is reported', () => {
  const wide = new Viewport({ width: 1500, height: 1000 });
  near(wide.scale, 1000); near(wide.hw, 0.75); near(wide.hh, 0.5);
  const v = new Viewport({ width: 390, height: 844 });
  near(v.scale, 390); near(v.hw, 0.5); assert.ok(v.hh > 1);
  assert.equal(v.resize(844, 390), true, 'portrait to landscape is a turn');
  assert.equal(v.resize(900, 400), false, 'a small resize is not');
});

test('Viewport lowers the shader resolution step by step, down to a floor', () => {
  const v = new Viewport({ width: 1500, height: 1000 }), before = v.glScale;
  assert.ok(v.lowerQuality()); assert.ok(v.glScale < before);
  while (v.lowerQuality());
  assert.ok(v.quality >= Viewport.MIN_QUALITY * 0.8);
  assert.equal(v.lowerQuality(), false);
});

test('Terrain: negative on land, positive at sea; gradients lead away from land; pushIn goes inland', () => {
  const t = new Terrain(); t.map.land.push([0, 0, 0.2]);
  assert.ok(t.field(0, 0) < 0); assert.ok(t.field(1, 0) > 0);
  const g = t.grad(0.4, 0); assert.ok(g.gx > 0.9, 'away from the island means to the right');
  const p = t.pushIn([0.19, 0], 0.05); assert.ok(t.field(p[0], p[1]) <= -0.05 + 1e-6);
  t.map.bay = [0.2, 0, 0.1]; assert.ok(t.field(0.2, 0) > 0, 'a cove is water');
  t.reset(); assert.equal(t.map.land.length, 0); assert.equal(t.map.bay, null);
});

test('Wind: sway follows the wind and stays small', () => {
  const wind = new Wind(); wind.setAngle(0);
  const [dx, dy] = wind.sway(0.1, 0.1, 3);
  assert.ok(dx > 0 && dx < 0.2); near(dy, 0);
});

test('Effects: ripples are capped, everything fades away', () => {
  const e = new Effects();
  for (let i = 0; i < 20; i++) e.ripple(0, 0, 1);
  assert.equal(e.ripples.length, Effects.MAX_RIPPLES);
  e.burst(0, 0, 10, 0.1, '255,255,255', 0.01, 0.5); e.ring(0, 0, 0);
  assert.equal(e.particles.length, 10); assert.equal(e.rings.length, 1);
  for (let i = 0; i < 100; i++) e.update(0.05);
  assert.equal(e.ripples.length + e.particles.length + e.rings.length, 0);
});

// feeds `seconds` of frames at one gap and one work time; returns the steps the monitor asked for
const feed = (m, seconds, gap, work) => { const out = []; for (let t = 0; t < seconds * 1000; t += gap) { const r = m.sample(work, gap); if (r) out.push(r); } return out; };

test('QualityMonitor: a throttled but fast computer never loses quality', () => {
  const m = new QualityMonitor();
  assert.deepEqual(feed(m, 120, 66, 4).filter(r => r < 0), [], '15 fps cap, short draws');
  assert.deepEqual(feed(m, 120, 33, 6).filter(r => r < 0), [], '30 fps cap');
  m.sample(3, 5000); m.sample(3, 60000); // pauses are ignored
  assert.deepEqual(feed(m, 60, 800, 5), [], 'long gaps but short work');
});

test('QualityMonitor: steadily slow work lowers quality after a few seconds, not before', () => {
  const m = new QualityMonitor();
  assert.deepEqual(feed(m, 7, 50, 40), [], 'under two windows');
  assert.deepEqual(feed(m, 3, 50, 40), [-1]);
});

test('QualityMonitor: a short slow burst, a single long frame and the frames after a reset do not count', () => {
  const m = new QualityMonitor();
  assert.deepEqual(feed(m, 1, 50, 40).concat(feed(m, 30, 33, 5)).filter(r => r < 0), [], 'a burst');
  const n = new QualityMonitor();
  for (let i = 0; i < 400; i++) { assert.equal(n.sample(i % 50 === 0 ? 900 : 5, i % 50 === 0 ? 900 : 33), 0); }
  const r = new QualityMonitor();
  feed(r, 7, 50, 40); r.reset();
  assert.deepEqual(feed(r, 3, 50, 40), [], 'the streak starts again after the page was shown');
  r.reset(); assert.deepEqual(Array.from({ length: 9 }, () => r.sample(90, 50)), Array(9).fill(0), 'the first frames after showing are skipped');
});

test('QualityMonitor: a longer fast stretch raises quality, and flapping backs off', () => {
  const m = new QualityMonitor();
  assert.deepEqual(feed(m, 10, 50, 40), [-1]);
  assert.deepEqual(feed(m, 15, 33, 5), [], 'not yet');
  assert.deepEqual(feed(m, 10, 33, 5), [1]);
  assert.deepEqual(feed(m, 10, 50, 40), [-1], 'slow again');
  assert.deepEqual(feed(m, 30, 33, 5), [], 'twice the wait now');
  assert.deepEqual(feed(m, 15, 33, 5), [1]);
});

test('Viewport: quality steps down to the floor and back up to 1', () => {
  const v = new Viewport({ width: 800, height: 600, dpr: 1 });
  assert.equal(v.raiseQuality(), false);
  while (v.lowerQuality());
  assert.ok(v.quality >= 0.4 && v.quality < 0.6);
  while (v.raiseQuality());
  assert.equal(v.quality, 1);
});
