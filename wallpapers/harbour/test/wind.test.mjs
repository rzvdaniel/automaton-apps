import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wind } from '../public/js/engine/wind.js';
import { Weather } from '../public/js/sky/weather.js';
import { Backdrop, WAVE_STYLES } from '../public/js/engine/backdrop.js';
import { FRAGMENT_SHADER } from '../public/js/engine/shader-source.js';
import { Settings, WAVES } from '../public/js/sky/settings.js';
import { SettingsForm } from '../public/js/ui/settings-form.js';
import { World } from '../public/js/engine/world.js';
import { WindSwirls } from '../public/js/engine/wind-swirls.js';
import { Renderer } from '../public/js/engine/renderer.js';
import { LAYERS } from '../public/js/engine/scene.js';
import { quietly, fakeContext } from './helpers.mjs';

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
  assert.deepEqual(load(fixed(0.4)), fixed(0.4));
  assert.deepEqual(load(fixed(0.5)), fixed(0.4), 'an old strength snaps to the nearest of calm, windy, stormy');
  assert.deepEqual(load({ mode: 'fixed', strength: 0.4, day: '2026-11-13' }), fixed(0.4), 'the day is dropped');
});

test('Shader: whitecap crests and trails, and the surf, are all scaled by the sea strength (so calm is today\'s sea)', () => {
  const lines = FRAGMENT_SHADER.split('\n');
  const start = lines.findIndex(l => /if \(u_waves\.x > 1\.5 && wl \* u_wind\.w > 0\.001\)/.test(l));
  assert.ok(start > 0, 'whitecaps only when it blows and the device is fast');
  const end = lines.findIndex((l, i) => i > start && /^\s*}\s*$/.test(l));
  const block = lines.slice(start, end).join('\n');
  assert.match(block, /float foam = max\(crest[^;]*trail[^;]*\)/, 'foam is made of the crest and its trail');
  assert.match(block, /mix\(col, g_foam, foam \* max\(smoothstep\(0\.0, 0\.2, ws\)[^;]*0\.48 \* wl\)/, 'the foam is multiplied by (a ramp of) the sea strength, or the light-wind ramp');
  assert.equal((block.match(/noise\(/g) || []).length, 2, 'at most two noise calls for the caps');
  assert.match(FRAGMENT_SHADER, /float surf = ws \*/, 'the surf grows from the sea strength');
  assert.match(FRAGMENT_SHADER, /\* surf \* 0\.85\)/, 'the beach band is multiplied by it');
});

// The waves setting (#186): Off, Original (the default), Crescents, Dashes.
const OLD_SPARKLE = "  col = mix(col, g_foam, step(0.9965, h2) * rs * step(0.04, sd) * (0.5 + 0.5 * sin(t * 1.5 + h2 * 40.0)) * 0.75);";

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

test('Panel: a Waves row of round buttons for Off, Original, Crescents, Dashes', () => {
  const html = SettingsForm.markup();
  const row = html.match(/<div class="icon-row" id="set-waves"[^>]*>(.*?)<\/div>/s);
  assert.ok(row, 'a row');
  assert.match(html, /<span class="a-label" id="set-lbl-waves">Waves<\/span>/);
  assert.deepEqual([...row[1].matchAll(/data-value="([^"]+)"/g)].map(m => m[1]), [...WAVES]);
});

test('Shader: a waves uniform picks Off, Original, Crescents or Dashes', () => {
  assert.match(FRAGMENT_SHADER, /uniform vec2 u_waves;/);
  assert.deepEqual(WAVE_STYLES, { off: 0, original: 1, crescents: 2, dashes: 3 });
  const lines = FRAGMENT_SHADER.split('\n'), at = lines.indexOf(OLD_SPARKLE);
  assert.ok(at > 0, 'Original keeps the old twinkling dots, line for line');
  assert.match(lines[at + 1], /^\s*}$/, 'in braces');
  assert.match(lines[at - 1], /^\s*if \(u_waves\.x > 0\.5 && u_waves\.x < 1\.5\) \{$/, 'only Original draws them (not Off, not the crests)');
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
    assert.ok(c.density > 0 && c.density >= 0.15 && c.density <= 0.2, `${w} density ${c.density}`);
    assert.ok(c.opacity >= 0.45 && c.opacity <= 0.5, `${w} opacity ${c.opacity}`);
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

// ----- the wind shows as swirls -----
const CALM_WIND = Wind.CALM, WINDY = Wind.CALM + (Wind.STORMY - Wind.CALM) * 0.4, STORM = Wind.STORMY;   // the three chosen winds
const blowing = (strength, vector = [1, 0]) => ({ strength, vector });
/** Runs the swirls for `seconds` in a 1.5 x 1 view and returns how many were in the air at each step. */
function airborne(swirls, wind, seconds, each = () => {}) {
  const counts = [];
  for (let t = 0; t < seconds; t += 1 / 30) { swirls.update(1 / 30, wind, 0.75, 0.5); counts.push(swirls.active); each(); }
  return counts;
}

test('WindSwirls: none when calm, a few when windy, many in a storm', () => {
  assert.equal(WindSwirls.countFor(CALM_WIND), 0);
  assert.equal(WindSwirls.countFor(WindSwirls.START), 0);
  const few = WindSwirls.countFor(WINDY), many = WindSwirls.countFor(STORM);
  assert.ok(few >= 3 && few <= 7, `windy: ${few}`);
  assert.ok(many >= 2 * few && many <= WindSwirls.POOL, `stormy: ${many}`);
  for (let s = 0, last = 0; s <= 1; s += 0.01) { const n = WindSwirls.countFor(s); assert.ok(n >= last, 'never fewer in a stronger wind'); last = n; }

  assert.ok(airborne(new WindSwirls(), blowing(CALM_WIND), 60).every(n => n === 0), 'a calm minute: not one');
  const windy = airborne(new WindSwirls(), blowing(WINDY), 120).slice(300), stormy = airborne(new WindSwirls(), blowing(STORM), 120).slice(300);
  assert.ok(average(windy) > 1.5 && average(windy) <= few, `windy: about ${average(windy).toFixed(1)} at once`);
  assert.ok(average(stormy) > 2 * average(windy), `stormy: about ${average(stormy).toFixed(1)} at once`);
  assert.ok(Math.max(...windy) <= few && Math.max(...stormy) <= many, 'never more than the wind asks for');
});

test('WindSwirls: stronger wind makes them longer, faster and shorter-lived (1.5 to 3 seconds)', () => {
  assert.ok(WindSwirls.driftFor(STORM) > 2 * WindSwirls.driftFor(WINDY));
  for (const strength of [0.2, WINDY, 0.6, STORM, 1]) for (const vary of [0, 0.5, 1]) {
    const life = WindSwirls.lifeFor(strength, vary);
    assert.ok(life >= 1.5 && life <= 3, `strength ${strength}: lives ${life} s`);
  }
  assert.ok(WindSwirls.lifeFor(STORM) < WindSwirls.lifeFor(WINDY));
  const reach = strength => { const swirls = new WindSwirls(); airborne(swirls, blowing(strength), 30); return average(swirls.pool.filter(s => s.reach > 0).map(s => s.reach)); };
  assert.ok(reach(STORM) > 1.3 * reach(WINDY), 'longer in a storm');
});

test('WindSwirls: they run and drift the way the wind blows, whichever way that is', () => {
  for (const angle of [0, 0.7, 2.2, 3.6, 5.5]) {
    const wind = new Wind(); wind.setAngle(angle); wind.strength = STORM;
    const swirls = new WindSwirls(), [wx, wy] = wind.vector;
    airborne(swirls, wind, 20);
    const live = swirls.pool.filter(s => s.live);
    assert.ok(live.length > 5);
    for (const s of live) {
      assert.ok(s.vx * wx + s.vy * wy > 0, 'it drifts downwind');
      const cross = Math.abs(s.vx * wy - s.vy * wx) / Math.hypot(s.vx, s.vy) / Math.hypot(wx, wy);
      assert.ok(cross < 1e-6, `straight downwind (angle ${angle})`);
      // the straight run (the first six tenths of its points) heads downwind too
      const i = 30, dx = s.points[i * 2] - s.points[0], dy = s.points[i * 2 + 1] - s.points[1];
      assert.ok((dx * wx + dy * wy) / Math.hypot(dx, dy) / Math.hypot(wx, wy) > 0.9, `its run follows the wind (angle ${angle})`);
    }
  }
});

test('WindSwirls: a line that runs out, curls into a loop at its end, then shrinks and fades', () => {
  const swirls = new WindSwirls(); airborne(swirls, blowing(WINDY), 10);
  for (const s of swirls.pool.filter(one => one.reach > 0)) {
    // how far the line turns in all: little along the run, a full loop at the end
    const turned = (from, to) => { let sum = 0; for (let i = from + 1; i < to; i++) { const a = Math.atan2(s.points[i * 2 + 1] - s.points[i * 2 - 1], s.points[i * 2] - s.points[i * 2 - 2]), b = Math.atan2(s.points[i * 2 + 3] - s.points[i * 2 + 1], s.points[i * 2 + 2] - s.points[i * 2]); sum += Math.atan2(Math.sin(b - a), Math.cos(b - a)); } return Math.abs(sum); };
    assert.ok(turned(0, 30) < 1, `the run is nearly straight (${turned(0, 30).toFixed(2)} rad)`);
    assert.ok(turned(32, 55) > 5.5, `the end curls right round (${turned(32, 55).toFixed(2)} rad)`);
    const ys = Array.from({ length: 56 }, (_, i) => s.points[i * 2 + 1]), xs = Array.from({ length: 56 }, (_, i) => s.points[i * 2]);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= s.reach && Math.max(...ys) - Math.min(...ys) <= s.reach, 'it stays within its reach (the renderer skips it by that)');
  }
  const part = [0, 0, 0], at = p => [...WindSwirls.shown(p, part)];
  assert.deepEqual(at(0), [0, 0, 0], 'it starts as nothing');
  let longest = 0, when = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const [back, front, opacity] = at(Math.min(1, p));
    assert.ok(back <= front + 1e-9 && back >= 0 && front <= 1 && opacity >= 0 && opacity <= 1, `at ${p.toFixed(2)}: ${back}..${front}, ${opacity}`);
    if (front - back > longest) { longest = front - back; when = p; }
  }
  assert.ok(longest > 0.6 && when > 0.2 && when < 0.6, `the trail is longest (${longest.toFixed(2)}) part-way (${when.toFixed(2)})`);
  const end = at(1); assert.ok(end[1] - end[0] < 1e-9 && end[2] === 0, 'and ends as nothing, drawn up into its loop');
  assert.ok(at(0.8)[0] > 0.3 && at(0.8)[1] === 1, 'late on only the curl is left');
});

test('WindSwirls: one small pool made once: nothing new while it runs, and the wind dropping lets them finish', () => {
  const swirls = new WindSwirls(), pool = swirls.pool, slots = [...pool], buffers = pool.map(s => s.points), part = swirls.part;
  assert.equal(pool.length, WindSwirls.POOL);
  const c = fakeContext(); let strokes = 0; c.stroke = () => { strokes++; };
  airborne(swirls, blowing(STORM), 60, () => swirls.draw(c, 1, 1000, 0, null));
  assert.ok(strokes > 1000, 'they were drawn');
  assert.ok(swirls.pool === pool && pool.every((s, i) => s === slots[i] && s.points === buffers[i]) && swirls.part === part, 'the same swirls and the same points all along');
  assert.ok(Object.keys(pool[0]).length === 9, 'and nothing was hung on them');
  assert.ok(swirls.active > 5);
  const after = airborne(swirls, blowing(CALM_WIND), 4);
  assert.ok(after[0] > 0, 'those in the air are not cut off');
  assert.equal(after.at(-1), 0, 'but three seconds on they are gone, and no new ones came');
  swirls.update(1, blowing(STORM), 0.75, 0.5); assert.ok(swirls.active > 0);
  swirls.clear(); assert.equal(swirls.active, 0);
});

test('WindSwirls: thin, white and faint; softer at night; skipped when off screen; nothing drawn when calm', () => {
  const draw = (swirls, ...how) => {
    const seen = [], c = fakeContext();
    c.stroke = () => seen.push({ alpha: c.globalAlpha, width: c.lineWidth, style: c.strokeStyle });
    swirls.draw(c, ...how);
    return seen;
  };
  const swirls = new WindSwirls(); airborne(swirls, blowing(STORM), 20);
  const day = draw(swirls, 1, 1000, 0, null), night = draw(swirls, 1, 1000, 1, null);
  assert.ok(day.length > 5 && day.length <= 2 * WindSwirls.POOL, `at most two strokes a swirl (${day.length})`);
  assert.ok(day.every(s => s.style === '#fff' && s.alpha > 0 && s.alpha <= 0.3), 'white, low opacity');
  assert.ok(day.every(s => s.width * 1000 >= 1.2 && s.width * 1000 <= 2), `thin: ${day[0].width * 1000} px`);
  assert.equal(night.length, day.length);
  night.forEach((s, i) => assert.ok(s.alpha < day[i].alpha * 0.75, 'softer at night'));
  assert.ok(draw(swirls, 8, 8000, 0, null)[0].width * 8000 < 8 * day[0].width * 1000 / 2, 'zoomed in, the line does not thicken as much as the picture grows');
  assert.ok(draw(swirls, 1, 300, 0, null)[0].width * 300 >= 1.19, 'on a small screen it is still about a pixel');
  assert.equal(draw(swirls, 1, 1000, 0, { minX: 50, maxX: 51, minY: 50, maxY: 51 }).length, 0, 'none in view: none drawn');
  assert.equal(draw(new WindSwirls(), 1, 1000, 0, null).length, 0);
});

test('World: owns the swirls, runs them with its wind and forgets them with the island', () => {
  const settings = new Settings({ storage: null }); settings.set({ wind: fixed(1) });
  const world = quietly(() => { const w = new World({ width: 1500, height: 1000, settings }); w.skyClock.realNow = () => START; w.generate(7); return w; });
  assert.ok(world.swirls instanceof WindSwirls);
  for (let i = 0; i < 600; i++) world.update(1 / 30);
  assert.ok(world.swirls.active > 5, `a stormy wind fills the air (${world.swirls.active})`);
  const [wx, wy] = world.wind;
  for (const s of world.swirls.pool.filter(one => one.live)) assert.ok(s.vx * wx + s.vy * wy > 0);
  quietly(() => world.generate(8));
  assert.equal(world.swirls.active, 0, 'a new island starts with a clear air');
  settings.set({ wind: fixed(0) });
  for (let i = 0; i < 900; i++) world.update(1 / 30);
  assert.equal(world.swirls.active, 0, 'and a calm one stays clear');
});

test('Renderer: the swirls are drawn with the effects: above land, sea and what stands on them, below cloud shadows, birds and clouds', () => {
  const order = [];
  const scene = { drawLayer: name => order.push(name) }, swirls = { draw: (...a) => order.push(['swirls', ...a]) };
  const c = fakeContext(), view = { width: 1500, height: 1000, scale: 1000, quality: 1, dpr: 1, glScale: 1 };
  const real = globalThis.document, part = () => ({ style: {}, setAttribute() {}, appendChild() {} });
  globalThis.document = { createElement: () => ({ ...part(), width: 1500, height: 1000, getContext: kind => kind === '2d' ? c : null }), createElementNS: part, body: part() };   // a page with no WebGL
  try {
    const renderer = new Renderer(part());
    renderer.render({ viewport: view, camera: { zoom: 2, centreX: 0, centreY: 0, applyTo() {} }, terrain: { map: { land: [] } }, effects: { ripples: [], draw: () => order.push('effects.draw') }, swirls, scene, time: 0, darkness: 0 });
  } finally { globalThis.document = real; }
  const at = order.findIndex(o => Array.isArray(o));
  assert.equal(order[at - 1], 'effects.draw');
  assert.deepEqual(order.slice(at + 1, at + 5), ['effects', 'skyShadow', 'birds', 'clouds']);
  assert.ok(LAYERS.indexOf('air') < LAYERS.indexOf('effects'));
  const [, ctx, zoom, pixels, darkness, seen] = order[at];
  assert.equal(ctx, c); assert.equal(zoom, 2); assert.equal(pixels, 2000); assert.equal(darkness, 0);
  assert.deepEqual(seen, { minX: -0.375, maxX: 0.375, minY: -0.25, maxY: 0.25 });
});
