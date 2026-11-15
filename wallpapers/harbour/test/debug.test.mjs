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

test('Settings panel markup: time bar first, then the rows, then the place and the Status row; status lines hidden until it is on', () => {
  const html = SettingsForm.markup(), at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['id="set-hour"', 'id="set-flow"', 'id="set-now"', 'id="set-weather"', 'id="set-wind"', 'id="set-waves"', 'id="set-colours"', 'id="set-moon"', 'id="set-sound"', 'id="set-place"', 'id="set-everything"', 'id="set-status-toggle"'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const values = id => [...html.match(new RegExp(`id="set-${id}" role="group"[^>]*>(.*?)</div>`, 's'))[1].matchAll(/data-value="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(values('weather'), ['0', '0.33', '0.67', '1']);
  assert.deepEqual(values('wind'), ['auto', '0', '0.4', '1']);
  assert.deepEqual(values('waves'), ['off', 'original', 'crescents', 'dashes']);
  assert.deepEqual(values('colours'), PALETTES.map(p => p.id));
  assert.deepEqual(values('moon'), ['real', 'full', 'new']);
  assert.deepEqual(values('sound'), ['on', 'off']);
  assert.deepEqual(values('everything'), ['on', 'off']);
  assert.deepEqual(values('status-toggle'), ['on', 'off']);
  assert.deepEqual(values('flow'), ['flowing', 'fixed']);
  assert.match(html, /<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="swatch-classic">/, 'a colour button is a swatch of its set');
  assert.ok(!/start time|Keep/i.test(html), 'the start-time field and Keep are gone');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  assert.match(SettingsPanel.markup(), /id="set-status" hidden/, 'the status lines start hidden');
  assert.ok(SettingsPanel.markup().indexOf('id="set-status"') > SettingsPanel.markup().indexOf('id="set-status-toggle"'), 'the status lines follow the Status row');
  assert.ok(SettingsPanel.markup().includes('id="set-close"'), 'the sheet has its own close button');
});

test('Settings panel: the hour text and the status lines', () => {
  assert.equal(SettingsForm.hourText(0), '00:00');
  assert.equal(SettingsForm.hourText(390), '06:30');
  assert.equal(SettingsForm.hourText(1440), '24:00');
  assert.equal(SettingsForm.hourText(5000), '24:00');
  const facts = { entities: 120, zoom: 1, soundOn: true, errors: [], clock: '10:00:00 Bucharest', wind: 0.5 };
  assert.equal(SettingsPanel.statusText(60, facts), '60 fps   120 entities   zoom 1.00\nsound on   wind 0.50   quality 1   clock 10:00:00 Bucharest\nno errors');
  assert.match(SettingsPanel.statusText(60, { ...facts, quality: 0.512 }), /quality 0.51 /);
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
  const press = (row, value) => els[row === 'status' ? 'status-toggle' : row].listeners.click({ target: { closest: () => ({ dataset: { value } }) } });
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
  assert.equal(settings.get('everything'), false, 'Every animal starts off');
  press('everything', 'on');
  assert.equal(settings.get('everything'), true);
  press('everything', 'off');
  assert.equal(settings.get('status'), false, 'Status starts off');
  press('status', 'on');
  assert.equal(settings.get('status'), true);
  press('status', 'off');
  assert.equal(settings.get('status'), false);
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

test('SettingsForm: the hour bar stops at 23:59, and on Now neither Flowing nor Fixed is chosen', () => {
  assert.match(SettingsForm.markup(), /id="set-hour" type="range" min="0" max="1439"/);
  const { els, press, settings, clock } = stubForm();
  const flow = [];
  els.flow.querySelectorAll = () => ['flowing', 'fixed'].map(v => ({ dataset: { value: v }, setAttribute: (k, val) => flow.push([v, val]) }));
  settings.set({});   // Settings.onChange runs show()
  assert.deepEqual(flow.filter(([, v]) => v === 'true'), [], 'Now: nothing pressed');
  press('flow', 'flowing');
  assert.equal(settings.get('time').mode, 'start', 'pressing Flowing on Now starts flowing');
  assert.ok(clock);
});

test('SettingsPanel: toggle, aria-expanded, Escape, and focus in and out', () => {
  const listeners = {}, doc = { activeElement: null, createElement: () => ({}) };
  const make = () => {
    const el = { hidden: false, listeners: {}, attrs: {}, children: {}, ownerDocument: doc, className: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; },
      contains(x) { return x === this || Object.values(this.children).includes(x); },
      querySelector(sel) { return this.children[sel] ??= { id: sel, value: '', ownerDocument: doc, listeners: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, appendChild() {}, querySelectorAll: () => [], focus() { doc.activeElement = this; } }; } };
    return el;
  };
  const el = make();
  const document = { createElement: () => el, body: { appendChild() {} } };
  globalThis.window = { addEventListener: (t, f) => { listeners[t] = f; } };
  const { settings, place, clock } = setup();
  const panel = new SettingsPanel(document, { settings, place, clock, sound: { on: false, onChange() {}, set() {} } });
  const button = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() { doc.activeElement = this; } };
  panel.button = button;
  assert.ok(!panel.isOpen);
  panel.toggle();
  assert.ok(panel.isOpen); assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(doc.activeElement.id, '#set-hour', 'focus moves into the panel');
  panel.toggle();
  assert.ok(!panel.isOpen); assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(doc.activeElement, button, 'closing returns focus to the button');
  panel.open(); listeners.keydown({ key: 'Enter' });
  assert.ok(panel.isOpen, 'other keys leave it open');
  listeners.keydown({ key: 'Escape' });
  assert.ok(!panel.isOpen); assert.equal(doc.activeElement, button, 'Escape returns focus too');
  panel.open(); el.children['#set-close'].listeners.click();   // the close button, focused inside the panel
  assert.ok(!panel.isOpen);
  panel.open(); doc.activeElement = button; panel.close();
  assert.equal(doc.activeElement, button, 'focus elsewhere is left alone');
  delete globalThis.window;
});

test('SettingsForm: a single click on the time bar (change without any input) sets and saves that hour', () => {
  const { settings, els, clock, real } = stubForm();
  els.hour.value = '1000';
  els.hour.listeners.change();   // no input event before it: no drag
  assert.deepEqual(settings.get('time'), { mode: 'start', start: '16:40', setAt: real.t });
  assert.equal(clock.text(), '16:40:00');
  assert.equal(els['hour-text'].textContent, '16:40');
});

test('SettingsForm: the -1 h and +1 h buttons step the hour, wrap around midnight and save', () => {
  const { settings, els, clock, real, press } = stubForm();   // 12:00
  els['hour-plus'].listeners.click();
  assert.equal(clock.text(), '13:00:00');
  assert.deepEqual(settings.get('time'), { mode: 'start', start: '13:00', setAt: real.t });
  els['hour-minus'].listeners.click(); els['hour-minus'].listeners.click();
  assert.equal(clock.text(), '11:00:00');
  clock.setLocalMinutes(23 * 60 + 30); els['hour-plus'].listeners.click();
  assert.equal(clock.text(), '00:30:00', 'wraps forward');
  els['hour-minus'].listeners.click();
  assert.equal(clock.text(), '23:30:00', 'wraps back');
  press('flow', 'fixed'); els['hour-plus'].listeners.click();
  assert.deepEqual(settings.get('time'), { mode: 'fixed', at: '00:30' }, 'Fixed stays Fixed');
});

test('Controls: the zoom buttons exist with labels, and zoom by the key step about the visible centre', async () => {
  const { Controls } = await import('../public/js/ui/controls.js');
  const { World } = await import('../public/js/engine/world.js');
  const html = (await import('node:fs')).readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [id, label] of [['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['home', 'Reset zoom']]) assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="${label}"`));
  const els = {}, stopped = [];
  const button = id => els[id] ??= { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  const document = { getElementById: button, body: { classList: { toggle() {} } } };
  const steps = [];
  new Controls({ sound: { on: false }, camera: { onChange() {}, reset() {} }, panel: { toggle() {} }, zoomStep: f => steps.push(f), document });
  els['zoom-in'].listeners.click(); els['zoom-out'].listeners.click();
  assert.deepEqual(steps, [1.4, 1 / 1.4]);
  els['zoom-in'].listeners.pointerdown({ stopPropagation: () => stopped.push('in') });
  els['zoom-out'].listeners.wheel({ stopPropagation: () => stopped.push('out') });
  assert.deepEqual(stopped, ['in', 'out'], 'a press or wheel on a zoom button does not reach the island');
  const world = new World({ width: 800, height: 600 });
  const calls = [];
  world.camera.zoomAt = (...a) => calls.push(a);
  world.camera.targetOffsetX = -170;   // the settings panel is open: the island sits left of the screen's middle
  world.zoomStep(1.4);
  assert.deepEqual(calls, [[1.4, 800 / 2 - 170, 300]], 'zooms around the visible centre');
});
