import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../public/js/core/entity.js';
import { Scene } from '../public/js/engine/scene.js';
import { RepaintPolicy } from '../public/js/engine/repaint-policy.js';
import * as entities from '../public/js/entities/index.js';

// ----- the backdrop is repainted only when it needs to be -----
const frame = (over = {}) => ({ x: 0, y: 0, zoom: 1, time: 0, ...over });

test('the first frame is always painted, and so is one after the picture is invalidated', () => {
  const p = new RepaintPolicy(0.1);
  assert.equal(p.shouldPaint(frame()), true);
  assert.equal(p.shouldPaint(frame({ time: 0.01 })), false);
  p.invalidate();
  assert.equal(p.shouldPaint(frame({ time: 0.02 })), true);
});

test('while nothing moves it repaints about 15 times a second, whatever the frame rate', () => {
  for (const fps of [30, 60]) {
    const p = new RepaintPolicy(); let painted = 0;
    for (let i = 0; i < fps * 4; i++) if (p.shouldPaint(frame({ time: i / fps }))) painted++;   // four seconds
    assert.ok(painted >= 4 * 13 && painted <= 4 * 17, `${fps} fps: painted ${painted} times in 4 seconds`);
  }
});

test('it repaints at once when the view moves', () => {
  const p = new RepaintPolicy(10);
  p.shouldPaint(frame());
  assert.equal(p.shouldPaint(frame({ time: 0.01 })), false);
  assert.equal(p.shouldPaint(frame({ time: 0.02, x: 0.001 })), true, 'the camera moved');
  assert.equal(p.shouldPaint(frame({ time: 0.03, x: 0.001, zoom: 1.5 })), true, 'it zoomed');
  assert.equal(p.shouldPaint(frame({ time: 0.04, x: 0.001, zoom: 1.5 })), false, 'and then it is still again');
});

// ----- things off screen are not drawn -----
class Thing extends Entity {
  constructor(x, y) { super(null); this.x = x; this.y = y; this.drawn = 0; }
  draw() { this.drawn++; }
}
const VIEW = { minX: -0.5, maxX: 0.5, minY: -0.3, maxY: 0.3 };
const drawAll = (scene, view) => scene.drawLayer('upright', { save() {}, restore() {}, translate() {}, scale() {} }, 0, () => {}, view);

test('an entity wholly off screen is skipped; one on screen or partly on screen is drawn', () => {
  const scene = new Scene(), inside = scene.add(new Thing(0, 0)), edge = scene.add(new Thing(0.6, 0)), far = scene.add(new Thing(2, 0));
  drawAll(scene, VIEW);
  assert.equal(inside.drawn, 1); assert.equal(edge.drawn, 1, 'its radius reaches into the view'); assert.equal(far.drawn, 0);
});

test('with no view, everything is drawn (the gallery does this)', () => {
  const scene = new Scene(), far = scene.add(new Thing(50, 50));
  drawAll(scene, null);
  assert.equal(far.drawn, 1);
});

test('something with no position is always drawn; a scaled thing reaches further', () => {
  const scene = new Scene(), nowhere = scene.add(new Thing(undefined, undefined)), big = scene.add(new Thing(0.9, 0));
  drawAll(scene, VIEW);
  assert.equal(nowhere.drawn, 1); assert.equal(big.drawn, 0);
  big.scale = 4; drawAll(scene, VIEW);
  assert.equal(big.drawn, 1, 'at four times the size its radius reaches the view');
});

test('things that draw far from where they stand say so', () => {
  assert.ok(entities.Cloud.cullRadius >= 0.4); assert.ok(entities.Lighthouse.cullRadius >= 0.25);
  assert.ok(entities.Whale.cullRadius >= 0.2); assert.ok(entities.GullFlock.cullRadius >= 0.2);
  assert.equal(Entity.cullRadius, 0.15);
});
