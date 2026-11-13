import test from 'node:test';
import assert from 'node:assert/strict';
import { Viewport } from '../public/js/engine/viewport.js';
import { Camera } from '../public/js/engine/camera.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} is not near ${b}`);
const make = () => { const viewport = new Viewport({ width: 1500, height: 1000 }); return { viewport, camera: new Camera(viewport) }; };

test('screen positions map to world units and back at zoom 1', () => {
  const { camera } = make();
  const [x, y] = camera.toWorld(750, 500); near(x, 0); near(y, 0);
  const [x2] = camera.toWorld(1500, 500); near(x2, 0.75);
});

test('zooming about a point keeps the world point under it where it was', () => {
  const { camera } = make();
  const before = camera.toWorld(800, 520);
  camera.zoomAt(3, 800, 520, true);
  const after = camera.toWorld(800, 520);
  near(after[0], before[0]); near(after[1], before[1]);
  near(camera.zoom, 3);
});

test('zoom has a floor of 1 and a ceiling', () => {
  const { camera } = make();
  camera.zoomAt(0.1, 750, 500, true); assert.equal(camera.zoom, 1);
  camera.zoomAt(1000, 750, 500, true); assert.equal(camera.zoom, Camera.MAX_ZOOM);
});

test('the camera never shows anything beyond the original view', () => {
  const { camera, viewport } = make();
  camera.zoomAt(4, 0, 0, true);   // zoom towards the top left corner
  assert.ok(Math.abs(camera.x) <= viewport.hw * (1 - 1 / 4) + 1e-9); assert.ok(Math.abs(camera.y) <= viewport.hh * (1 - 1 / 4) + 1e-9);
  camera.panBy(100000, 100000);   // drag far
  assert.ok(Math.abs(camera.x) <= viewport.hw * (1 - 1 / 4) + 1e-9);
});

test('panBy drags the view the opposite way', () => {
  const { camera } = make();
  camera.zoomAt(2, 750, 500, true);
  camera.panBy(100, 0);
  assert.ok(camera.x < 0, 'dragging right shows what is to the left');
});

test('easing moves towards the target and settles exactly on it', () => {
  const { camera } = make();
  camera.zoomAt(2.5, 700, 450);   // eased, not instant
  assert.equal(camera.zoom, 1); assert.equal(camera.targetZoom, 2.5);
  let steps = 0; while (camera.ease(0.016) && steps++ < 1000);
  assert.equal(camera.zoom, 2.5); assert.ok(steps > 1, 'it took more than one frame');
});

test('reset() goes back to the whole view, at once or easing', () => {
  const { camera } = make();
  camera.zoomAt(3, 900, 600, true); camera.reset(true);
  assert.equal(camera.zoom, 1); assert.equal(camera.x, 0); assert.equal(camera.zoomed, false);
  camera.zoomAt(3, 900, 600, true); camera.reset();
  assert.equal(camera.targetZoom, 1); assert.equal(camera.zoom, 3);
});

test('listeners hear about zooms and resets, and can stop listening', () => {
  const { camera } = make(); let heard = 0;
  const stop = camera.onChange(() => heard++);
  camera.zoomAt(2, 750, 500); camera.reset();
  assert.equal(heard, 2);
  stop(); camera.zoomAt(2, 750, 500);
  assert.equal(heard, 2);
});

test('screenFraction says where across the screen a world x is', () => {
  const { camera } = make();
  near(camera.screenFraction(0), 0); near(camera.screenFraction(0.75), 1); near(camera.screenFraction(-0.75), -1);
  assert.equal(camera.screenFraction(5), 1); assert.equal(camera.screenFraction(undefined), 0);
});

test('applyTo sets the canvas transform for the zoom and the pan', () => {
  const { camera } = make(); let args = null;
  camera.zoomAt(2, 750, 500, true);
  camera.applyTo({ setTransform: (...a) => { args = a; } });
  near(args[0], 2000); near(args[3], 2000);   // 1000 pixels per world unit, doubled
  near(args[4], 750); near(args[5], 500);     // centred
});
