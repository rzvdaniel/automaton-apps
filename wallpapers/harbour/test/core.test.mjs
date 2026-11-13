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

test('QualityMonitor: two slow stretches in a row lower quality; one does not', () => {
  const m = new QualityMonitor({ slowMs: 50, window: 10, strikes: 2 });
  const run = gap => { let lower = false; for (let i = 0; i < 10; i++) lower = m.sample(gap) || lower; return lower; };
  assert.equal(run(80), false, 'one slow stretch');
  assert.equal(run(80), true, 'two in a row');
  assert.equal(run(80), false, 'the count starts again');
  run(80); assert.equal(run(16), false, 'a fast stretch clears it');
  assert.equal(run(80), false);
  assert.equal(m.sample(0), false, 'a gap of 0 (a pause) is ignored');
});
