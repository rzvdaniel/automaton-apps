import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/js/engine/world.js';
import { Sound } from '../public/js/audio/sound.js';
import { SOUNDS } from '../public/js/audio/sounds.js';
import { Church } from '../public/js/entities/church.js';
import { recordingSound, quietly } from './helpers.mjs';

test('World.ring plays a bell stroke with the ring\'s own delay, panned', () => {
  const sound = recordingSound();
  const w = quietly(() => new World({ width: 1500, height: 1000, sound }));
  w.ring(0.5, 0.5, 0.45);
  assert.equal(w.effects.rings.length, 1);
  assert.equal(sound.calls.length, 1);
  assert.equal(sound.calls[0].name, 'bell');
  assert.equal(sound.calls[0].delay, 0.45);
  assert.equal(typeof sound.calls[0].pan, 'number');
});

test('clicking the church strikes three bells 0.45 s apart', () => {
  const sound = recordingSound();
  const w = quietly(() => new World({ width: 1500, height: 1000, sound }));
  new Church(w, { x: 0.5, y: 0.5, a: 0 }).click();
  assert.deepEqual(sound.calls.filter(c => c.name === 'bell').map(c => c.delay), [0, 0.45, 0.9]);
});

test('Sound.play: delayed strokes are not thrown away as repeats, and are scheduled later', () => {
  const starts = [];
  const sound = new Sound();
  sound.engine = { live: true, now: 10, out: () => ({}) };
  sound.on = true;
  SOUNDS.testbell = (e, t) => starts.push(t);
  for (let i = 0; i < 3; i++) sound.play('testbell', { delay: i * 0.45 });
  sound.play('testbell', { delay: 0 });   // the same instant again is still a repeat
  assert.deepEqual(starts.map(t => +t.toFixed(2)), [10.01, 10.46, 10.91]);
  delete SOUNDS.testbell;
});

test('the bell is five inharmonic partials with a long decay, and is silent while sound is off', () => {
  const tones = [];
  SOUNDS.bell({ tone: (d, t, o) => tones.push(o) }, 0, {}, {});
  assert.equal(tones.length, 5);
  assert.ok(tones[1].f / tones[0].f > 1.99 && tones[2].f / tones[0].f > 2.38 && tones[2].f / tones[0].f < 2.42);
  assert.ok(Math.max(...tones.map(o => o.dur)) >= 2.4 && tones.every(o => o.a >= 0.005));
  const quiet = new Sound();   // off: no sound plays at all
  quiet.play('bell', { delay: 0.45 });
  assert.deepEqual(quiet.lastPlayed, {});
});
