import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Weather } from '../public/js/sky/weather.js';
import { Settings } from '../public/js/sky/settings.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Cloud } from '../public/js/entities/cloud.js';
import { World } from '../public/js/engine/world.js';
import { quietly } from './helpers.mjs';

// Every test runs on fixed dates, never the real clock: 14 November 2026, Bucharest (UTC+2).
const START = Date.UTC(2026, 10, 14);
const MINUTE = 60000;
const BUCHAREST = { lat: 44.43, lon: 26.1 };
const settingsWith = weather => { const s = new Settings({ storage: null }); s.set({ weather }); return s; };
/** The cover every minute for a week from START. */
const week = mood => Array.from({ length: 7 * 1440 }, (_, i) => Weather.coverAt(new Date(START + i * MINUTE), mood));
const average = list => list.reduce((a, b) => a + b, 0) / list.length;
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

test('Weather: the cover stays between 0 and the cap, whatever the mood', () => {
  for (const mood of [0, 0.5, 1]) for (const c of week(mood)) assert.ok(c >= 0 && c <= Weather.CAP, `cover ${c}`);
  assert.ok(Weather.CAP < 1, 'never fully overcast');
});

test('Weather: "more sun" gives clearly less cloud over a week than "more clouds"', () => {
  const sunny = week(0), cloudy = week(1);
  assert.ok(average(sunny) < 0.3, `more sun: average ${average(sunny)}`);
  assert.ok(average(cloudy) > 0.6, `more clouds: average ${average(cloudy)}`);
  const share = list => list.filter(c => c > 0.5).length / list.length;   // how much of the week is a cloudy spell
  assert.ok(share(sunny) < 0.3 && share(cloudy) > 0.7, `cloudy spells ${share(sunny)} vs ${share(cloudy)}`);
  assert.ok(Math.max(...sunny) > 0.6, 'even with more sun a cloudy spell comes now and then');
});

test('Weather: the same moment always gives the same cover (a reload shows the same sky)', () => {
  const date = new Date(START + 15 * 3600000);
  assert.equal(Weather.coverAt(date, 0.5), Weather.coverAt(new Date(date.getTime()), 0.5));
  const a = new Weather({ settings: settingsWith(0.5) }).update(date), b = new Weather({ settings: settingsWith(0.5) }).update(date);
  assert.equal(a.cover, b.cover); assert.equal(a.clouds, b.clouds);
});

test('Weather: the cover changes smoothly, with no jumps from one minute to the next', () => {
  for (const mood of [0, 0.5, 1]) {
    const list = week(mood);
    for (let i = 1; i < list.length; i++) assert.ok(Math.abs(list[i] - list[i - 1]) < 0.04, `mood ${mood}, minute ${i}: ${list[i - 1]} -> ${list[i]}`);
  }
});

test('Weather: moving the slider changes the sky gradually, not at once', () => {
  const settings = settingsWith(0), weather = new Weather({ settings }), date = new Date(START + 15 * 3600000);
  weather.update(date);
  const before = weather.cover, target = Weather.coverAt(date, 1);
  settings.set({ weather: 1 });
  weather.update(date, 1);
  assert.ok(weather.cover - before < (target - before) * 0.2, 'one second later it has barely moved');
  for (let i = 0; i < 300; i++) weather.update(date, 1);
  assert.ok(Math.abs(weather.cover - target) < 0.01, 'a few minutes later it is there');
});

test('Weather: more cover means more and greyer clouds', () => {
  const weather = new Weather({ settings: settingsWith(0.5) });
  const at = cover => { weather.cover = cover; weather.started = true; weather.settings.get = () => weather.mood; Weather.coverAt = () => cover; return { ...weather.update(new Date(START), 0) }; };
  const coverAt = Weather.coverAt;
  try {
    const clear = at(0.05), overcast = at(Weather.CAP);
    assert.ok(overcast.clouds > clear.clouds + 4, `${clear.clouds} -> ${overcast.clouds}`);
    assert.ok(overcast.darkness > clear.darkness);
    assert.ok(clear.clouds >= 1 && overcast.clouds <= Weather.MAX_CLOUDS);
  } finally { Weather.coverAt = coverAt; }
});

test('CloudBank: the number of clouds follows the cover, one at a time and without popping', () => {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000 }); w.skyClock.realNow = () => START; w.generate(7); return w; });
  const sky = { cover: 0, clouds: 0, darkness: 0, speed: 1, update() { return this; } };
  world.weather = sky;
  const staying = () => world.all(Cloud).filter(c => !c.leaving).length;
  const run = seconds => { for (let i = 0; i < seconds; i++) world.update(1); };

  Object.assign(sky, { cover: Weather.CAP, clouds: 9 });
  run(1);
  const added = world.all(Cloud).filter(c => c.alpha < 0.5);
  assert.ok(added.length >= 1, 'a new cloud comes in faded out');
  run(120);
  assert.equal(staying(), 9, 'a cloudy sky fills up');

  Object.assign(sky, { cover: 0.05, clouds: 1 });
  run(1);
  assert.equal(staying(), 8, 'one is told to leave each second');
  run(10);
  assert.equal(staying(), 1, 'then the rest');
  assert.ok(world.all(Cloud).length > 1, 'but they do not vanish at once');
  run(60);
  assert.equal(world.all(Cloud).length, 1, 'they have faded or drifted away');
});

test('Cloud: at night it is dark blue-grey, darker than by day and darker than the moonlit land', () => {
  const day = Cloud.tones({ darkness: 0, moonlight: 0 }), night = Cloud.tones({ darkness: 1, moonlight: 1 }), moonless = Cloud.tones({ darkness: 1, moonlight: 0 });
  const LAND = [169, 210, 119];
  for (let i = 0; i < 3; i++) {
    assert.ok(luma(night[i]) < luma(day[i]) * 0.5, `tone ${i}: night ${night[i]} vs day ${day[i]}`);
    assert.ok(luma(night[i]) < luma(LAND) * 0.7, `tone ${i} darker than the land under the same moonlight`);
    assert.ok(night[i][2] > night[i][0], 'bluish, not lavender-pink');
    assert.ok(luma(moonless[i]) < luma(night[i]), 'darker still without a moon');
  }
  const overcast = Cloud.tones({ darkness: 0, moonlight: 0 }, { cover: 0.85, darkness: 1, speed: 1 });
  assert.ok(luma(overcast[0]) < luma(day[0]) * 0.8, 'grey under heavy cover');
});

test('Cloud: a light under it is mostly hidden, one in a gap is not', () => {
  const world = { weather: { cover: 0.5, darkness: 0.5, speed: 1 }, day: { darkness: 1, moonlight: 0.5 } };
  const cloud = Object.assign(Object.create(Cloud.prototype), { world, x: 0, y: 0, r: 0.1, scale: 1, alpha: 1, puffs: [{ x: 0, y: 0, r: 0.5 }] });
  assert.ok(cloud.dimAt(0, 0) >= 0.8, 'under the cloud');
  assert.equal(cloud.dimAt(0.5, 0.5), 0, 'in a gap');
  // and that is how it draws on the lights canvas: rubbing out (not painting over) with that strength
  const seen = [];
  const c = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'fill' ? () => seen.push({ op: t.globalCompositeOperation, alpha: t.globalAlpha }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  cloud.drawShade(c);
  assert.ok(seen.length > 0 && seen.every(f => f.op === 'destination-out'));
  assert.equal(seen.at(-1).alpha, Cloud.MASK);
});

test('DayCycle: daylight is dimmer and greyer under heavy cover, unchanged under a clear sky', () => {
  const noon = new Date(Date.UTC(2026, 10, 14, 10)), day = new DayCycle();
  const clear = { ...day.update(noon, BUCHAREST, 0).light }, cloudy = { ...day.update(noon, BUCHAREST, Weather.CAP).light };
  assert.deepEqual(clear, { r: 1, g: 1, b: 1, grey: 0 });
  assert.ok(cloudy.r + cloudy.g + cloudy.b < 2.7, `cloudy light ${JSON.stringify(cloudy)}`);
  assert.ok(cloudy.grey > 0);
});

test('World: owns the weather and passes its cover to the day', () => {
  const world = new World({ width: 800, height: 600 });
  assert.ok(world.weather instanceof Weather);
  assert.ok(world.weather.cover >= 0 && world.weather.cover <= Weather.CAP);
});
