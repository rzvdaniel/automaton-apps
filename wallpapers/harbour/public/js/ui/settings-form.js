import { Place } from '../sky/place.js';
import { Wind } from '../engine/wind.js';

/**
 * The settings controls (sound, place, time, weather, wind, waves) without a window around them: the settings dialog and the
 * debug panel both show them. It builds the fields' markup, writes every change straight to Settings (and to Sound, which keeps
 * its own switch) and shows the current choices on show(). It does no thinking of its own.
 * `time: false` leaves out the start-time field (the debug panel has a slider instead). Ids start with `prefix`, so two forms never clash.
 */
export class SettingsForm {
  /** The fields' markup (the tests read it too). */
  static markup({ time = true, prefix = 'set-' } = {}) {
    const p = prefix;
    return `<div class="a-field"><span class="a-label" id="${p}lbl-sound">Sound</span>
    <button type="button" class="a-btn" id="${p}sound" aria-labelledby="${p}lbl-sound" aria-pressed="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path class="waves" d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8"/><path class="cross" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>
      </svg><span id="${p}sound-text"></span></button></div>
  <div class="a-field"><label class="a-label" for="${p}place">Place</label>
    <select class="a-input" id="${p}place"></select><span class="a-hint" id="${p}place-hint"></span></div>${time ? `
  <div class="a-field"><label class="a-label" for="${p}time-mode">Time</label>
    <select class="a-input" id="${p}time-mode"><option value="now">Now</option><option value="start">Start at a time</option></select>
    <input class="a-input" id="${p}time" type="time" aria-label="Start time" step="60"></div>` : ''}
  <div class="a-field"><label class="a-label" for="${p}weather">Weather</label>
    <input class="slider" id="${p}weather" type="range" min="0" max="100" step="1">
    <span class="slider-ends a-hint"><span>More sun</span><span>More clouds</span></span></div>
  <div class="a-field"><label class="a-label" for="${p}wind-mode">Wind</label>
    <select class="a-input" id="${p}wind-mode"><option value="auto">Auto</option><option value="set">Choose</option></select>
    <input class="slider" id="${p}wind" type="range" min="0" max="100" step="1" aria-label="Wind strength">
    <span class="slider-ends a-hint" id="${p}wind-ends"><span>Calm</span><span>Stormy</span></span></div>
  <div class="a-field"><label class="a-label" for="${p}waves">Waves</label>
    <select class="a-input" id="${p}waves"><option value="off">Off</option><option value="original">Original</option><option value="crescents">Crescents</option><option value="dashes">Dashes</option></select></div>`;
  }

  /**
   * @param {{ root: Element, settings: object, place: Place, clock: object, sound: object, time?: boolean, prefix?: string }} parts
   * root: an element whose innerHTML already holds SettingsForm.markup() with the same options
   */
  constructor({ root, settings, place, clock, sound, time = true, prefix = 'set-' }) {
    this.root = root; this.settings = settings; this.place = place; this.clock = clock; this.sound = sound; this.time = time; this.prefix = prefix;
    this.#fillPlaces();
    this.#wire();
    sound.onChange(() => this.show());
    settings.onChange(() => this.show());
  }

  #el(id) { return this.root.querySelector('#' + this.prefix + id); }

  #fillPlaces() {
    const select = this.#el('place');
    const add = (value, text) => { const o = select.ownerDocument.createElement('option'); o.value = value; o.textContent = text; select.appendChild(o); };
    add('', 'My browser\'s time zone');
    [...Place.cities].sort((a, b) => a.city.localeCompare(b.city)).forEach(c => add(c.zone, c.city));
  }

  #wire() {
    const s = this.settings;
    this.#el('sound').addEventListener('click', () => this.sound.toggle());
    this.#el('place').addEventListener('change', e => s.set({ place: e.target.value || null }));
    if (this.time) {
      this.#el('time-mode').addEventListener('change', e => {
        if (e.target.value === 'now') this.clock.setNow(); else this.clock.setStart(this.#el('time').value || this.#nowText());
      });
      this.#el('time').addEventListener('change', e => { if (e.target.value) this.clock.setStart(e.target.value); });
    }
    this.#el('weather').addEventListener('change', e => s.set({ weather: Number(e.target.value) / 100 }));
    // a chosen wind lasts until the viewer picks Auto again (see Wind)
    const chosen = strength => ({ mode: 'fixed', strength });
    this.#el('wind-mode').addEventListener('change', e => s.set({ wind: e.target.value === 'auto' ? { mode: 'auto' } : chosen(Number(this.#el('wind').value) / 100) }));
    this.#el('wind').addEventListener('change', e => s.set({ wind: chosen(Number(e.target.value) / 100) }));
    this.#el('waves').addEventListener('change', e => s.set({ waves: e.target.value }));
  }

  /** The place's current time as HH:MM, a good first start time. */
  #nowText() {
    const l = this.place.local(this.clock.now()), two = n => String(n).padStart(2, '0');
    return `${two(l.hours)}:${two(l.minutes)}`;
  }

  /** Shows the current choices in the form. */
  show() {
    const s = this.settings, sound = this.#el('sound');
    this.#el('sound-text').textContent = this.sound.on ? 'On' : 'Off';
    sound.classList.toggle('on', this.sound.on); sound.classList.toggle('a-btn--primary', this.sound.on);
    sound.setAttribute('aria-pressed', this.sound.on ? 'true' : 'false');
    const picked = s.get('place');
    this.#el('place').value = picked && Place.cities.some(c => c.zone === picked) ? picked : '';
    this.#el('place-hint').textContent = `${this.place.current.city} (${this.place.zone})`;
    if (this.time) {
      const t = s.get('time'), start = t.mode === 'start';
      this.#el('time-mode').value = start ? 'start' : 'now';
      const time = this.#el('time'); time.hidden = !start; if (start) time.value = t.start;
    }
    this.#el('weather').value = Math.round(s.get('weather') * 100);
    const wind = Wind.chosen(s.get('wind')), auto = wind === null;
    this.#el('wind-mode').value = auto ? 'auto' : 'set';
    const slider = this.#el('wind'); slider.hidden = auto; this.#el('wind-ends').hidden = auto; if (!auto) slider.value = Math.round(wind * 100);
    this.#el('waves').value = s.get('waves');
  }
}
