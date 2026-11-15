import { Place } from '../sky/place.js';
import { PALETTES } from '../sky/palettes.js';
import { WEATHER_LEVELS, WIND_STRENGTHS, WAVES, MOONS, snap } from '../sky/settings.js';
import { IconRow } from './icon-row.js';
import { ICONS, swatch } from './icons.js';

/**
 * The settings controls without a window around them: the time bar (live while dragged, Flowing or Fixed, Now), then rows of
 * round buttons for weather, wind, waves, colours, moon and sound, then the place picker. The settings panel shows them.
 * It builds the markup, writes every change straight to Settings (and to Sound, which keeps its own switch, and to the clock)
 * and shows the current choices on show(). It does no thinking of its own. Ids start with `set-`.
 */
export class SettingsForm {
  /** "06:30" for 390 minutes past midnight; 1440 is "24:00". */
  static hourText(minutes) {
    const m = Math.min(1440, Math.max(0, Math.round(minutes)));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /**
   * The rows of round buttons, in the order shown: { key, label, options: [{ value, label, icon }] }. A row's `key` names its
   * element (`set-<key>`); the value of an option is what `Settings` stores for it (see `pick`).
   */
  static rows() {
    const weather = [['sunny', 'Sunny'], ['partly', 'Partly sunny'], ['cloudy', 'Cloudy'], ['stormy', 'Stormy']];
    const wind = [['calm', 'Calm'], ['windy', 'Windy'], ['gale', 'Stormy']];
    const waves = [['wavesOff', 'Off'], ['wavesOriginal', 'Original'], ['wavesCrescents', 'Crescents'], ['wavesDashes', 'Dashes']];
    const moon = [['moonReal', 'Real moon'], ['moonFull', 'Full moon'], ['moonNew', 'New moon']];
    return [
      { key: 'weather', label: 'Weather', options: WEATHER_LEVELS.map((v, i) => ({ value: v, label: weather[i][1], icon: ICONS[weather[i][0]] })) },
      { key: 'wind', label: 'Wind', options: [{ value: 'auto', label: 'Auto', icon: ICONS.auto }, ...WIND_STRENGTHS.map((v, i) => ({ value: v, label: wind[i][1], icon: ICONS[wind[i][0]] }))] },
      { key: 'waves', label: 'Waves', options: WAVES.map((v, i) => ({ value: v, label: waves[i][1], icon: ICONS[waves[i][0]] })) },
      { key: 'colours', label: 'Colours', options: PALETTES.map(p => ({ value: p.id, label: p.name, icon: swatch(p) })) },
      { key: 'moon', label: 'Moon', options: MOONS.map((v, i) => ({ value: v, label: moon[i][1], icon: ICONS[moon[i][0]] })) },
      { key: 'sound', label: 'Sound', options: [{ value: 'on', label: 'Sound on', icon: ICONS.soundOn }, { value: 'off', label: 'Sound off', icon: ICONS.soundOff }] }
    ];
  }

  /** The two ways time can go on once a time is chosen. */
  static FLOW = [{ value: 'flowing', label: 'Flowing' }, { value: 'fixed', label: 'Fixed' }];

  /** The fields' markup (the tests read it too). */
  static markup() {
    const rows = SettingsForm.rows().map(r => `<div class="a-field"><span class="a-label" id="set-lbl-${r.key}">${r.label}</span>
    ${IconRow.markup({ id: 'set-' + r.key, labelId: 'set-lbl-' + r.key, options: r.options })}</div>`).join('\n  ');
    return `<div class="a-field"><label class="a-label" id="set-lbl-time" for="set-hour">Time <output id="set-hour-text"></output></label>
    <input class="slider" id="set-hour" type="range" min="0" max="1439" step="1">
    <span class="slider-ends a-hint"><span>00:00</span><span>23:59</span></span>
    <span class="time-row">${IconRow.markup({ id: 'set-flow', labelId: 'set-lbl-time', options: SettingsForm.FLOW })}<button type="button" class="a-btn" id="set-now">Now</button></span></div>
  ${rows}
  <div class="a-field"><label class="a-label" for="set-place">Place</label>
    <select class="a-input" id="set-place"></select><span class="a-hint" id="set-place-hint"></span></div>`;
  }

  /**
   * @param {{ root: Element, settings: object, place: Place, clock: object, sound: object }} parts
   * root: an element whose innerHTML already holds SettingsForm.markup()
   */
  constructor({ root, settings, place, clock, sound }) {
    this.root = root; this.settings = settings; this.place = place; this.clock = clock; this.sound = sound; this.dragging = false;
    this.#fillPlaces();
    this.#wire();
    sound.onChange(() => this.show());
    settings.onChange(() => this.show());
  }

  #el(id) { return this.root.querySelector('#set-' + id); }

  #fillPlaces() {
    const select = this.#el('place');
    const add = (value, text) => { const o = select.ownerDocument.createElement('option'); o.value = value; o.textContent = text; select.appendChild(o); };
    add('', 'My browser\'s time zone');
    [...Place.cities].sort((a, b) => a.city.localeCompare(b.city)).forEach(c => add(c.zone, c.city));
  }

  /** What each row does when its button `value` (text) is pressed. */
  pick(key, value) {
    const s = this.settings;
    if (key === 'weather') s.set({ weather: Number(value) });
    else if (key === 'wind') s.set({ wind: value === 'auto' ? { mode: 'auto' } : { mode: 'fixed', strength: Number(value) } });   // a chosen wind lasts until Auto (see Wind)
    else if (key === 'waves') s.set({ waves: value });
    else if (key === 'colours') s.set({ palette: value });
    else if (key === 'moon') s.set({ moon: value });
    else if (key === 'sound') this.sound.set(value === 'on');
  }

  #wire() {
    for (const { key } of SettingsForm.rows()) IconRow.onPick(this.#el(key), value => this.pick(key, value));
    this.#el('place').addEventListener('change', e => this.settings.set({ place: e.target.value || null }));
    const hour = this.#el('hour');
    hour.addEventListener('input', () => { this.dragging = true; this.clock.setLocalMinutes(Number(hour.value)); this.#showHour(Number(hour.value)); });
    hour.addEventListener('change', () => { this.dragging = false; this.clock.save(this.settings.get('time').mode === 'fixed'); this.show(); });   // saved when the drag ends
    IconRow.onPick(this.#el('flow'), value => {
      const fixed = this.settings.get('time').mode === 'fixed';
      if (value === 'fixed' && !fixed) this.clock.setFixed(this.clock.shownText());
      else if (value === 'flowing' && this.settings.get('time').mode !== 'start') this.clock.setStart(this.clock.shownText());
    });
    this.#el('now').addEventListener('click', () => { this.dragging = false; this.clock.setNow(); this.show(); });
  }

  #showHour(minutes) { this.#el('hour-text').textContent = SettingsForm.hourText(minutes); }

  /** Moves the time bar to the time the island shows (not while it is being dragged). Call now and then as time flows. */
  showTime() {
    if (this.dragging) return;
    const m = this.clock.minutes();
    this.#el('hour').value = Math.round(m); this.#showHour(m);
  }

  /** Shows the current choices in the form. */
  show() {
    const s = this.settings, show = (key, value) => IconRow.show(this.#el(key), value);
    this.showTime();
    show('flow', { fixed: 'fixed', start: 'flowing' }[s.get('time').mode] ?? null);   // on Now neither is chosen
    show('weather', snap(s.get('weather'), WEATHER_LEVELS));
    const wind = s.get('wind');
    show('wind', wind.mode === 'fixed' ? snap(wind.strength, WIND_STRENGTHS) : 'auto');
    show('waves', s.get('waves'));
    show('colours', s.get('palette'));
    show('moon', s.get('moon'));
    show('sound', this.sound.on ? 'on' : 'off');
    const picked = s.get('place');
    this.#el('place').value = picked && Place.cities.some(c => c.zone === picked) ? picked : '';
    this.#el('place-hint').textContent = `${this.place.current.city} (${this.place.zone})`;
  }
}
