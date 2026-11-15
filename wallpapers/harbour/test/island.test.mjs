import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../public/js/engine/world.js';
import { LAYERS } from '../public/js/engine/scene.js';
import * as entities from '../public/js/entities/index.js';
import { fakeContext, quietly, GOLDEN_SIZE } from './helpers.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const RANDOM_START = new Set(['Shark', 'SleekShark', 'Whale']);   // they start somewhere random, so they are not part of the fingerprint

const fnv = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const round = n => n.toFixed(4);

/** hash/count of what the generator builds for a seed. To re-take the golden values after changing the layout on purpose, print this for each seed. */
function fingerprint(world) {
  const rows = world.scene.entities.filter(e => !RANDOM_START.has(e.constructor.name))
    .map(e => `${e.constructor.name}:${e.x === undefined ? '-' : round(e.x)},${e.y === undefined ? '-' : round(e.y)}${e.kind ? ':' + e.kind : ''}${e.scale !== 1 ? ':s' + e.scale : ''}`).sort();
  const { land, bay } = world.map;
  const terrain = JSON.stringify(land.map(b => b.map(v => +round(v)))) + JSON.stringify(bay?.map(v => +round(v))) + world.wind.map(round);
  return `${fnv(rows.join('|') + terrain)}/${rows.length}`;
}

const build = (seed, everything) => { const world = new World({ ...GOLDEN_SIZE, debug: false, everything }); quietly(() => world.generate(seed)); return world; };

for (const mode of ['normal', 'debug']) {
  test(`every seed builds the same island as before (${mode} mode)`, () => {
    for (const [seed, expected] of Object.entries(golden[mode])) assert.equal(fingerprint(build(Number(seed), mode === 'debug')), expected, `seed ${seed}`);
  });
}

test('the same seed always builds the same island', () => {
  assert.equal(fingerprint(build(99)), fingerprint(build(99)));
  assert.notEqual(fingerprint(build(99)), fingerprint(build(100)));
});

test('every island has a harbour, a lighthouse, a town and a sky', () => {
  for (const seed of [3, 11, 27, 64]) {
    const world = build(seed);
    for (const Type of [entities.Lighthouse, entities.Church, entities.House, entities.Roads, entities.Quay, entities.GullFlock, entities.Cloud, entities.Whale]) assert.ok(world.count(Type) > 0, `seed ${seed} has a ${Type.name}`);
    assert.equal(world.count(entities.Shark), 2 + 0, 'two sharks (Shark and SleekShark both count as Shark)');
  }
});

test('?debug alone adds no extras; with Every animal on, every extra is placed', () => {
  const plain = new World({ ...GOLDEN_SIZE, debug: true, everything: false }); quietly(() => plain.generate(7));
  const kinds = w => [entities.Seal, entities.Balloon, entities.Biplane, entities.DolphinPod, entities.Puffin, entities.Cow, entities.Cottage, entities.Kite, entities.Buoy, entities.JellyBloom].filter(T => w.count(T) > 0).length;
  assert.equal(plain.everything, false); assert.ok(kinds(plain) < 10, 'not every extra');
  plain.settings.set({ everything: true });   // the island is rebuilt with the same seed
  assert.equal(plain.seed, 7); assert.equal(kinds(plain), 10, 'the toggle places every extra');
  const world = build(7, true);
  for (const Type of [entities.Seal, entities.Balloon, entities.Biplane, entities.DolphinPod, entities.Puffin, entities.Cow, entities.Cottage, entities.Kite, entities.Buoy, entities.JellyBloom]) {
    assert.ok(world.count(Type) > 0, `${Type.name} is on the island`);
  }
});

test('a world with a tall (phone) screen builds an island that fits', () => {
  const world = new World({ width: 390, height: 844, debug: false });
  quietly(() => world.generate(7));
  const { hw, hh } = world;
  assert.ok(hw < hh);
  for (const [x, y, r] of world.map.land) { assert.ok(Math.abs(x) + r * 0.5 < hw + 0.3, 'land is near the screen'); void y; }
});

test('every entity can be updated and drawn for a while without a single error', () => {
  const ctx = fakeContext();
  for (const seed of [1, 7, 42, 1234]) for (const debug of [false, true]) {
    const world = build(seed, debug);
    for (let frame = 0; frame < 120; frame++) {
      world.update(0.05);
      for (const layer of LAYERS) world.scene.drawLayer(layer, ctx, world.clock);
    }
    assert.deepEqual(world.errors, [], `seed ${seed}${debug ? ' (debug)' : ''}`);
  }
});
