import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { Settings, WEATHER_LEVELS, WIND_STRENGTHS, snap } from '../public/js/sky/settings.js';
import { Place } from '../public/js/sky/place.js';
import { SkyClock } from '../public/js/sky/sky-clock.js';
import { DayCycle } from '../public/js/sky/day-cycle.js';
import { Wind } from '../public/js/engine/wind.js';
import { World } from '../public/js/engine/world.js';
import { PALETTES } from '../public/js/sky/palettes.js';
import { SettingsPanel } from '../public/js/ui/settings-panel.js';
import { SettingsForm } from '../public/js/ui/settings-form.js';
import { IconRow } from '../public/js/ui/icon-row.js';

const memory = () => { const d = {}; return { data: d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
const KEY = 'harbour-settings';

/** A clock at Bucharest (UTC+2 in November) whose real time we control. */
function setup(realStart = '2025-11-14T10:00:00Z', storage = memory()) {
  const settings = new Settings({ storage }), place = new Place({ settings, browserZone: 'Europe/Bucharest' });
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

test('SkyClock: Flowing saves the dragged time as a start time that runs on; Now goes back to the real time', () => {
  const { clock, settings, real } = setup();
  clock.setLocalMinutes(5 * 60 + 15);
  clock.save(false);
  assert.equal(clock.override, null);
  assert.deepEqual(settings.get('time'), { mode: 'start', start: '05:15', setAt: real.t });
  real.t += 30 * 60000;
  assert.equal(clock.text(), '05:45:00', 'it runs on');
  clock.setNow();
  assert.deepEqual(settings.get('time'), { mode: 'now' });
  assert.equal(clock.now().toISOString(), '2025-11-14T10:30:00.000Z');
  assert.ok(clock.isNow);
});

test('Fixed time: saved as { mode: fixed, at }, holds the hour as real time passes, and survives a reload', () => {
  const { clock, settings, storage, real } = setup();
  clock.setLocalMinutes(22 * 60 + 5);
  clock.save(true);
  assert.deepEqual(settings.get('time'), { mode: 'fixed', at: '22:05' });
  assert.equal(clock.override, null, 'the slider override is dropped once saved');
  assert.ok(!clock.isNow);
  assert.equal(clock.text(), '22:05:00');
  real.t += 3 * 3600000;   // 15:00 at the place
  assert.equal(clock.text(), '22:05:00', 'it holds');
  const again = setup('2025-11-14T10:00:00Z', storage);   // a reload: new objects, same storage
  assert.deepEqual(again.settings.get('time'), { mode: 'fixed', at: '22:05' });
  assert.equal(again.clock.text(), '22:05:00');
  again.real.t += 24 * 3600000;
  assert.equal(again.clock.place.local(again.clock.now()).day, 15, 'the date still follows the real one');
  assert.equal(again.clock.text(), '22:05:00');
});

test('Fixed time: bad times are ignored, a damaged saved time falls back to Now, Flowing and Fixed switch without moving the hour', () => {
  const { clock, settings } = setup();
  clock.setFixed('25:00'); clock.setFixed('nonsense');
  assert.deepEqual(settings.get('time'), { mode: 'now' });
  const bad = new Settings({ storage: { getItem: () => JSON.stringify({ time: { mode: 'fixed', at: '99:99' } }), setItem() {} } });
  assert.deepEqual(bad.get('time'), { mode: 'now' });
  clock.setStart('08:00');
  clock.setFixed(clock.shownText());
  assert.deepEqual(settings.get('time'), { mode: 'fixed', at: '08:00' });
  clock.setStart(clock.shownText());
  assert.equal(settings.get('time').mode, 'start');
  assert.equal(clock.shownText(), '08:00');
});

test('Settings: old weather and wind values snap to the nearest level when loaded', () => {
  const load = saved => new Settings({ storage: { getItem: () => JSON.stringify(saved), setItem() {} } });
  assert.deepEqual([...WEATHER_LEVELS], [0, 0.33, 0.67, 1]);
  const weather = { 0: 0, 0.1: 0, 0.2: 0.33, 0.5: 0.33, 0.51: 0.67, 0.8: 0.67, 0.9: 1, 1: 1 };
  for (const [old, level] of Object.entries(weather)) assert.equal(load({ weather: Number(old) }).get('weather'), level, `weather ${old}`);
  const wind = { 0: 0, 0.19: 0, 0.25: 0.4, 0.5: 0.4, 0.68: 0.4, 0.75: 1, 1: 1 };
  for (const [old, level] of Object.entries(wind)) assert.deepEqual(load({ wind: { mode: 'fixed', strength: Number(old) } }).get('wind'), { mode: 'fixed', strength: level }, `wind ${old}`);
  assert.deepEqual(load({ wind: { mode: 'auto' } }).get('wind'), { mode: 'auto' });
  assert.equal(snap(0.5, WEATHER_LEVELS), 0.33, 'exactly between: the lower');
  assert.equal(new Settings({ storage: null }).get('weather'), 0.33, 'the default is a level');
  assert.ok(WEATHER_LEVELS.includes(new Settings({ storage: null }).get('weather')));
});

test('Wind: the three chosen strengths are calm, windy and stormy as the sea shows them today', () => {
  const at = strength => Wind.targetFor({ mode: 'fixed', strength }, 0, new Date(0), '2025-11-14');
  const [calm, windy, stormy] = WIND_STRENGTHS.map(at);
  assert.ok(Math.abs(calm - 0.05) < 1e-9 && calm < 0.06, 'calm: no crests');
  assert.ok(windy > 0.3 && windy < 0.55, `windy ${windy}: a breeze`);
  assert.ok(Math.abs(stormy - 0.9) < 1e-9, 'stormy: the full storm');
  assert.equal(Wind.crests(calm, 'dashes').density, 0);
  assert.ok(Wind.crests(windy, 'dashes').density > 0 && Wind.crests(stormy, 'dashes').density > Wind.crests(windy, 'dashes').density);
});

test('Moon: the saved setting reaches DayCycle, and a change takes effect at once', () => {
  const place = { lat: 44.4, lon: 26.1 }, date = new Date('2025-11-14T22:00:00Z');
  const real = new DayCycle().update(date, place);
  const settings = new Settings({ storage: memory() });
  settings.set({ moon: 'full' });
  const world = new World({ settings, width: 800, height: 600 });
  assert.equal(world.day.moonOverride, 'full');
  assert.equal(world.day.moon.fraction, 1);
  settings.set({ moon: 'new' });
  assert.equal(world.day.moonOverride, 'new');
  assert.equal(world.day.moon.fraction, 0);
  settings.set({ moon: 'real' });
  assert.equal(world.day.moonOverride, null);
  assert.equal(new Settings({ storage: { getItem: () => JSON.stringify({ moon: 'full' }), setItem() {} } }).get('moon'), 'full', 'it is saved');
  assert.equal(new Settings({ storage: { getItem: () => JSON.stringify({ moon: 'gibbous' }), setItem() {} } }).get('moon'), 'real');
  assert.equal(new Settings({ storage: null }).get('moon'), 'real', 'the default');
  assert.ok(real.moon);
});

test('DayCycle moon override: Full and New change only the moon, Real leaves it alone', () => {
  const place = { lat: 44.4, lon: 26.1 }, date = new Date('2025-11-14T22:00:00Z');
  const real = new DayCycle().update(date, place);
  const day = new DayCycle();
  day.moonOverride = 'full'; day.update(date, place);
  assert.equal(day.moon.fraction, 1);
  assert.equal(day.moon.altitude, 50);
  assert.deepEqual(day.sun, real.sun, 'the sun is not touched');
  assert.ok(day.moonlight > 0, 'a full high moon lights the night');
  assert.ok(day.glitter.strength > 0, 'and glitters on the sea');
  day.moonOverride = 'new'; day.update(date, place);
  assert.equal(day.moon.fraction, 0);
  assert.equal(day.moonlight, 0);
  assert.equal(day.glitter.strength, 0);
  day.moonOverride = null; day.update(date, place);
  assert.deepEqual(day.moon, real.moon);
});

test('IconRow: the model has exactly one chosen option, and the markup says so with aria-pressed', () => {
  const options = [{ value: 0, label: 'Sunny', icon: '<svg></svg>' }, { value: 0.33, label: 'Partly <sunny>', icon: '<svg></svg>' }, { value: 'x', label: 'Text only' }];
  for (const value of [0, 0.33, 'x']) {
    const states = IconRow.states(options, value);
    assert.equal(states.filter(s => s.pressed).length, 1);
    assert.equal(states.find(s => s.pressed).value, value);
    const html = IconRow.markup({ id: 'set-w', labelId: 'lbl', options, value });
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.equal((html.match(/aria-pressed="false"/g) || []).length, 2);
  }
  assert.equal(IconRow.states(options, null).filter(s => s.pressed).length, 0);
  const html = IconRow.markup({ id: 'set-w', labelId: 'lbl', options });
  assert.match(html, /role="group" aria-labelledby="lbl"/);
  assert.match(html, /title="Sunny"[^>]*>.*<span class="a-sr">Sunny<\/span>/, 'a label as title and as hidden text');
  assert.match(html, /Partly &lt;sunny&gt;/, 'labels are escaped');
  // show() moves the mark
  const buttons = options.map(o => ({ dataset: { value: String(o.value) }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
  IconRow.show({ querySelectorAll: () => buttons }, 0.33);
  assert.deepEqual(buttons.map(b => b.attrs['aria-pressed']), ['false', 'true', 'false']);
});

test('Settings panel markup: time bar first, then the rows, then the place; status lines only in debug', () => {
  const html = SettingsForm.markup(), at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['id="set-hour"', 'id="set-flow"', 'id="set-now"', 'id="set-weather"', 'id="set-wind"', 'id="set-waves"', 'id="set-colours"', 'id="set-moon"', 'id="set-sound"', 'id="set-place"'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const values = id => [...html.match(new RegExp(`id="set-${id}" role="group"[^>]*>(.*?)</div>`, 's'))[1].matchAll(/data-value="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(values('weather'), ['0', '0.33', '0.67', '1']);
  assert.deepEqual(values('wind'), ['auto', '0', '0.4', '1']);
  assert.deepEqual(values('waves'), ['off', 'original', 'crescents', 'dashes']);
  assert.deepEqual(values('colours'), PALETTES.map(p => p.id));
  assert.deepEqual(values('moon'), ['real', 'full', 'new']);
  assert.deepEqual(values('sound'), ['on', 'off']);
  assert.deepEqual(values('flow'), ['flowing', 'fixed']);
  assert.match(html, /<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="swatch-classic">/, 'a colour button is a swatch of its set');
  assert.ok(!/start time|Keep/i.test(html), 'the start-time field and Keep are gone');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  assert.ok(!SettingsPanel.markup().includes('set-status'));
  assert.ok(SettingsPanel.markup({ debug: true }).includes('id="set-status"'));
  assert.ok(SettingsPanel.markup().includes('id="set-close"'), 'the sheet has its own close button');
});

test('Settings panel: the hour text and the status lines', () => {
  assert.equal(SettingsForm.hourText(0), '00:00');
  assert.equal(SettingsForm.hourText(390), '06:30');
  assert.equal(SettingsForm.hourText(1440), '24:00');
  assert.equal(SettingsForm.hourText(5000), '24:00');
  const facts = { entities: 120, zoom: 1, soundOn: true, errors: [], clock: '10:00:00 Bucharest', wind: 0.5 };
  assert.equal(SettingsPanel.statusText(60, facts), '60 fps   120 entities   zoom 1.00\nsound on   wind 0.50   clock 10:00:00 Bucharest\nno errors');
  assert.match(SettingsPanel.statusText(60, { ...facts, errors: ['a', 'b', 'c', 'd'] }), /ERRORS\nb\nc\nd$/);
});

/** A form on a stub root: every element is a stub that records its listeners. */
function stubForm(parts = setup()) {
  const els = {}, shown = [];
  const el = id => els[id] ??= { id, value: '', hidden: false, textContent: '', ownerDocument: { createElement: () => ({}) }, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, appendChild() {}, setAttribute() {}, querySelectorAll: () => [], focus() {} };
  const root = { querySelector: sel => el(sel.slice(5)) };   // '#set-x' -> 'x'
  const sound = { on: false, onChange() {}, set(on) { this.on = on; shown.push(on); } };
  const form = new SettingsForm({ root, ...parts, sound });
  const press = (row, value) => els[row].listeners.click({ target: { closest: () => ({ dataset: { value } }) } });
  return { ...parts, els, form, sound, press };
}

test('SettingsForm: pressing a button writes the choice to Settings (and to Sound)', () => {
  const { settings, press, sound } = stubForm();
  press('waves', 'dashes');
  assert.equal(settings.get('waves'), 'dashes');
  press('weather', '0.67');
  assert.equal(settings.get('weather'), 0.67);
  press('wind', '0.4');
  assert.deepEqual(settings.get('wind'), { mode: 'fixed', strength: 0.4 });
  press('wind', 'auto');
  assert.deepEqual(settings.get('wind'), { mode: 'auto' });
  press('colours', 'nordic');
  assert.equal(settings.get('palette'), 'nordic');
  press('moon', 'new');
  assert.equal(settings.get('moon'), 'new');
  press('sound', 'on');
  assert.equal(sound.on, true);
});

test('SettingsForm: the time bar is live while dragged, saved when the drag ends, Flowing or Fixed, and Now', () => {
  const { settings, els, press, clock, real } = stubForm();
  const hour = els.hour.listeners;
  els.hour.value = '1380';   // 23:00
  hour.input();
  assert.equal(els['hour-text'].textContent, '23:00', 'the hour shows while dragging');
  assert.equal(clock.text(), '23:00:00', 'the island moves while dragging');
  assert.deepEqual(settings.get('time'), { mode: 'now' }, 'nothing saved yet');
  hour.change();
  assert.deepEqual(settings.get('time'), { mode: 'start', start: '23:00', setAt: real.t }, 'Flowing is the start-time mode');
  press('flow', 'fixed');
  assert.deepEqual(settings.get('time'), { mode: 'fixed', at: '23:00' });
  els.hour.value = '360'; hour.input(); hour.change();
  assert.deepEqual(settings.get('time'), { mode: 'fixed', at: '06:00' }, 'a drag in Fixed stays fixed');
  press('flow', 'flowing');
  assert.deepEqual(settings.get('time'), { mode: 'start', start: '06:00', setAt: real.t });
  els.now.listeners.click();
  assert.deepEqual(settings.get('time'), { mode: 'now' });
  assert.equal(clock.now().getTime(), real.t);
});

test('SettingsForm: the hour bar follows the clock unless it is being dragged', () => {
  const { els, form, clock, real } = stubForm();
  form.showTime();
  assert.equal(els.hour.value, 720, '12:00 in Bucharest');
  real.t += 3600000; form.showTime();
  assert.equal(els.hour.value, 780);
  els.hour.listeners.input();   // dragging starts (the stub value is the bar's own)
  real.t += 3600000; clock.setOverride(null);
  els.hour.value = 100; form.showTime();
  assert.equal(els.hour.value, 100, 'left alone while dragging');
});
