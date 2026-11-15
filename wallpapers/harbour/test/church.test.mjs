import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/js/engine/world.js';
import { Church } from '../public/js/entities/church.js';
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
  for (const a of [0, Math.PI]) {
    const { church } = make({ a }), f = church.side, at = (dx, dy) => church.hit(0.5 + f * dx, 0.5 + 0.012 + dy);
    assert.ok(at(-0.032, -0.02), 'the tower');
    assert.ok(at(0.01, -0.01), 'the nave');
    assert.ok(at(-0.03, -0.08), 'the spire');
    assert.ok(!at(0.01, -0.06), 'the sky above the nave');
    assert.ok(!at(0.2, -0.01) && !at(-0.2, -0.01), 'far to either side');
    assert.ok(!at(0.01, 0.05), 'below it');
  }
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
  assert.ok(Math.abs(bx - (0.5 - 0.0325)) < 0.01 && by < 0.5 + 0.012, 'the bell is up in the tower, at the tower end');
  for (const r of world.effects.rings) assert.ok(Math.abs(r.x - bx) < 1e-9 && Math.abs(r.y - by) < 1e-9, 'each ring starts at the bell');
  assert.equal(church.pop, 1);
});
