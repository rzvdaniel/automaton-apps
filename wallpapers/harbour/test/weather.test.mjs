import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Weather } from '../public/js/sky/weather.js';
import { Settings, WEATHER_LEVELS } from '../public/js/sky/settings.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Cloud } from '../public/js/entities/cloud.js';
import { World } from '../public/js/engine/world.js';
import { CloudBank } from '../public/js/engine/cloud-bank.js';
import { Lighting } from '../public/js/engine/lighting.js';
import { quietly, fakeContext } from './helpers.mjs';

// Every test runs on fixed dates, never the real clock: 14 November 2026, Bucharest (UTC+2).
const START = Date.UTC(2026, 10, 14);
const MINUTE = 60000;
const BUCHAREST = { lat: 44.43, lon: 26.1 };
const settingsWith = weather => { const s = new Settings({ storage: null }); s.set({ weather }); return s; };
/** The cover every minute for a week from START. */
const week = mood => Array.from({ length: 7 * 1440 }, (_, i) => Weather.coverAt(new Date(START + i * MINUTE), mood));
const average = list => list.reduce((a, b) => a + b, 0) / list.length;
const smooth01 = c => Math.min(1, Math.max(0, (c - 0.35) / 0.5));
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

test('Weather: the cover stays between 0 and the cap, whatever the mood', () => {
  for (const mood of [0, 0.5, 1]) for (const c of week(mood)) assert.ok(c >= 0 && c <= Weather.CAP, `cover ${c}`);
  assert.ok(Weather.CAP < 1, 'never fully overcast');
});

test('Weather: "more sun" gives clearly less cloud over a week than "more clouds"', () => {
  const sunny = week(0), cloudy = week(1);
  assert.ok(average(sunny) < 0.15, `more sun: average ${average(sunny)}`);
  assert.ok(average(cloudy) > 0.6, `more clouds: average ${average(cloudy)}`);
  const share = list => list.filter(c => c > 0.5).length / list.length;   // how much of the week is a cloudy spell
  assert.ok(share(sunny) < 0.15 && share(cloudy) > 0.65, `cloudy spells ${share(sunny)} vs ${share(cloudy)}`);
  assert.ok(Math.max(...sunny) < 0.2 && Math.min(...cloudy) > 0.7, 'each weather keeps to its own sky: no cloudy spell on a sunny setting, no clear one on a stormy');
});

test('Weather: the default (partly sunny) stays mostly sunny, as Harbour always was', () => {
  const middle = week(0.33), share = middle.filter(c => c > 0.5).length / middle.length;
  assert.ok(share < 0.4, `cloudy ${share} of the week`);
  assert.ok(average(middle) < 0.4, `average ${average(middle)}`);
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
  weather.update(date, 1);   // real time has passed: from now on it eases
  const before = weather.cover, target = Weather.coverAt(date, 1);
  settings.set({ weather: 1 });
  weather.update(date, 1);
  assert.ok(weather.cover - before < (target - before) * 0.2, 'one second later it has barely moved');
  for (let i = 0; i < 300; i++) weather.update(date, 1);
  assert.ok(Math.abs(weather.cover - target) < 0.01, 'a few minutes later it is there');
});

/** The sky a weather level settles on, at a moment. */
const skyOf = (level, date = new Date(START + 15 * 3600000)) => ({ ...new Weather({ settings: settingsWith(level) }).update(date) });

test('Weather: the four levels are four different skies: more, larger and greyer clouds, then a storm of its own', () => {
  for (let hour = 0; hour < 72; hour += 5) {
    const [sunny, partly, cloudy, stormy] = WEATHER_LEVELS.map(level => skyOf(level, new Date(START + hour * 3600000)));
    assert.ok(sunny.clouds >= 2 && sunny.clouds <= 4, `sunny: a few (${sunny.clouds})`);
    assert.ok(partly.clouds > sunny.clouds && cloudy.clouds >= partly.clouds + 3, `more each step: ${sunny.clouds}, ${partly.clouds}, ${cloudy.clouds}`);
    assert.ok(sunny.size < partly.size && partly.size < cloudy.size && cloudy.size >= 1.5 * partly.size, 'small, middling, large');
    assert.ok(sunny.darkness === 0 && partly.darkness < 0.2 && cloudy.darkness > 0.7, 'white, white, grey');
    assert.ok(sunny.speed < partly.speed && partly.speed < cloudy.speed, 'a slow drift on a sunny day');
    for (const fair of [sunny, partly, cloudy]) { assert.equal(fair.stormClouds, 0); assert.equal(fair.storm, 0); }
    assert.equal(stormy.clouds, 0, 'a storm has no fair clouds');
    assert.ok(stormy.stormClouds >= 18 && stormy.stormClouds <= Weather.MAX_STORM_CLOUDS, `crowded: ${stormy.stormClouds}`);
    assert.ok(stormy.speed >= 3 * cloudy.speed, 'and it races');
    assert.equal(stormy.storm, 1);
    assert.ok(sunny.cover < partly.cover && partly.cover < cloudy.cover && cloudy.cover < stormy.cover);
  }
});

test('Weather: switching level turns one sky into the other over a few seconds, through blends of the two', () => {
  const settings = settingsWith(0.67), weather = new Weather({ settings }), date = new Date(START + 15 * 3600000);
  weather.update(date, 1);
  const cloudy = { ...weather }, stormy = skyOf(1, date);
  settings.set({ weather: 1 });
  weather.update(date, 1);
  assert.ok(weather.storm > 0 && weather.storm < 0.4, `one second later it has only begun (${weather.storm})`);
  assert.ok(weather.clouds < cloudy.clouds && weather.clouds > 0 && weather.stormClouds > 0 && weather.stormClouds < stormy.stormClouds, 'both kinds are in the sky while it turns');
  let last = weather.storm;
  for (let i = 0; i < 14; i++) { weather.update(date, 1); assert.ok(weather.storm >= last); last = weather.storm; }
  assert.ok(weather.storm > 0.97 && weather.clouds === 0 && weather.stormClouds === stormy.stormClouds, 'fifteen seconds later the storm is there');
  assert.ok(Math.abs(weather.speed - stormy.speed) < 0.1);
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

test('CloudBank: turning to stormy crowds the sky with storm clouds in seconds, formed in place and faded in, while the fair ones fade', () => {
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000 }); w.skyClock.realNow = () => START; w.generate(7); return w; });
  const sky = { cover: 0.6, clouds: 12, stormClouds: 0, size: 1.9, darkness: 0.85, speed: 1.3, storm: 0, update() { return this; } };
  world.weather = sky;
  const count = storm => world.all(Cloud).filter(c => !c.leaving && c.storm === storm).length;
  const run = seconds => { for (let i = 0; i < seconds; i++) world.update(1); };
  run(60);
  assert.equal(count(false), 12); assert.equal(count(true), 0);

  Object.assign(sky, { cover: 0.8, clouds: 0, stormClouds: 21, storm: 1, speed: 4 });
  run(1);
  const fresh = world.all(Cloud).filter(c => c.storm);
  assert.ok(fresh.length >= 3, `several form at once (${fresh.length})`);
  for (const c of fresh) { assert.ok(c.alpha < 0.5, 'faded out at first'); assert.ok(Math.abs(c.x) <= world.hw + 0.1 && Math.abs(c.y) <= world.hh + 0.1, 'in the view, not out at its edge'); }
  assert.ok(world.all(Cloud).some(c => !c.storm && c.alpha > 0.5), 'the fair clouds are still fading');
  run(11);
  assert.ok(count(true) >= 19, `twelve seconds later the sky is crowded (${count(true)})`);
  assert.equal(count(false), 0, 'and no fair cloud is staying');
  run(40);
  assert.equal(count(true), 21);
  assert.equal(world.all(Cloud).filter(c => !c.storm).length, 0, 'the fair ones are gone');
  assert.ok(world.all(Cloud).length <= CloudBank.MAX, 'the count is capped');
});

test('CloudBank: a bigger screen holds more clouds in proportion, up to its cap', () => {
  const bank = size => new CloudBank(new World(size));
  assert.equal(bank({ width: 1500, height: 1000 }).wanted(20), 20);
  assert.ok(bank({ width: 2560, height: 1080 }).wanted(20) > 20);
  assert.ok(bank({ width: 5000, height: 1000 }).wanted(Weather.MAX_STORM_CLOUDS) <= CloudBank.MAX);
});

test('Cloud: a storm cloud is another shape: wide, low, with nothing hanging below its floor', () => {
  const world = { hw: 0.75, hh: 0.5, wind: [1, 0], weather: { cover: 0.8, darkness: 1, speed: 4, size: 1.9 } };
  for (let seed = 1; seed <= 20; seed++) {
    let n = seed * 7919; const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    const storm = new Cloud(world, rnd, 0, 0, true), fair = new Cloud(world, rnd, 0, 0), b = storm.box, f = fair.box;
    assert.ok((b.x1 - b.x0) / (b.y1 - b.y0) > 2, `wide and low (${((b.x1 - b.x0) / (b.y1 - b.y0)).toFixed(2)})`);
    assert.ok((b.x1 - b.x0) * storm.r > (f.x1 - f.x0) * fair.r, 'heavier than a fair cloud of its own size');
    assert.equal(storm.floor, 0);
    const s = storm.size;
    for (let x = b.x0; x <= b.x1; x += 0.1) assert.equal(storm.hit(x * s, 0.02 * s), false, 'nothing hangs below the base');
    assert.ok(storm.hit(0, -0.2 * s), 'the middle is cloud');
    let closed = 0; const arcs = [];
    storm.outline({ beginPath() {}, moveTo() {}, arc(...a) { arcs.push(a); }, closePath() { closed++; } }, 0, 0, 1);
    assert.equal(closed, 0, 'no lump is cut off along the floor: every one is a whole circle');
    assert.ok(storm.puffs.every(p => p.y + p.r <= 0), 'every lump sits wholly above the floor');
    assert.equal(storm.size, storm.r, 'a storm cloud keeps its own size');
    assert.ok(Math.abs(fair.size - fair.r * 1.9) < 1e-12, 'a fair cloud grows with the weather');
  }
});

test('Cloud: a storm cloud is dark slate with a lighter rim, by day and by night', () => {
  const noon = Cloud.tones({ darkness: 0, moonlight: 0 }, undefined, true), overcast = Cloud.tones({ darkness: 0, moonlight: 0 }, { darkness: 1 });
  assert.equal(noon.length, 4, 'rim and three layers');
  assert.ok(luma(noon[1]) < luma(overcast[2]) * 0.8, 'its lit layer is darker than the underside of a grey cloud');
  assert.ok(luma(noon[0]) > luma(noon[1]) * 1.4, 'the rim is clearly lighter');
  for (let i = 2; i < 4; i++) assert.ok(luma(noon[i - 1]) - luma(noon[i]) >= 15, 'each layer down is darker');
  const sea = luma(NIGHT_SEA);
  for (const moonlight of [0, 1]) {
    const night = Cloud.tones({ darkness: 1, moonlight }, undefined, true).map(t => tinted(t, DayCycle.lightAt(-30, false, moonlight)));
    assert.ok(luma(night[0]) > sea * 1.1, `moon ${moonlight}: the rim shows against the night sea (${luma(night[0]).toFixed(1)} vs ${sea.toFixed(1)})`);
    for (let i = 1; i < 4; i++) assert.ok(luma(night[i]) < sea * 0.92, `moon ${moonlight}: layer ${i} is a dark mass against it (${luma(night[i]).toFixed(1)} vs ${sea.toFixed(1)})`);
    for (let i = 2; i < 4; i++) assert.ok(luma(night[i - 1]) - luma(night[i]) >= 2.5, `the layers still read (${luma(night[i - 1]).toFixed(1)}, ${luma(night[i]).toFixed(1)})`);
    night.forEach(t => assert.ok(t[2] > t[1] && t[1] > t[0], `bluish ${t.map(Math.round)}`));
  }
  const rim = moonlight => luma(tinted(Cloud.tones({ darkness: 1, moonlight }, undefined, true)[0], DayCycle.lightAt(-30, false, moonlight)));
  assert.ok(rim(1) > rim(0) * 1.3, 'the moon lights the rim');
});

test('Cloud: its picture is painted once and then only copied each frame; colours repaint a few clouds a frame', () => {
  const made = []; const real = globalThis.document;
  globalThis.document = { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => fakeContext() }; made.push(canvas); return canvas; } };
  try {
    const world = quietly(() => { const w = new World({ width: 750, height: 500 }); w.skyClock.realNow = () => START + 10 * 3600000; w.generate(7); return w; });
    world.all(Cloud).forEach(c => { c.dead = true; }); world.update(0.016);
    const clouds = Array.from({ length: 12 }, (_, i) => world.add(new Cloud(world, Math.random, 0, 0, i % 2 === 0)));
    let paints = 0, copies = 0;
    for (const c of clouds) { const paint = c.paint; c.paint = function (...a) { paints++; return paint.apply(this, a); }; }
    const ctx = fakeContext(); ctx.drawImage = () => { copies++; };
    const frame = () => { world.clock += 0.016; world.scene.drawLayer('clouds', ctx, world.clock); };
    frame();
    assert.equal(paints, 12, 'each paints its sprite the first time'); assert.equal(copies, 12);
    assert.equal(made.length, 12, 'one small canvas each');
    for (const canvas of made) assert.ok(canvas.width > 8 && canvas.height > 8 && Math.max(canvas.width, canvas.height) <= Cloud.MAX_SPRITE, `sprite ${canvas.width}x${canvas.height}`);
    for (let i = 0; i < 100; i++) frame();
    assert.equal(paints, 12, 'a hundred frames later nothing was painted again'); assert.equal(copies, 12 * 101);

    world.day.darkness = 0.5;   // dusk: every cloud's colours change
    frame();
    assert.ok(paints - 12 > 0 && paints - 12 <= 6, `only a few repaint in one frame (${paints - 12})`);
    for (let i = 0; i < 10; i++) frame();
    assert.equal(paints, 24, 'and within a few frames all have');

    world.camera.zoom = 4;   // zoomed in: the sprites are too small now
    frame();
    assert.equal(paints, 36, 'they are painted again, bigger');
    for (const canvas of made) assert.ok(Math.max(canvas.width, canvas.height) <= Cloud.MAX_SPRITE, 'but never beyond the cap');
    for (let i = 0; i < 20; i++) frame();
    assert.equal(paints, 36);
    assert.equal(made.length, 12, 'on the same canvases');
  } finally { globalThis.document = real; }
});

test('Cloud: by day white, grey under heavy cover', () => {
  const day = Cloud.tones({ darkness: 0, moonlight: 0 });
  assert.deepEqual(day, [[255, 255, 255], [230, 236, 247], [213, 222, 239]], 'the daytime tones are as they always were');
  const overcast = Cloud.tones({ darkness: 0, moonlight: 0 }, { cover: 0.85, darkness: 1, speed: 1 });
  assert.ok(luma(overcast[0]) < luma(day[0]) * 0.8, 'grey under heavy cover');
});

// What the eye sees at night: the cloud's tones AFTER the night tint Lighting puts over the whole 2D canvas.
const tinted = (rgb, light) => { const m = Lighting.matrix(light); return [0, 1, 2].map(row => m[row * 3] * rgb[0] + m[row * 3 + 1] * rgb[1] + m[row * 3 + 2] * rgb[2] + 255 * light.offset[row]); };
// the night sea as it shows on screen (shader-source.js: middle (0.07, 0.25, 0.48), deep (0.03, 0.12, 0.30)), as 0..255
const NIGHT_SEA = [0.07, 0.25, 0.48].map(v => v * 255), NIGHT_DEEP = [0.03, 0.12, 0.30].map(v => v * 255);

test('Cloud: at night, after the tint, a blue-grey a step lighter than the on-screen night sea, with three clear tones', () => {
  for (const cover of [0, Weather.CAP]) {
    const weather = { cover, darkness: smooth01(cover), speed: 1 };
    const moonless = Cloud.tones({ darkness: 1, moonlight: 0 }, weather).map(t => tinted(t, DayCycle.lightAt(-30, false, 0)));
    const sea = luma(NIGHT_SEA); assert.ok(luma(NIGHT_DEEP) < sea, 'the deep sea is darker still');
    moonless.forEach((t, i) => {
      assert.ok(luma(t) > sea && luma(t) < 2 * sea, `cover ${cover}, tone ${i}: ${t.map(Math.round)} (luma ${luma(t).toFixed(1)}) vs sea ${sea.toFixed(1)}`);
      assert.ok(t[2] > t[1] && t[1] > t[0], `bluish grey ${t.map(Math.round)}`);
    });
    for (let i = 1; i < 3; i++) assert.ok(luma(moonless[i - 1]) - luma(moonless[i]) >= 4, `tone ${i - 1} vs ${i}: a visible step`);
    // a bright moon lights them more (the tint itself is brighter then, and so are the tones)
    const moonlit = Cloud.tones({ darkness: 1, moonlight: 1 }, weather).map(t => tinted(t, DayCycle.lightAt(-30, false, 1)));
    moonlit.forEach((t, i) => assert.ok(luma(t) > luma(moonless[i]) * 1.1, `moonlit tone ${i}`));
  }
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
  assert.deepEqual({ ...clear, offset: [...clear.offset], moon: 0 }, { r: 1, g: 1, b: 1, grey: 0, offset: [0, 0, 0], night: 0, moon: 0, phases: [1, 0, 0, 0] });
  assert.ok(Math.abs(cloudy.r + cloudy.g + cloudy.b - 2.7) < 1e-9, `cloudy light ${JSON.stringify(cloudy)}`);
  assert.ok(Math.abs(cloudy.grey - 0.1) < 1e-9, `grey ${cloudy.grey}`);
});

test('DayCycle: under a storm the island is clearly dimmer than under plain cloud, by day only', () => {
  const noon = new Date(Date.UTC(2026, 10, 14, 10)), midnight = new Date(Date.UTC(2026, 10, 14, 22)), day = new DayCycle();
  const sum = l => l.r + l.g + l.b;
  const cloudy = { ...day.update(noon, BUCHAREST, Weather.CAP).light }, storm = { ...day.update(noon, BUCHAREST, Weather.CAP, 1).light };
  assert.ok(sum(storm) < sum(cloudy) * 0.85, `storm ${sum(storm)} vs cloudy ${sum(cloudy)}`);
  assert.ok(sum(storm) > 2, 'but it is still day');
  assert.ok(storm.grey > cloudy.grey);
  const half = { ...day.update(noon, BUCHAREST, Weather.CAP, 0.5).light };
  assert.ok(sum(half) < sum(cloudy) && sum(half) > sum(storm), 'it comes on gradually');
  assert.deepEqual({ ...day.update(midnight, BUCHAREST, Weather.CAP, 1).light }, { ...day.update(midnight, BUCHAREST, 0, 0).light }, 'the night is as dark as it was');
});

test('World: owns the weather, and follows a clock fixed after it was built without easing from today', () => {
  const world = new World({ width: 800, height: 600 }), fixed = START + 15 * 3600000;
  assert.ok(world.weather instanceof Weather);
  world.skyClock.realNow = () => fixed;
  world.update(1);
  assert.ok(Math.abs(world.weather.cover - Weather.coverAt(new Date(fixed), world.settings.get('weather'))) < 1e-9);
});

const stormCloud = seed => {
  let n = seed * 7919; const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
  return new Cloud({ hw: 0.75, hh: 0.5, wind: [1, 0], weather: { cover: 0.8, darkness: 1, speed: 4, size: 1.9 } }, rnd, 0, 0, true);
};

test('Cloud: a storm cloud has a ragged underside and one connected body', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const c = stormCloud(seed), ps = c.puffs;
    const bottoms = ps.map(p => p.y + p.r);
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) > 0.03, 'the lowest points of the lumps vary along x');
    const seen = new Set([0]), todo = [0];
    while (todo.length) { const i = todo.pop(); ps.forEach((q, j) => { if (!seen.has(j) && Math.hypot(ps[i].x - q.x, ps[i].y - q.y) < ps[i].r + q.r) { seen.add(j); todo.push(j); } }); }
    assert.equal(seen.size, ps.length, `the lumps join into one body (seed ${seed})`);
  }
});

test('Cloud: a lump forced across the floor is traced as a clockwise arc closed along it', () => {
  const c = stormCloud(3); c.puffs = [{ x: 0, y: -0.1, r: 0.3 }];
  const calls = [];
  c.outline({ beginPath() {}, moveTo() {}, arc(...a) { calls.push(['arc', a]); }, closePath() { calls.push(['close']); } }, 0, 0, 1);
  const arc = calls.find(k => k[0] === 'arc')[1];
  assert.ok(arc[5] !== true, 'not anticlockwise');
  assert.ok(calls.some(k => k[0] === 'close'), 'closed along the floor');
});

test('Cloud: a storm cloud paints its body fully opaque', () => {
  const c = stormCloud(5), fills = [];
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (t, k) => (k in t ? t[k] : k === 'fill' ? () => fills.push(t.globalAlpha) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const real = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try { c.paint(['#111', '#222', '#333', '#444'], 100, 0); } finally { globalThis.document = real; }
  assert.equal(fills[0], 1, 'the body is filled at alpha 1');
});
