import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { Settings } from '../public/js/sky/settings.js';
import { Place } from '../public/js/sky/place.js';
import { SkyClock } from '../public/js/sky/sky-clock.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { DebugPanel } from '../public/js/engine/debug-panel.js';
import { SettingsForm } from '../public/js/ui/settings-form.js';
import { SettingsDialog } from '../public/js/ui/settings-dialog.js';

const memory = () => { const d = {}; return { data: d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

/** A clock at Bucharest (UTC+2 in November) whose real time we control. */
function setup(realStart = '2025-11-14T10:00:00Z') {
  const storage = memory(), settings = new Settings({ storage }), place = new Place({ settings, browserZone: 'Europe/Bucharest' });
  const real = { t: Date.parse(realStart) };
  return { storage, settings, place, real, clock: new SkyClock({ settings, place, realNow: () => real.t }) };
}

test('SkyClock override: the slider freezes the shown time, saves nothing, and tells listeners', () => {
  const { clock, settings, storage, real } = setup();
  let heard = 0; clock.onChange(() => heard++);
  clock.setLocalMinutes(6 * 60 + 30);
  assert.equal(clock.text(), '06:30:00');
  assert.equal(clock.minutes(), 390);
  assert.ok(!clock.isNow);
  assert.equal(heard, 1);
  real.t += 60000;
  assert.equal(clock.text(), '06:30:00', 'frozen while dragging and after');
  assert.deepEqual(settings.get('time'), { mode: 'now' }, 'the setting is untouched');
  assert.deepEqual(storage.data, {}, 'nothing saved');
  clock.setLocalMinutes(1440);
  assert.equal(clock.text(), '00:00:00');
  assert.equal(clock.place.local(clock.now()).day, 15, '24:00 is the next midnight');
});

test('SkyClock override: Now returns to real time, and shows it even when a start time is saved', () => {
  const { clock, settings, real } = setup();
  clock.setLocalMinutes(60); clock.showReal();
  assert.equal(clock.now().toISOString(), '2025-11-14T10:00:00.000Z');
  assert.ok(clock.isNow);
  clock.setStart('22:00');
  assert.equal(clock.text(), '22:00:00');
  clock.setLocalMinutes(120); clock.showReal();
  assert.equal(clock.now().toISOString(), '2025-11-14T10:00:00.000Z', 'the real time, not the saved start');
  assert.equal(settings.get('time').start, '22:00', 'still saved as it was');
});

test('SkyClock override: Keep saves the shown time as the start time and drops the override', () => {
  const { clock, settings } = setup();
  clock.setLocalMinutes(5 * 60 + 15);
  clock.keep();
  assert.equal(clock.override, null);
  assert.equal(settings.get('time').mode, 'start');
  assert.equal(settings.get('time').start, '05:15');
  assert.equal(clock.text(), '05:15:00');
});

test('DayCycle moon override: Full and New change only the moon, Real leaves it alone', () => {
  const place = { lat: 44.4, lon: 26.1 }, date = new Date('2025-11-14T22:00:00Z');
  const real = new DayCycle().update(date, place);
  const day = new DayCycle();
  day.moonOverride = 'full'; day.update(date, place);
  assert.equal(day.moon.fraction, 1);
  assert.equal(day.moon.altitude, 50);
  assert.deepEqual(day.sun, real.sun, 'the sun is not touched');
  assert.ok(day.moonlight > real.moonlight || real.moonlight === day.moonlight, 'a full high moon lights at least as much');
  day.moonOverride = 'new'; day.update(date, place);
  assert.equal(day.moon.fraction, 0);
  assert.equal(day.moonlight, 0);
  assert.equal(day.glitter.strength, 0);
  day.moonOverride = null; day.update(date, place);
  assert.deepEqual(day.moon, real.moon);
});

test('DebugPanel: the hour text and the status lines', () => {
  assert.equal(DebugPanel.hourText(0), '00:00');
  assert.equal(DebugPanel.hourText(390), '06:30');
  assert.equal(DebugPanel.hourText(1440), '24:00');
  assert.equal(DebugPanel.hourText(5000), '24:00');
  const facts = { entities: 120, zoom: 1, soundOn: true, errors: [], clock: '10:00:00 Bucharest', wind: 0.5 };
  assert.equal(DebugPanel.statusText(60, facts), '60 fps   120 entities   zoom 1.00\nsound on   wind 0.50   clock 10:00:00 Bucharest\nno errors');
  assert.match(DebugPanel.statusText(60, { ...facts, errors: ['a', 'b', 'c', 'd'] }), /ERRORS\nb\nc\nd$/);
});

test('DebugPanel markup: time slider first, then the moon, the settings controls, the palette place and the status', () => {
  const html = DebugPanel.markup();
  const at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('id="dbg-hour"') < at('data-moon=""') && at('data-moon=""') < at('id="dbg-place"') && at('id="dbg-place"') < at('id="dbg-palette"') && at('id="dbg-palette"') < at('id="dbg-status"'));
  assert.match(html, /<input class="slider" id="dbg-hour" type="range" min="0" max="1440"/);
  assert.deepEqual([...html.matchAll(/data-moon="([^"]*)"/g)].map(m => m[1]), ['', 'full', 'new']);
  for (const id of ['dbg-now', 'dbg-keep', 'dbg-weather', 'dbg-wind-mode', 'dbg-waves', 'dbg-sound']) at(`id="${id}"`);
  assert.ok(!html.includes('dbg-time-mode'), 'the start-time field is the slider here');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
});

test('SettingsForm: the dialog keeps its old ids, and a prefixed copy shares none with it', () => {
  const dialog = SettingsDialog.markup();
  for (const id of ['set-sound', 'set-place', 'set-time-mode', 'set-time', 'set-weather', 'set-wind-mode', 'set-wind', 'set-waves']) assert.ok(dialog.includes(`id="${id}"`), id);
  const ids = html => new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  const a = ids(dialog), b = ids(DebugPanel.markup());
  assert.deepEqual([...a].filter(id => b.has(id)), [], 'both can be on one page');
  assert.ok(SettingsForm.markup({ time: false }).indexOf('set-time') < 0);
});
