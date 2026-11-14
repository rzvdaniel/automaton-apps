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
