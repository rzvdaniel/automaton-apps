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

import { SettingsPanel } from '../public/js/ui/settings-panel.js';

test('the screen offset eases in and out, and settles exactly', () => {
  const { camera } = make();
  camera.setOffset(-175);
  camera.ease(0.016); assert.ok(camera.offsetX < 0 && camera.offsetX > -175, 'part of the way');
  let n = 0; while (camera.ease(0.016) && n++ < 1000);
  assert.equal(camera.offsetX, -175);
  camera.setOffset(0); while (camera.ease(0.016) && n++ < 2000);
  assert.equal(camera.offsetX, 0);
});

test('the offset moves the island on screen without touching the viewer pan and zoom', () => {
  const { camera } = make();
  camera.zoomAt(2, 300, 200, true);
  const [x, y, z] = [camera.x, camera.y, camera.zoom], before = camera.toWorld(750, 500);
  camera.setOffset(-200, true);
  assert.deepEqual([camera.x, camera.y, camera.zoom], [x, y, z]);
  // the world point that was at screen x 750 is now 200 px to the left
  const moved = camera.toWorld(550, 500); near(moved[0], before[0]); near(moved[1], before[1]);
  camera.setOffset(0, true);
  const back = camera.toWorld(750, 500); near(back[0], before[0]);
});

test('closing the panel returns to the viewer own zoom and pan', () => {
  const { camera } = make();
  camera.zoomAt(3, 400, 300, true); camera.panBy(40, -30);
  const view = [camera.x, camera.y, camera.zoom];
  camera.setOffset(SettingsPanel.shiftFor(true, 340, 1500));
  for (let i = 0; i < 400; i++) camera.ease(0.016);
  camera.setOffset(SettingsPanel.shiftFor(false, 340, 1500));
  for (let i = 0; i < 400; i++) camera.ease(0.016);
  assert.deepEqual([camera.x, camera.y, camera.zoom], view); assert.equal(camera.offsetX, 0);
});

test('screen to world and sound panning include the offset; applyTo and the shader centre agree', () => {
  const { camera, viewport } = make();
  camera.setOffset(-175, true);
  const [wx] = camera.toWorld(750 - 175, 500); near(wx, 0);          // the island centre is now 175 px left
  near(camera.screenFraction(0), -175 / 750);
  let args = null; camera.applyTo({ setTransform: (...a) => { args = a; } });
  near(args[4], 750 - 175);                                           // the 2D canvas is shifted the same
  near(camera.centreX, 175 / viewport.scale);                         // what the backdrop shader gets as u_cam
});

test('the island slides only beside the panel: not closed, not at phone width', () => {
  assert.equal(SettingsPanel.shiftFor(true, 340, 1500), -175);
  assert.equal(SettingsPanel.shiftFor(false, 340, 1500), 0);
  assert.equal(SettingsPanel.shiftFor(true, 340, 390), 0);
  assert.equal(SettingsPanel.shiftFor(true, 340, 639), 0);
  assert.equal(SettingsPanel.shiftFor(true, 340, 640), -175);
});

test('zooming about a point keeps the world point under it where it was, with the offset', () => {
  const { camera } = make();
  camera.setOffset(-200, true);
  const before = camera.toWorld(400, 300);
  camera.zoomAt(2, 400, 300, true);
  const after = camera.toWorld(400, 300);
  near(after[0], before[0]); near(after[1], before[1]);
});
