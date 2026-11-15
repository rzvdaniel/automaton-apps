import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/js/engine/world.js';
import { Church, layout, paintChurch } from '../public/js/entities/church.js';
import { fakeContext, recordingSound, quietly } from './helpers.mjs';

const make = (o = {}) => {
  const world = quietly(() => new World({ width: 1500, height: 1000, sound: recordingSound() }));
  const church = new Church(world, { x: 0.5, y: 0.5, a: 0, ...o });
  return { world, church };
};

test('church: the sprite is painted once and reused, not repainted every frame', () => {
  const { church } = make();
  let made = 0;
  const real = globalThis.document.createElement;
  globalThis.document.createElement = (...a) => { made++; return real(...a); };
  try {
    const first = church.sprite(2000);
    for (let i = 0; i < 10; i++) assert.equal(church.sprite(2000), first);
    assert.equal(made, 1, 'one canvas, made once');
    const ppu = church.spritePpu;
    church.sprite(1900); assert.equal(church.spritePpu, ppu, 'a slightly smaller view does not repaint');
    church.sprite(6000); assert.ok(church.spritePpu > ppu, 'shown much bigger: painted again, sharper');
  } finally { globalThis.document.createElement = real; }
});

test('church: hit() covers the building (tower, nave, spire) and not the sky or sea around it', () => {
  for (const a of [0, 0.35, -0.35]) {
    const { church } = make({ a }), g = layout(a), at = (p, dx = 0, dy = 0) => church.hit(0.5 + p[0] + dx, 0.5 + p[1] + dy);
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    assert.ok(at(g.ground(-0.0305, 0), 0, -0.012), 'the tower');
    assert.ok(at(g.ground(0.015, 0), 0, -0.004), 'the nave');
    assert.ok(at(mid(g.top[0], g.apex)), 'the spire');
    assert.ok(!at(g.ground(0.015, 0), 0, -0.05), 'the sky above the nave');
    assert.ok(!at(g.ground(0.2, 0)) && !at(g.ground(-0.2, 0)), 'far to either side');
    assert.ok(!at(g.ground(0.015, 0), 0, 0.05), 'below it');
  }
});

test('church: drawn in the houses projection: the nave turns with a, heights go straight up the screen, the tower is taller than the nave', () => {
  const flat = layout(0), turned = layout(0.4);
  assert.ok(Math.abs(flat.nave[1][1] - flat.nave[0][1]) < 1e-9, 'a = 0: the nave runs level, like a house with a = 0');
  assert.ok(Math.abs(Math.atan2(turned.nave[1][1] - turned.nave[0][1], turned.nave[1][0] - turned.nave[0][0]) - 0.4) < 1e-9, 'the nave runs along its a, as the houses do');
  for (const g of [flat, turned]) {
    const towerTop = g.top[0][1] - g.tower[0][1];
    assert.ok(Math.abs(g.top[0][0] - g.tower[0][0]) < 1e-12 && towerTop < 0, 'the tower top is the base moved straight up');
    assert.ok(g.apex[1] < g.top.reduce((m, p) => Math.min(m, p[1]), 1), 'the spire rises above the tower top');
    assert.ok(-towerTop > 0.0075 * 2, 'the tower is clearly taller than the nave wall');
    assert.ok(g.box.y0 < g.apex[1] && g.box.y1 > Math.max(...g.nave.map(p => p[1])), 'the sprite holds all of it');
  }
});

test('church: it is built from a long nave and a square tower, drawn without error for any turn, with the shadow on the far side of the sun', () => {
  for (const a of [-0.4, 0, 0.4, Math.PI]) {
    const { world, church } = make({ a }); world.day.darkness = 1;
    const c = fakeContext(); church.draw(c); church.drawLights(c); paintChurch(c, a); church.pop = 1; church.draw(c);
  }
  const { world, church } = make({ a: 0 }), pts = [];
  world.day.shadow = { x: 0.5, y: 0.2, strength: 1 };
  const c = new Proxy(fakeContext(), { get: (t, k) => k === 'moveTo' || k === 'lineTo' ? (x, y) => pts.push([x, y]) : t[k], set: (t, k, v) => { t[k] = v; return true; } });
  church.drawShadow(c);
  const g = church.shape, ground = Math.max(...g.nave.map(p => p[0]));
  assert.ok(Math.max(...pts.map(p => p[0])) > ground + 0.003, 'the shadow reaches away from the sun (to the right, as the sun shines from the left)');
  assert.ok(Math.max(...pts.map(p => p[1])) > Math.max(...g.nave.map(p => p[1])), 'and down the screen');
});

test('church: windows are lit at night and none by day', () => {
  const { world, church } = make();
  const count = hour => { world.hour = hour; let n = 0; for (let i = 0; i < church.windows.length; i++) if (church.windowLight(i) > 0.5) n++; return n; };
  world.day.darkness = 1;
  assert.ok(count(20) > 0, 'some lit in the evening');
  const lit = (h) => { const calls = []; const c = new Proxy(fakeContext(), { get: (t, k) => k === 'fill' ? () => calls.push(k) : t[k], set: (t, k, v) => { t[k] = v; return true; } }); world.hour = h; church.drawLights(c); return calls.length; };
  assert.ok(lit(20) > 0, 'panes drawn at night');
  world.day.darkness = 0;
  assert.equal(count(20), 0, 'none lit by day');
  assert.equal(lit(20), 0, 'nothing drawn by day');
});

test('church: windows register with the shared window lights and go out through the night', () => {
  const { world, church } = make();
  assert.equal(church.lights.length, church.windows.length);
  assert.equal(world.windowLights.list.length, church.windows.length);
  world.day.darkness = 1;
  const lit = h => { world.hour = h; return church.windows.filter((_, i) => church.windowLight(i) > 0.5).length; };
  assert.ok(lit(19.5) >= lit(23) && lit(23) >= lit(3), 'never more lit later in the night');
  assert.ok(lit(3) < church.windows.length, 'not all lit at 03:00');
});

test('church: clicking rings three bells at the tower', () => {
  const { world, church } = make();
  church.click();
  assert.equal(world.effects.rings.length, 3);
  const [bx, by] = church.bell;
  assert.ok(bx < 0.5 - 0.02 && by < 0.5 - 0.005, 'the bell is up in the tower, at the tower end');
  for (const r of world.effects.rings) assert.ok(Math.abs(r.x - bx) < 1e-9 && Math.abs(r.y - by) < 1e-9, 'each ring starts at the bell');
  assert.equal(church.pop, 1);
});
