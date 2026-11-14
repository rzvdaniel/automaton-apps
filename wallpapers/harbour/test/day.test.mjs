import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sun } from '../public/js/sky/sun.js';
import { Sky } from '../public/js/sky/sky.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Entity } from '../public/js/core/entity.js';

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
  assert.deepEqual(noon, { r: 1, g: 1, b: 1, grey: 0 }, 'plain daylight at noon');
  assert.ok(dawn.r > dawn.g && dawn.g >= dawn.b * 0.95 && dawn.r < 1, `dawn warm and soft ${JSON.stringify(dawn)}`);
  assert.ok(evening.r > evening.g && evening.g > evening.b && evening.r - evening.b > 0.2, `evening golden ${JSON.stringify(evening)}`);
  assert.ok(midnight.b > midnight.g && midnight.g > midnight.r, `night blue ${JSON.stringify(midnight)}`);
  assert.ok(midnight.r < 0.5 && midnight.b > 0.3, 'dark, but the land still readable');
  assert.ok(midnight.grey > 0 && noon.grey === 0, 'colour fades at night');
});

test('DayCycle: a night with a full moon is brighter than one with a new moon', () => {
  const day = new DayCycle(), brightness = l => l.r + l.g + l.b;
  const full = brightness(day.update(utc(24, 22), BUCHAREST).light);   // full moon, high up
  assert.ok(day.moonlight > 0.8, `moonlight ${day.moonlight}`);
  const none = brightness(day.update(utc(9, 22), BUCHAREST).light);    // new moon
  assert.ok(day.moonlight < 0.02, `moonlight ${day.moonlight}`);
  assert.equal(day.phase, 'night');
  assert.ok(full > none * 1.2, `full ${full} vs new ${none}`);
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
