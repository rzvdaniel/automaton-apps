import test from 'node:test';
import assert from 'node:assert/strict';
import { Settings, DEFAULTS } from '../public/js/sky/settings.js';
import { Place } from '../public/js/sky/place.js';
import { SkyClock } from '../public/js/sky/sky-clock.js';

/** A stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const KEY = 'harbour-settings';

test('Settings: defaults when nothing is saved or no storage exists', () => {
  assert.deepEqual(new Settings({ storage: fakeStorage() }).values, DEFAULTS);
  assert.deepEqual(new Settings({ storage: null }).values, DEFAULTS);
});

test('Settings: choices are saved and come back after a reload', () => {
  const storage = fakeStorage();
  const a = new Settings({ storage });
  a.set({ place: 'Asia/Tokyo', weather: 0.8, wind: 0.3, time: { mode: 'start', start: '22:00', setAt: 1000 } });
  const b = new Settings({ storage });
  assert.equal(b.get('place'), 'Asia/Tokyo');
  assert.equal(b.get('weather'), 0.8);
  assert.equal(b.get('wind'), 0.3);
  assert.deepEqual(b.get('time'), { mode: 'start', start: '22:00', setAt: 1000 });
});

test('Settings: damaged saves fall back to defaults, value by value', () => {
  assert.deepEqual(new Settings({ storage: fakeStorage({ [KEY]: '{not json' }) }).values, DEFAULTS);
  const s = new Settings({ storage: fakeStorage({ [KEY]: JSON.stringify({ weather: 7, wind: 'gale', time: { mode: 'start', start: '25:99' }, place: 'Europe/Paris' }) }) });
  assert.equal(s.get('weather'), DEFAULTS.weather);
  assert.equal(s.get('wind'), 'auto');
  assert.deepEqual(s.get('time'), { mode: 'now' });
  assert.equal(s.get('place'), 'Europe/Paris');
});

test('Settings: a storage that throws never breaks it', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const s = new Settings({ storage: broken });
  s.set({ weather: 0.2 });
  assert.equal(s.get('weather'), 0.2);
});

test('Settings: listeners hear about changes and can stop listening', () => {
  const s = new Settings({ storage: fakeStorage() }), heard = [];
  const stop = s.onChange((values, names) => heard.push(names.join()));
  s.set({ weather: 0.1 }); s.set({ wind: 0.5, place: 'Europe/Rome' });
  stop(); s.set({ weather: 0.9 });
  assert.deepEqual(heard, ['weather', 'wind,place']);
});

test('Place: known zones give their city, latitude and longitude', () => {
  const p = Place.lookup('Europe/Bucharest');
  assert.equal(p.city, 'Bucharest');
  assert.ok(Math.abs(p.lat - 44.43) < 0.01 && Math.abs(p.lon - 26.1) < 0.01);
  assert.equal(Place.lookup('Asia/Tokyo').city, 'Tokyo');
});

test('Place: the table is the right size and every zone is real', () => {
  assert.ok(Place.cities.length >= 40 && Place.cities.length <= 60);
  for (const c of Place.cities) {
    assert.ok(Place.isZone(c.zone), c.zone);
    assert.ok(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, c.city);
  }
});

test('Place: an unknown zone takes the city on the nearest clock; a bad zone takes Bucharest', () => {
  const winter = new Date('2025-11-14T12:00:00Z');
  assert.equal(Place.lookup('Europe/Vilnius', winter).zone, 'Europe/Athens');         // same offset in winter (UTC+2), first such city in the table
  assert.equal(Place.offsetMinutes(Place.lookup('Europe/Oslo', winter).zone, winter), 60);   // some city on UTC+1
  assert.equal(Place.lookup('Not/AZone', winter).city, 'Bucharest');
  assert.equal(Place.lookup(undefined, winter).city, 'Bucharest');
});

test('Place: uses the picked zone, else the browser zone, else Bucharest', () => {
  const settings = new Settings({ storage: null });
  assert.equal(new Place({ settings, browserZone: 'Asia/Tokyo' }).current.city, 'Tokyo');
  assert.equal(new Place({ settings, browserZone: 'garbage' }).zone, 'Europe/Bucharest');
  settings.set({ place: 'America/New_York' });
  assert.equal(new Place({ settings, browserZone: 'Asia/Tokyo' }).current.city, 'New York');
  settings.set({ place: 'garbage' });
  assert.equal(new Place({ settings, browserZone: 'Asia/Tokyo' }).zone, 'Asia/Tokyo');
});

test('Place: local time and offsets', () => {
  const settings = new Settings({ storage: null }), place = new Place({ settings, browserZone: 'Europe/Bucharest' });
  const l = place.local(new Date('2025-11-14T21:30:00Z'));
  assert.deepEqual([l.hours, l.minutes, l.day], [23, 30, 14]);
  assert.equal(Place.offsetMinutes('Europe/Bucharest', new Date('2025-11-14T12:00:00Z')), 120);
  assert.equal(Place.offsetMinutes('Europe/Bucharest', new Date('2025-07-14T12:00:00Z')), 180);
  assert.equal(place.instantOf({ year: 2025, month: 11, day: 14, hours: 22, minutes: 0 }).toISOString(), '2025-11-14T20:00:00.000Z');
});

/** A clock at Bucharest whose real time we control. */
function setup(realStart) {
  const settings = new Settings({ storage: fakeStorage() }), place = new Place({ settings, browserZone: 'Europe/Bucharest' });
  const real = { t: Date.parse(realStart) };
  return { settings, place, real, clock: new SkyClock({ settings, place, realNow: () => real.t }) };
}

test('SkyClock: on "Now" it is the real time', () => {
  const { clock, real } = setup('2025-11-14T10:00:00Z');
  assert.equal(clock.now().toISOString(), '2025-11-14T10:00:00.000Z');
  real.t += 5000;
  assert.equal(clock.now().toISOString(), '2025-11-14T10:00:05.000Z');
  assert.ok(clock.isNow);
});

test('SkyClock: a start time shows that time at the place, then runs forward', () => {
  const { clock, real } = setup('2025-11-14T10:00:00Z');   // 12:00 in Bucharest
  clock.setStart('22:00');
  assert.equal(clock.now().toISOString(), '2025-11-14T20:00:00.000Z');
  assert.equal(clock.text(), '22:00:00');
  real.t += 90 * 60 * 1000;
  assert.equal(clock.text(), '23:30:00');
  assert.equal(clock.now().toISOString(), '2025-11-14T21:30:00.000Z');
  assert.ok(!clock.isNow);
});

test('SkyClock: the start survives a reload (new objects, same storage)', () => {
  const storage = fakeStorage(), real = { t: Date.parse('2025-11-14T10:00:00Z') };
  const build = () => { const settings = new Settings({ storage }); const place = new Place({ settings, browserZone: 'Europe/Bucharest' }); return new SkyClock({ settings, place, realNow: () => real.t }); };
  build().setStart('22:00');
  real.t += 10 * 60 * 1000;
  assert.equal(build().text(), '22:10:00');
});

test('SkyClock: back to Now, and bad times are ignored', () => {
  const { clock, real } = setup('2025-11-14T10:00:00Z');
  clock.setStart('nonsense'); assert.ok(clock.isNow);
  clock.setStart('06:15'); clock.setStart('24:00'); assert.equal(clock.text(), '06:15:00');
  clock.setNow(); assert.equal(clock.now().getTime(), real.t);
});

test('World: owns the settings, place and clock (headless, no browser storage)', async () => {
  await import('./helpers.mjs');
  const { World } = await import('../public/js/engine/world.js');
  const world = new World({ width: 800, height: 600 });
  assert.ok(world.settings instanceof Settings && world.place instanceof Place && world.skyClock instanceof SkyClock);
  assert.deepEqual(world.settings.values, DEFAULTS);
});
