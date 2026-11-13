import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLES, sampleAddress } from '../public/js/audio/samples.js';
import { SOUNDS } from '../public/js/audio/sounds.js';

const credits = readFileSync(new URL('../public/audio/CREDITS.md', import.meta.url), 'utf8');

test('every recording exists, is not empty, and is credited', () => {
  for (const [name, { file }] of Object.entries(SAMPLES)) {
    const path = fileURLToPath(sampleAddress(file));
    assert.ok(existsSync(path), `${name}: ${file} is missing`);
    assert.ok(statSync(path).size > 1000, `${name}: ${file} is too small to be a recording`);
    assert.ok(credits.includes(file), `${file} is not in CREDITS.md`);
  }
});

test('clips are [start, seconds] pairs', () => {
  for (const [name, { clips }] of Object.entries(SAMPLES)) {
    for (const clip of clips ?? []) assert.ok(clip.length === 2 && clip[0] >= 0 && clip[1] > 0, `${name} has a bad clip ${clip}`);
  }
});

test('every recording a sound asks for is defined', () => {
  const source = readFileSync(new URL('../public/js/audio/sounds.js', import.meta.url), 'utf8');
  const asked = [...source.matchAll(/\.sample\(d, t, '(\w+)'/g)].map(m => m[1]);
  assert.ok(asked.length >= 5);
  for (const name of asked) assert.ok(Object.hasOwn(SAMPLES, name), `a sound plays the recording "${name}", which is not in SAMPLES`);
});

test('the sounds for the silent entities are gone', () => {
  for (const name of ['puffin', 'engine', 'ahoy', 'yay', 'gotOne']) assert.equal(Object.hasOwn(SOUNDS, name), false, `${name} should be removed`);
  assert.ok(Object.hasOwn(SOUNDS, 'blow'));
});
