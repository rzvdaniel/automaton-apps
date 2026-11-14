import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wind } from '../public/js/engine/wind.js';
import { Weather } from '../public/js/sky/weather.js';
import { Backdrop, WAVE_STYLES } from '../public/js/engine/backdrop.js';
import { FRAGMENT_SHADER } from '../public/js/engine/shader-source.js';
import { Settings, WAVES } from '../public/js/sky/settings.js';
import { SettingsDialog } from '../public/js/ui/settings-dialog.js';
import { World } from '../public/js/engine/world.js';
import { quietly } from './helpers.mjs';

// Fixed dates only, never the real clock: from 14 November 2026.
const START = Date.UTC(2026, 10, 14);
const MINUTE = 60000;
const at = i => new Date(START + i * MINUTE);
const average = list => list.reduce((a, b) => a + b, 0) / list.length;
const AUTO = { mode: 'auto' };
const DAY = '2026-11-14';
const fixed = strength => ({ mode: 'fixed', strength });
const fresh = (setting, cover = 0.3) => new Wind().update({ setting, cover, date: at(0), day: DAY });
const dayName = n => new Date(START + n * 86400000).toISOString().slice(0, 10);
const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

test('Wind: the strength stays between 0 and 1, on auto and on every fixed setting', () => {
  for (let i = 0; i < 7 * 1440; i += 7) for (const cover of [0, 0.4, Weather.CAP]) {
    const s = Wind.targetFor(AUTO, cover, at(i), dayName(Math.floor(i / 1440)));
    assert.ok(s >= 0 && s <= 1, `auto ${s}`);
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) { const s = fresh(fixed(v)).strength; assert.ok(s >= 0 && s <= 1, `fixed ${s}`); }
});

test('Wind: on Auto each day has its own wind, the same every time, and mostly calm', () => {
  const days = Array.from({ length: 60 }, (_, n) => dayName(n));
  const noon = n => Wind.targetFor(AUTO, 0.2, new Date(START + n * 86400000 + 12 * 3600000), days[n]);
  const all = days.map((_, n) => noon(n));
  assert.deepEqual(all, days.map((_, n) => noon(n)), 'deterministic');
  assert.ok(median(all) < 0.3, `median ${median(all)}`);
  assert.ok(all.filter(s => s > 0.6).length <= 6, `stormy days ${all.filter(s => s > 0.6).length}`);
  assert.ok(new Set(days.map(Wind.dayBase)).size > 50, 'different days differ');
  const bases = Array.from({ length: 400 }, (_, n) => Wind.dayBase(dayName(n)));
  assert.ok(bases.some(b => b > 0.6), 'now and then a stormy day');
});

test('Wind: on Auto a cloudier sky brings a stronger wind, and it varies slowly through the day', () => {
  const week = cover => average(Array.from({ length: 7 * 1440 }, (_, i) => Wind.targetFor(AUTO, cover, at(i), dayName(Math.floor(i / 1440)))));
  assert.ok(week(0.1) < week(0.4) && week(0.4) < week(0.8), `${week(0.1)} ${week(0.4)} ${week(0.8)}`);
  for (let i = 1; i < 1440; i++) assert.ok(Math.abs(Wind.targetFor(AUTO, 0.3, at(i), DAY) - Wind.targetFor(AUTO, 0.3, at(i - 1), DAY)) < 0.02, 'smooth minute to minute');
});

test('Wind: a choice gives a fixed strength, calm to stormy, whatever the sky', () => {
  for (const cover of [0, Weather.CAP]) {
    assert.ok(Math.abs(fresh(fixed(0), cover).strength - 0.05) < 1e-9, 'calm');
    assert.ok(Math.abs(fresh(fixed(0.4), cover).strength - 0.39) < 1e-9, 'breezy');
    assert.ok(Math.abs(fresh(fixed(1), cover).strength - 0.9) < 1e-9, 'stormy');
  }
});

test('Wind: a choice is still in place the next day, and every day after', () => {
  const choice = fixed(1);
  assert.equal(Wind.chosen(choice), 1);
  assert.equal(Wind.chosen(AUTO), null);
  assert.equal(Wind.targetFor(choice, 0.2, at(1430), DAY), 0.9);
  for (const n of [1, 2, 30]) {
    const later = new Date(START + n * 86400000 + 600000);
    assert.equal(Wind.targetFor(choice, 0.2, later, dayName(n)), 0.9, `day ${n}`);
  }
});

test('Wind: a change eases in over about ten seconds, never in a jump', () => {
  const running = () => fresh(fixed(0)).update({ setting: fixed(0), cover: 0, date: at(0), day: DAY, seconds: 1 });   // real time has started
  const wind = running();
  let last = wind.strength;
  for (let s = 0; s < 60; s++) {
    wind.update({ setting: fixed(1), cover: 0, date: at(0), day: DAY, seconds: 1 });
    assert.ok(wind.strength - last <= 0.1 * (0.9 - 0.05) + 1e-9, `step ${wind.strength - last}`);
    last = wind.strength;
  }
  assert.ok(Math.abs(wind.strength - 0.9) < 0.01, 'it gets there in the end');
  const ten = running(); for (let s = 0; s < 10; s++) ten.update({ setting: fixed(1), cover: 0, date: at(0), day: DAY, seconds: 1 });
  assert.ok(ten.strength > 0.5 && ten.strength < 0.85, `after ten seconds: ${ten.strength}`);
});

test('Wind: plants sway further in a stronger wind', () => {
  const size = strength => { const w = new Wind(); w.setAngle(0.7); w.strength = strength; return Math.hypot(...w.sway(0.1, -0.05, 3.3)); };
  assert.ok(size(0.05) < size(0.4) && size(0.4) < size(0.9));
  const w = new Wind(); assert.equal(w.strength, Wind.REFERENCE); assert.equal(w.push, 1, 'the reference wind moves things as before');
});

test('Wind: calm leaves the sea as it was (shader strength 0); a storm gives it nearly all', () => {
  assert.equal(fresh(fixed(0)).sea, 0);
  assert.ok(fresh(fixed(1)).sea > 0.85);
});

test('Backdrop: the shader has the wind uniform, and the backdrop sets it from Wind', () => {
  assert.match(FRAGMENT_SHADER, /uniform vec4 u_wind;/);
  assert.match(FRAGMENT_SHADER, /uniform vec2 u_isle;/);
  const backdrop = new Backdrop({ getContext: () => null });   // no WebGL here: the values are still kept for the shader
  const wind = fresh(fixed(1)); wind.setAngle(0);
  backdrop.setWind(wind, 1);
  assert.deepEqual([...backdrop.wind].map(v => +v.toFixed(4)), [1, 0, +wind.sea.toFixed(4), 1]);
  backdrop.setWind(fresh(fixed(0)), 1);
  assert.equal(backdrop.wind[2], 0, 'calm: the sea uniform is 0');
  backdrop.setWind(wind, 0.8);
  assert.equal(backdrop.wind[3], 0, 'a slow device draws no whitecaps');
});

test('World: a chosen wind still drives the island after midnight', () => {
  let real = Date.UTC(2026, 10, 14, 21, 50);   // 23:50 in Bucharest
  const settings = new Settings({ storage: null }); settings.set({ place: 'Europe/Bucharest', wind: fixed(1) });
  const world = new World({ width: 800, height: 600, settings });
  world.skyClock.realNow = () => real;
  quietly(() => world.generate(7)); world.update(0);
  settings.set({ weather: 0.5 });   // any change makes the world look at the sky again
  assert.ok(Math.abs(world.windStrength - 0.9) < 0.01, `chosen: ${world.windStrength}`);
  real += 20 * 60000;   // 00:10 the next day
  for (let s = 0; s < 120; s++) world.update(1);
  assert.equal(Wind.dayAt(world.place, world.skyClock.now()), '2026-11-15');
  assert.ok(Math.abs(world.windStrength - 0.9) < 0.01, `still chosen: ${world.windStrength}`);
});

test('Settings: old saves of the wind ("auto" or a bare number) and damaged ones become Auto; an old choice with a day keeps its strength', () => {
  const load = wind => new Settings({ storage: { getItem: () => JSON.stringify({ wind }), setItem() {} } }).get('wind');
  for (const old of ['auto', 0.7, 'gale', { mode: 'fixed', strength: 3, day: DAY }, { mode: 'fixed', strength: 'x' }]) assert.deepEqual(load(old), AUTO, JSON.stringify(old));
  assert.deepEqual(load(fixed(0.5)), fixed(0.5));
  assert.deepEqual(load({ mode: 'fixed', strength: 0.5, day: '2026-11-13' }), fixed(0.5), 'the day is dropped');
});

test('Shader: whitecap crests and trails, and the surf, are all scaled by the sea strength (so calm is today\'s sea)', () => {
  const lines = FRAGMENT_SHADER.split('\n');
  const start = lines.findIndex(l => /if \(u_waves\.x > 1\.5 && wl \* u_wind\.w > 0\.001\)/.test(l));
  assert.ok(start > 0, 'whitecaps only when it blows and the device is fast');
  const end = lines.findIndex((l, i) => i > start && /^\s*}\s*$/.test(l));
  const block = lines.slice(start, end).join('\n');
  assert.match(block, /float foam = max\(crest[^;]*trail[^;]*\)/, 'foam is made of the crest and its trail');
  assert.match(block, /mix\(col, c_foam, foam \* max\(smoothstep\(0\.0, 0\.2, ws\)[^;]*0\.36 \* wl\)/, 'the foam is multiplied by (a ramp of) the sea strength, or the light-wind ramp');
  assert.equal((block.match(/noise\(/g) || []).length, 2, 'at most two noise calls for the caps');
  assert.match(FRAGMENT_SHADER, /float surf = ws \*/, 'the surf grows from the sea strength');
  assert.match(FRAGMENT_SHADER, /\* surf \* 0\.85\)/, 'the beach band is multiplied by it');
});

// The waves setting (#186): Off, Original (the default), Crescents, Dashes.
const OLD_SPARKLE = "  col = mix(col, c_foam, step(0.9965, h2) * rs * step(0.04, sd) * (0.5 + 0.5 * sin(t * 1.5 + h2 * 40.0)) * 0.75);";

test('Settings: the waves are Original for a new viewer; a choice lasts; an unknown one becomes Original', () => {
  assert.equal(new Settings({ storage: null }).get('waves'), 'original');
  let saved = null;
  const storage = { getItem: () => saved, setItem: (k, v) => { saved = v; } };
  new Settings({ storage }).set({ waves: 'crescents' });
  assert.equal(new Settings({ storage }).get('waves'), 'crescents', 'it survives a reload');
  const load = waves => new Settings({ storage: { getItem: () => JSON.stringify({ waves }), setItem() {} } }).get('waves');
  for (const w of WAVES) assert.equal(load(w), w);
  for (const bad of ['storm', 2, null, {}]) assert.equal(load(bad), 'original', JSON.stringify(bad));
  const s = new Settings({ storage: null }); s.set({ waves: 'zigzag' });
  assert.equal(s.get('waves'), 'original');
});

test('Dialog: a Waves select (UI kit classes) with Off, Original, Crescents, Dashes', () => {
  const html = SettingsDialog.markup();
  const select = html.match(/<select class="a-input" id="set-waves">(.*?)<\/select>/);
  assert.ok(select, 'a kit select');
  assert.match(html, /<label class="a-label" for="set-waves">Waves<\/label>/);
  assert.deepEqual([...select[1].matchAll(/value="([^"]+)"/g)].map(m => m[1]), [...WAVES]);
});

test('Shader: a waves uniform picks Off, Original, Crescents or Dashes', () => {
  assert.match(FRAGMENT_SHADER, /uniform vec2 u_waves;/);
  assert.deepEqual(WAVE_STYLES, { off: 0, original: 1, crescents: 2, dashes: 3 });
  const lines = FRAGMENT_SHADER.split('\n'), at = lines.indexOf(OLD_SPARKLE);
  assert.ok(at > 0, 'Original keeps the old twinkling dots, line for line');
  assert.match(lines[at - 1], /^\s*if \(u_waves\.x > 0\.5 && u_waves\.x < 1\.5\)$/, 'only Original draws them (not Off, not the crests)');
  assert.match(FRAGMENT_SHADER, /if \(u_waves\.x > 1\.5 && wl \* u_wind\.w > 0\.001\)/, 'crests only for Crescents and Dashes');
  assert.match(FRAGMENT_SHADER, /dc\.x \+= step\(u_waves\.x, 2\.5\) \*[^;]*dc\.y \* dc\.y;/, 'Crescents bend the crest; Dashes stay straight');
  assert.match(FRAGMENT_SHADER, /float surf = ws \* step\(0\.5, u_waves\.x\)/, 'Off: no wind surf');
  const backdrop = new Backdrop({ getContext: () => null });
  for (const [name, n] of Object.entries(WAVE_STYLES)) { backdrop.setWind(fresh(fixed(0.2)), 1, name); assert.equal(backdrop.waves[0], n); }
  backdrop.setWind(fresh(fixed(0.2)), 1, 'zigzag'); assert.equal(backdrop.waves[0], 1, 'unknown: Original');
  assert.ok(Math.abs(backdrop.waves[1] - fresh(fixed(0.2)).strength) < 1e-6, 'the shader gets the wind strength itself');
});

test('Wind: with Crescents or Dashes a light wind already has a few small faint crests; more, bigger and whiter up to a storm', () => {
  const light = fresh(fixed(0.2)).strength;   // a light Auto-like day
  for (const w of ['crescents', 'dashes']) {
    const c = Wind.crests(light, w);
    assert.ok(c.density > 0 && c.density <= 0.06, `${w} density ${c.density}`);
    assert.ok(c.opacity >= 0.3 && c.opacity <= 0.4, `${w} opacity ${c.opacity}`);
    assert.ok(c.size < Wind.crests(0.9, w).size, 'smaller than in a storm');
    let last = Wind.crests(0, w);
    assert.equal(last.density, 0, 'dead calm: none');
    for (let s = 0.01; s <= 0.905; s += 0.01) {
      const now = Wind.crests(s, w);
      for (const k of ['density', 'size', 'opacity']) assert.ok(now[k] >= last[k] - 1e-9 && now[k] - last[k] < 0.06, `${k} grows smoothly at ${s}`);
      last = now;
    }
    const storm = Wind.crests(0.9, w), ws = (0.9 - 0.12) / 0.88;
    assert.ok(Math.abs(storm.density - (ws - 0.15) * 1.2) < 1e-9 && Math.abs(storm.size - (0.6 + 0.6 * ws)) < 1e-9, 'a storm looks as it did');
  }
  for (const w of ['off', 'original']) for (const s of [0.2, 0.9]) assert.equal(Wind.crests(s, w).density, 0, `${w} has no crests`);
});
