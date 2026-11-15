import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sun } from '../public/js/sky/sun.js';
import { Sky } from '../public/js/sky/sky.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Entity } from '../public/js/core/entity.js';
import { readFileSync } from 'node:fs';
import { Backdrop } from '../public/js/engine/backdrop.js';

// Bucharest on 14 November 2026 (winter time, UTC+2). Local 9:00 is 07:00 UTC.
const BUCHAREST = { lat: 44.43, lon: 26.1 };
const at = (hours, minutes = 0) => new Date(Date.UTC(2026, 10, 14, hours - 2, minutes));
const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual.toFixed(2)}, expected ${expected} +- ${within}`);
const angleOf = s => (Math.atan2(s.x, -s.y) * 180 / Math.PI + 360) % 360;   // compass direction of a screen step (north up, east right)

// Reference: timeanddate.com, "Bucharest, Romania - Sunrise, Sunset, and Daylength, November 2026", the row for 14 November:
// sunrise 7:10 at 115 degrees, sunset 16:49 at 245 degrees, solar noon 12:00 at 27.3 degrees. (At sunrise and sunset the
// geometric altitude is about -0.83 degrees: refraction and the sun's radius lift it into view.) The 9:00 and 16:00 values are
// those of the USNO low-precision formula Sun uses, which meets every reference point above within 0.1 degrees.
test('Sun: Bucharest, 14 November 2026, against the published sunrise, noon and sunset', () => {
  const rise = Sun.position(at(7, 10), BUCHAREST.lat, BUCHAREST.lon);
  near(rise.azimuth, 115, 1, 'sunrise azimuth'); near(rise.altitude, -0.83, 1, 'sunrise altitude');
  const noon = Sun.position(at(12), BUCHAREST.lat, BUCHAREST.lon);
  near(noon.azimuth, 180, 1, 'noon azimuth'); near(noon.altitude, 27.3, 1, 'noon altitude');
  const set = Sun.position(at(16, 49), BUCHAREST.lat, BUCHAREST.lon);
  near(set.azimuth, 245, 1, 'sunset azimuth'); near(set.altitude, -0.83, 1, 'sunset altitude');
});

test('Sun: Bucharest, 14 November 2026 at 9:00 and 16:00', () => {
  const nine = Sun.position(at(9), BUCHAREST.lat, BUCHAREST.lon);
  near(nine.azimuth, 135.9, 1, '9:00 azimuth'); near(nine.altitude, 15.1, 1, '9:00 altitude');
  const four = Sun.position(at(16), BUCHAREST.lat, BUCHAREST.lon);
  near(four.azimuth, 235.9, 1, '16:00 azimuth'); near(four.altitude, 6.8, 1, '16:00 altitude');
});

test('Sky: gives the sun for a place', () => {
  const { sun } = new Sky().at(at(12), BUCHAREST);
  near(sun.altitude, 27.3, 1, 'altitude');
});

test('DayCycle: shadows point north-west at 9:00, north at noon, north-east at 16:00, shortest at noon', () => {
  const day = new DayCycle(), shadow = h => ({ ...day.update(at(h), BUCHAREST).shadow, phase: day.phase });
  const nine = shadow(9), noon = shadow(12), four = shadow(16);
  near(angleOf(nine), 315.9, 1, '9:00 direction'); near(angleOf(noon), 0, 1, 'noon direction'); near(angleOf(four), 55.9, 1, '16:00 direction');
  assert.ok(noon.y < 0 && Math.abs(noon.x) < 0.01, 'at noon the shadow points straight up the screen');
  assert.ok(nine.x < 0 && nine.y < 0 && four.x > 0 && four.y < 0, 'up-left in the morning, up-right in the afternoon');
  assert.ok(noon.length < nine.length && nine.length <= four.length, 'longer when the sun is lower');
  assert.ok(four.length <= DayCycle.MAX_LENGTH, 'capped');
  for (const s of [nine, noon, four]) { assert.equal(s.phase, 'day'); near(s.strength, 1, 0.01, 'strength by day'); near(Math.hypot(s.x, s.y), s.length, 1e-9, 'length'); }
});

test('DayCycle: night is dark and has no shadows; dusk is in between', () => {
  const day = new DayCycle();
  day.update(at(23), BUCHAREST);
  assert.equal(day.phase, 'night'); assert.equal(day.darkness, 1); assert.equal(day.shadow.strength, 0);
  day.update(at(17, 0), BUCHAREST);
  assert.equal(day.phase, 'dusk'); assert.ok(day.darkness > 0 && day.darkness < 1, `dusk darkness ${day.darkness}`);
  day.update(at(7, 0), BUCHAREST);
  assert.equal(day.phase, 'dawn');
  day.update(at(12), BUCHAREST);
  assert.equal(day.darkness, 0);
});

test('Entity.castShadow: scales world.day.shadow by the lift and turns it into a rotated frame', () => {
  const e = new Entity({ day: { shadow: { x: 1, y: -2, strength: 0.5 } } });
  assert.deepEqual(e.castShadow(0.1), { x: 0.1, y: -0.2, a: 0.5 });
  const turned = e.castShadow(1, Math.PI / 2);   // a frame turned a quarter clockwise sees the same step turned back
  near(turned.x, -2, 1e-9, 'x'); near(turned.y, -1, 1e-9, 'y');
});

test('Cloud: its shadow stays within 1.5 x its lift of it at 16:00, when ground shadows are longer', async () => {
  const { Cloud } = await import('../public/js/entities/cloud.js');
  const day = new DayCycle().update(at(16), BUCHAREST);
  assert.ok(day.shadow.length > 1.5, 'ground shadows are long at 16:00');
  const cloud = Object.assign(Object.create(Cloud.prototype), { world: { day }, x: 0, y: 0, r: 1, scale: 1, alpha: 1, puffs: [{ x: 0, y: 0, r: 0.1 }] });
  let centre; const c = new Proxy({}, { get: (t, k) => k === 'arc' ? (x, y) => { centre = [x, y]; } : () => {}, set: () => true });
  cloud.drawShadow(c);
  assert.ok(Math.hypot(...centre) <= 1.5 * 0.088 + 1e-12, `offset ${Math.hypot(...centre)}`);
  near(Math.atan2(centre[0], -centre[1]), Math.atan2(day.shadow.x, -day.shadow.y), 1e-9, 'same direction as the sun gives');
});

// ---------- the moon and the light (#159) ----------
// Reference: U.S. Naval Observatory, "Phases of the Moon" for 2026 (also timeanddate.com, "Moon Phases 2026"):
// new moon 9 November 07:02 UTC, first quarter 17 November 11:48 UTC, full moon 24 November 14:53 UTC.
const { Moon } = await import('../public/js/sky/moon.js');
const { Lighting } = await import('../public/js/engine/lighting.js');
const utc = (day, hours, minutes = 0) => new Date(Date.UTC(2026, 10, day, hours, minutes));

test('Moon: lit fraction at the published new moon, first quarter and full moon of November 2026', () => {
  near(Moon.position(utc(9, 7, 2), BUCHAREST.lat, BUCHAREST.lon).fraction, 0, 0.01, 'new moon');
  const quarter = Moon.position(utc(17, 11, 48), BUCHAREST.lat, BUCHAREST.lon);
  near(quarter.fraction, 0.5, 0.02, 'first quarter'); assert.equal(quarter.waxing, true);
  near(Moon.position(utc(24, 14, 53), BUCHAREST.lat, BUCHAREST.lon).fraction, 1, 0.01, 'full moon');
  assert.equal(Moon.position(utc(28, 0), BUCHAREST.lat, BUCHAREST.lon).waxing, false, 'shrinking after full');
});

test('Moon: a full moon is high in the south at midnight and down at noon', () => {
  const midnight = Moon.position(utc(24, 22), BUCHAREST.lat, BUCHAREST.lon);   // local midnight, 25 November
  assert.ok(midnight.altitude > 50, `altitude ${midnight.altitude}`); near(midnight.azimuth, 180, 20, 'azimuth');
  assert.ok(Moon.position(utc(24, 10), BUCHAREST.lat, BUCHAREST.lon).altitude < 0, 'below the horizon at noon');
});

test('Sky: reports the sun and the moon', () => {
  const { sun, moon } = new Sky().at(at(12), BUCHAREST);
  assert.ok(Number.isFinite(sun.altitude) && Number.isFinite(moon.altitude) && moon.fraction >= 0 && moon.fraction <= 1);
});

test('DayCycle: the light is warm at dawn, white at noon, golden in the evening and blue at midnight', () => {
  const day = new DayCycle(), light = date => ({ ...day.update(date, BUCHAREST).light });
  const dawn = light(at(7, 20)), noon = light(at(12)), evening = light(at(16, 30)), midnight = light(at(24));
  assert.deepEqual({ ...noon, offset: [...noon.offset], moon: 0 }, { r: 1, g: 1, b: 1, grey: 0, offset: [0, 0, 0], night: 0, moon: 0, phases: [1, 0, 0, 0] }, 'plain daylight at noon');
  assert.ok(Lighting.isPlain(noon), 'no filter by day');
  assert.ok(dawn.r > dawn.g && dawn.g >= dawn.b * 0.95 && dawn.r < 1, `dawn warm and soft ${JSON.stringify(dawn)}`);
  assert.ok(evening.r > evening.g && evening.g > evening.b && evening.r - evening.b > 0.15, `evening a mild warm tint ${JSON.stringify(evening)}`);
  assert.ok(midnight.b > midnight.g && midnight.g > midnight.r, `night blue ${JSON.stringify(midnight)}`);
  assert.ok(midnight.r > 0.7 && midnight.b <= 1, 'a mild light: the backdrop has its own night colours');
  assert.deepEqual([...midnight.offset], [0, 0, 0], 'no offset');
  assert.ok(!Lighting.isPlain(midnight) && midnight.night === 1 && noon.night === 0, 'the night palette is fully on at midnight, off at noon');
  assert.ok(midnight.grey > 0 && noon.grey === 0, 'colour fades at night');
});

test('DayCycle: the light is plain from 10 degrees up, and still golden at 6 degrees in the evening', () => {
  for (const alt of [12, 15]) for (const morning of [true, false]) {
    const l = DayCycle.lightAt(alt, morning, 0);
    assert.deepEqual({ ...l, offset: [...l.offset] }, { r: 1, g: 1, b: 1, grey: 0, offset: [0, 0, 0], night: 0, moon: 0, phases: [1, 0, 0, 0] }, `${alt} degrees, morning ${morning}`);
    assert.ok(Lighting.isPlain(l));
  }
  const evening = DayCycle.lightAt(6, false, 0);
  assert.ok(evening.r > evening.g && evening.g > evening.b, `golden ${JSON.stringify(evening)}`);
});

test('DayCycle: a night with a full moon is brighter than one with a new moon', () => {
  const day = new DayCycle(), brightness = l => l.r + l.g + l.b;
  const full = brightness(day.update(utc(24, 22), BUCHAREST).light);   // full moon, high up
  assert.ok(day.moonlight > 0.8, `moonlight ${day.moonlight}`);
  const none = brightness(day.update(utc(9, 22), BUCHAREST).light);    // new moon
  assert.ok(day.moonlight < 0.02, `moonlight ${day.moonlight}`);
  assert.equal(day.phase, 'night');
  assert.ok(full > none * 1.05, `full ${full} vs new ${none}`);
});

const luma3 = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const GROUND = [['sand', [0.957, 0.922, 0.882], [0.62, 0.64, 0.74]], ['grass', [0.663, 0.824, 0.467], [0.30, 0.50, 0.47]], ['sea', [0.086, 0.682, 0.816], [0.07, 0.25, 0.48]]];

test('DayCycle: the night light is mild, dawn and dusk blend into it without a jump, and the ground never gets brighter on screen as the sun sets', () => {
  const dark = DayCycle.lightAt(-30, true, 0), moon = DayCycle.lightAt(-30, true, 1), luma = l => 0.299 * l.r + 0.587 * l.g + 0.114 * l.b;
  assert.deepEqual([dark.r, dark.g, dark.b, dark.grey], [0.78, 0.82, 0.95, 0.1]);
  assert.deepEqual([moon.r, moon.g, moon.b].map(v => +v.toFixed(2)), [0.88, 0.92, 1]);
  assert.deepEqual([dark.night, dark.moon, moon.moon], [1, 0, 1]);
  for (const morning of [true, false]) for (const moonlight of [0, 1]) {
    let prev = DayCycle.lightAt(15, morning, moonlight);
    for (let alt = 14.5; alt >= -20; alt -= 0.5) {
      const l = DayCycle.lightAt(alt, morning, moonlight);
      for (const [a, b] of [[l.r, prev.r], [l.g, prev.g], [l.b, prev.b], [l.grey, prev.grey]]) {
        assert.ok(Math.abs(a - b) < 0.06, `jump at ${alt} degrees (morning ${morning}, moon ${moonlight}): ${a} vs ${b}`);
      }
      prev = l;
    }
    // what reaches the eye (the light times the ground colour, blended into the night colour as the shader does) never gets brighter
    for (const [name, c, n] of GROUND) {
      let prevLuma = Infinity;
      for (let alt = 10; alt >= -12; alt -= 0.5) {
        const l = DayCycle.lightAt(alt, morning, moonlight), k = [l.r, l.g, l.b];
        const y = luma3(c.map((v, i) => (1 - l.night) * k[i] * v + l.night * n[i] * (1 + 0.15 * moonlight)));
        assert.ok(y <= prevLuma + 0.01, `${name} brighter at ${alt} degrees (morning ${morning}, moon ${moonlight}): ${y} vs ${prevLuma}`);
        prevLuma = y;
      }
    }
  }
  assert.deepEqual([...DayCycle.lightAt(-12, true, 0).offset], [0, 0, 0]);
});

test('DayCycle: night is 0 by day and 1 at night, on the same curve as the light grey', () => {
  const day = new DayCycle();
  assert.equal(day.update(at(12), BUCHAREST).night, 0);
  assert.equal(day.update(at(24), BUCHAREST).night, 1);
  assert.equal(day.light.night, 1);
  for (const alt of [4, 0, -3, -6, -9, -12]) { const l = DayCycle.lightAt(alt, false, 0); assert.ok(Math.abs(l.grey - 0.1 * l.night) < 1e-12, `${alt}`); }
});

test('DayCycle: at night the moon casts faint shadows away from it; none when it is down', () => {
  const day = new DayCycle();
  day.update(utc(24, 22), BUCHAREST);   // full moon high in the south: shadows point north, short and faint
  assert.equal(day.phase, 'night');
  assert.ok(day.shadow.strength > 0.1 && day.shadow.strength <= DayCycle.MOON_SHADOW, `strength ${day.shadow.strength}`);
  near(angleOf(day.shadow), (day.moon.azimuth + 180) % 360, 1, 'away from the moon');
  assert.ok(day.shadow.y < 0 && day.shadow.length < 1, 'up the screen, short');
  day.update(at(23), BUCHAREST);        // 14 November: the young moon has set
  assert.ok(day.moon.altitude < 0); assert.equal(day.shadow.strength, 0);
});

test('Lighting: the matrix is the identity by day, multiplies by the light, and drains colour by grey', () => {
  assert.deepEqual(Lighting.matrix({ r: 1, g: 1, b: 1, grey: 0 }), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(Lighting.matrix({ r: 0.5, g: 0.25, b: 1, grey: 0 }), [0.5, 0, 0, 0, 0.25, 0, 0, 0, 1]);
  const grey = Lighting.matrix({ r: 1, g: 1, b: 1, grey: 1 }), white = [0, 1, 2].map(row => grey.slice(row * 3, row * 3 + 3).reduce((a, b) => a + b));
  white.forEach(v => near(v, 1, 1e-9, 'white stays white'));
  near(grey[0], grey[3], 1e-12, 'every channel the same grey');
});

test('Lighting: the offset is the fifth column of the filter, part of the cache key, and plain needs it zero', () => {
  const plain = { r: 1, g: 1, b: 1, grey: 0, offset: [0, 0, 0] };
  assert.equal(Lighting.isPlain(plain), true);
  assert.equal(Lighting.isPlain({ ...plain, offset: [0, -0.01, 0] }), false);
  const set = []; const el = { setAttribute: (k, v) => { if (k === 'values') set.push(v); }, appendChild() {}, style: {} };
  const saved = globalThis.document;
  globalThis.document = { createElementNS: () => ({ ...el }), body: { appendChild() {} } };
  try {
    const lighting = new Lighting({ canvas: { style: {} }, backdrop: { setLight() {} } });
    lighting.colorMatrix = el;
    lighting.apply({ ...plain, r: 0.5, offset: [-0.08, -0.06, -0.02] });
    lighting.apply({ ...plain, r: 0.5, offset: [-0.08, -0.06, -0.01] });   // only the offset differs: must be applied
  } finally { globalThis.document = saved; }
  assert.equal(set.length, 2);
  assert.match(set[0], /^0\.5 0 0 0 -0\.08 0 1 0 0 -0\.06 0 0 1 0 -0\.02 0 0 0 1 0$/);
});

test('World: a change of time in the settings shows at once, without waiting for the clock', async () => {
  const { World } = await import('../public/js/engine/world.js');
  const { Settings } = await import('../public/js/sky/settings.js');
  const settings = new Settings({ storage: null });
  settings.set({ place: 'Europe/Bucharest', time: { mode: 'start', start: '12:00', setAt: Date.now() } });
  const world = new World({ width: 800, height: 600, settings });
  assert.equal(world.day.phase, 'day');
  world.skyClock.setStart('23:30');
  assert.equal(world.day.phase, 'night', 'refreshed by the settings change, not by update()');
  assert.ok(world.day.light.b > world.day.light.r);
  world.skyClock.setStart('12:00');
  assert.equal(world.day.phase, 'day');
});

test('DayCycle: the moon shadow is clear (0.6 at most)', () => {
  assert.equal(DayCycle.MOON_SHADOW, 0.6);
});

test('DayCycle: the moon glitter is 0 by day and when the moon is down or new, and points at the moon at night', () => {
  const day = new DayCycle();
  assert.equal(day.update(at(12), BUCHAREST).glitter.strength, 0, 'by day');
  assert.equal(day.update(at(23), BUCHAREST).glitter.strength, 0, 'moon down (young moon has set)');
  day.update(utc(24, 22), BUCHAREST);   // full moon high in the south
  const g = day.glitter;
  assert.ok(g.strength > 0.5 && g.strength <= 1, `strength ${g.strength}`);
  near(angleOf(g), day.moon.azimuth, 1, 'towards the moon');
  assert.ok(g.y > 0, 'a moon in the south is down the screen');
  assert.ok(Math.abs(Math.hypot(g.x, g.y) - 1) < 1e-9, 'a unit direction');
  const sky = { at: () => ({ sun: { azimuth: 0, altitude: -40 }, moon: { azimuth: 90, altitude: 40, fraction: 0, waxing: true } }) };
  assert.equal(new DayCycle({ sky }).update(at(24), BUCHAREST).glitter.strength, 0, 'new moon');
});

test('Backdrop: setGlitter keeps the moon uniform and repaints only on a visible change', () => {
  const backdrop = Object.create(Backdrop.prototype);
  Object.assign(backdrop, { moon: new Float32Array(3), policy: { n: 0, invalidate() { this.n++; } } });
  backdrop.setGlitter({ x: 1, y: 0, strength: 0.5 });
  backdrop.setGlitter({ x: 1, y: 0, strength: 0.5001 });
  assert.deepEqual([...backdrop.moon], [1, 0, 0.5]); assert.equal(backdrop.policy.n, 1);
});

test('shader: the moon glitter is on open sea only, on a fast device only, and added after the light', () => {
  const source = readFileSync(new URL('../public/js/engine/shader-source.js', import.meta.url), 'utf8');
  assert.match(source, /uniform vec3 u_moon/);
  const start = source.indexOf('u_moon.z > 0.001');
  assert.ok(start > 0);
  const guard = source.slice(start, start + 120);
  assert.match(guard, /u_wind\.w > 0\.5/); assert.match(guard, /sd > 0\.04/);
  assert.ok(start > source.indexOf('col = u_light * col + u_lightAdd'), 'after the light');
  const block = source.slice(start, source.indexOf("'  }',", start));
  assert.ok(!/noise\(|fbm\(/.test(block), 'no noise calls');
  assert.match(block, /hash\(/); assert.match(block, /sin\(u_time/);
});

// ----- palette sets (#211) -----
import { PALETTES, PHASES, COLOURS, paletteSet, flatten, blend } from '../public/js/sky/palettes.js';
import { Settings, DEFAULTS } from '../public/js/sky/settings.js';

test('palettes: classic day is the old daylight constants and classic night the night of #205, exactly', () => {
  const c = paletteSet('classic');
  assert.deepEqual(Object.fromEntries(COLOURS.map(n => [n, [...c.day[n]]])), {
    dry: [0.957, 0.922, 0.882], wet: [0.925, 0.863, 0.714], grass: [0.663, 0.824, 0.467], grass2: [0.455, 0.706, 0.361], shallow: [0.271, 0.827, 0.812],
    mid: [0.086, 0.682, 0.816], deep: [0.039, 0.416, 0.612], glow: [0.812, 0.933, 0.769], foam: [1, 1, 1] });
  assert.deepEqual(Object.fromEntries(COLOURS.map(n => [n, [...c.night[n]]])), {
    dry: [0.62, 0.64, 0.74], wet: [0.50, 0.54, 0.68], grass: [0.30, 0.50, 0.47], grass2: [0.22, 0.40, 0.42], shallow: [0.16, 0.42, 0.62],
    mid: [0.07, 0.25, 0.48], deep: [0.03, 0.12, 0.30], glow: [0.45, 0.62, 0.72], foam: [0.85, 0.90, 1.0] });
  assert.ok(PALETTES.length >= 2 && new Set(PALETTES.map(p => p.id)).size === PALETTES.length);
  for (const p of PALETTES) for (const ph of PHASES) for (const n of COLOURS) assert.ok(p[ph][n].length === 3 && p[ph][n].every(v => v >= 0 && v <= 1), `${p.id} ${ph} ${n}`);
  assert.equal(flatten(c).length, 108);
  assert.deepEqual([...flatten(c).slice(81, 84)].map(v => +v.toFixed(2)), [0.62, 0.64, 0.74]);
});

test('palettes: the weights sum to 1, pick the right palette and change smoothly with the sun', () => {
  for (const morning of [true, false]) {
    let prev = DayCycle.phasesAt(20, morning);
    for (let alt = 19.5; alt >= -20; alt -= 0.5) {
      const w = DayCycle.phasesAt(alt, morning);
      assert.ok(Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-12 && w.every(v => v >= 0 && v <= 1), `${alt}: ${w}`);
      w.forEach((v, i) => assert.ok(Math.abs(v - prev[i]) < 0.25, `jump at ${alt} degrees: ${v} vs ${prev[i]}`));
      prev = w;
    }
    assert.deepEqual(DayCycle.phasesAt(10, morning), [1, 0, 0, 0]);
    assert.deepEqual(DayCycle.phasesAt(-8, morning), [0, 0, 0, 1]);
    for (const alt of [2, 0, -2]) assert.deepEqual(DayCycle.phasesAt(alt, morning), morning ? [0, 1, 0, 0] : [0, 0, 1, 0]);
  }
  assert.deepEqual(new DayCycle().light.phases, [1, 0, 0, 0]);
  const day = new DayCycle();
  assert.equal(day.update(at(12), BUCHAREST).light.phases[0], 1);
  assert.equal(day.update(at(24), BUCHAREST).light.phases[3], 1);
});

test('palettes: for every set the ground never gets brighter on screen as the sun goes down, from +10 to -12 degrees', () => {
  for (const set of PALETTES) for (const morning of [true, false]) for (const moonlight of [0, 1]) for (const name of COLOURS) {
    if (moonlight && (name === 'foam' || name === 'glow')) continue;   // a bright moon may light the night's foam and glow above the dusk's: that is the approved night
    let prevLuma = Infinity;
    for (let alt = 10; alt >= -12; alt -= 0.5) {
      const l = DayCycle.lightAt(alt, morning, moonlight), w = l.phases, k = [l.r, l.g, l.b];
      const colour = i => w[0] * k[i] * set.day[name][i] + w[1] * set.sunrise[name][i] + w[2] * set.sunset[name][i] + w[3] * set.night[name][i] * (1 + 0.15 * moonlight);
      const y = luma3([0, 1, 2].map(colour));
      assert.ok(y <= prevLuma + 0.01, `${set.id} ${name} brighter at ${alt} degrees (morning ${morning}, moon ${moonlight}): ${y} vs ${prevLuma}`);
      prevLuma = y;
    }
  }
});

test('palettes: the setting defaults to classic, saves, loads and ignores a damaged value', () => {
  const store = {}, storage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  assert.equal(DEFAULTS.palette, 'classic');
  const a = new Settings({ storage }); assert.equal(a.get('palette'), 'classic');
  a.set({ palette: 'nordic' });
  assert.equal(new Settings({ storage }).get('palette'), 'nordic');
  a.set({ palette: 'nope' }); assert.equal(a.get('palette'), 'classic');
  store['harbour-settings'] = JSON.stringify({ palette: 7 });
  assert.equal(new Settings({ storage }).get('palette'), 'classic');
});

test('palettes: the backdrop sends the colours once per set, and the form offers every set', async () => {
  const backdrop = new Backdrop({ getContext: () => null });
  assert.equal(backdrop.palDirty, true);
  backdrop.palDirty = false; backdrop.setPalette('classic'); assert.equal(backdrop.palDirty, false, 'same set: nothing to send');
  backdrop.setPalette('nordic'); assert.equal(backdrop.palDirty, true);
  assert.deepEqual([...backdrop.pal], [...blend(paletteSet('nordic'))]);
  backdrop.palDirty = false;
  backdrop.setLight([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 0, 0, [0, 0, 1, 0]);
  assert.deepEqual([...backdrop.phase], [0, 0, 1, 0]);
  assert.equal(backdrop.palDirty, true, 'the blend changed with the light');
  assert.deepEqual([...backdrop.pal.slice(27, 30)], [...Float32Array.from(paletteSet('nordic').sunset.dry)]);
  backdrop.palDirty = false; backdrop.setLight([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 0, 0, [0, 0, 1, 0]); assert.equal(backdrop.palDirty, false, 'same light: nothing to send');
  const { SettingsForm } = await import('../public/js/ui/settings-form.js');
  const html = SettingsForm.markup();
  for (const p of PALETTES) assert.ok(html.includes(`data-value="${p.id}" title="${p.name}"`) && html.includes(`clipPath id="swatch-${p.id}"`), p.id);
});

test('palettes: the blend is the day palette plus the weighted rest, the moon brightening only the night part', () => {
  const c = paletteSet('classic'), noon = blend(c, [1, 0, 0, 0], 1), night = blend(c, [0, 0, 0, 1], 1), dark = blend(c, [0, 0, 0, 1], 0);
  assert.deepEqual([...noon.slice(0, 3)], [...c.day.dry].map(Math.fround), 'day colours as they are');
  assert.deepEqual([...noon.slice(27)], new Array(27).fill(0), 'nothing else at noon');
  assert.deepEqual([...dark.slice(27, 30)], [...c.night.dry].map(Math.fround), 'classic night exactly');
  assert.ok(Math.abs(night[27] - c.night.dry[0] * 1.15) < 1e-6, 'a full moon brightens the night by 15%');
  const mixed = blend(c, [0, 0.5, 0.5, 0], 1);
  assert.ok(Math.abs(mixed[27] - (c.sunrise.dry[0] + c.sunset.dry[0]) / 2) < 1e-6, 'the moon does not touch dawn or dusk');
});
