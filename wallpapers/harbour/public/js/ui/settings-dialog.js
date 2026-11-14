import { Place } from '../sky/place.js';
import { Wind } from '../engine/wind.js';

/**
 * The settings dialog: a small window with the viewer's choices (sound, place, time, weather, wind, waves).
 * It builds its own form from the page's UI kit classes, shows the current choices each time it opens, and writes every
 * change straight to Settings (and to Sound, which keeps its own switch). It does no thinking of its own.
 * The dialog and its open button keep their taps and keys to themselves, so they never click or zoom the island.
 */
export class SettingsDialog {
  /**
   * @param {{ settings: import('../sky/settings.js').Settings, place: Place, clock: import('../sky/sky-clock.js').SkyClock, sound: import('../audio/sound.js').Sound, document?: Document }} parts
   */
  constructor({ settings, place, clock, sound, document = window.document }) {
    this.settings = settings; this.place = place; this.clock = clock; this.sound = sound;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'settings-title');
    this.dialog.innerHTML = SettingsDialog.markup();
    document.body.appendChild(this.dialog);
    this.#fillPlaces();
    this.#keepToSelf();
    this.#wire();
    sound.onChange(() => this.#show());
  }

  /** The form's markup (the tests read it too). */
  static markup() {
    return `<form class="a-card a-form" method="dialog">
  <div class="a-card__head"><h2 class="a-card__title" id="settings-title">Settings</h2></div>
  <div class="a-field"><span class="a-label" id="lbl-sound">Sound</span>
    <button type="button" class="a-btn" id="set-sound" aria-labelledby="lbl-sound" aria-pressed="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path class="waves" d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8"/><path class="cross" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>
      </svg><span id="sound-text"></span></button></div>
  <div class="a-field"><label class="a-label" for="set-place">Place</label>
    <select class="a-input" id="set-place"></select><span class="a-hint" id="place-hint"></span></div>
  <div class="a-field"><label class="a-label" for="set-time-mode">Time</label>
    <select class="a-input" id="set-time-mode"><option value="now">Now</option><option value="start">Start at a time</option></select>
    <input class="a-input" id="set-time" type="time" aria-label="Start time" step="60"></div>
  <div class="a-field"><label class="a-label" for="set-weather">Weather</label>
    <input class="slider" id="set-weather" type="range" min="0" max="100" step="1">
    <span class="slider-ends a-hint"><span>More sun</span><span>More clouds</span></span></div>
  <div class="a-field"><label class="a-label" for="set-wind-mode">Wind</label>
    <select class="a-input" id="set-wind-mode"><option value="auto">Auto</option><option value="set">Choose</option></select>
    <input class="slider" id="set-wind" type="range" min="0" max="100" step="1" aria-label="Wind strength">
    <span class="slider-ends a-hint" id="wind-ends"><span>Calm</span><span>Stormy</span></span></div>
  <div class="a-field"><label class="a-label" for="set-waves">Waves</label>
    <select class="a-input" id="set-waves"><option value="off">Off</option><option value="original">Original</option><option value="crescents">Crescents</option><option value="dashes">Dashes</option></select></div>
  <div class="dialog-actions"><button class="a-btn a-btn--primary" id="set-close" value="close">Done</button></div>
</form>`;
  }

  #el(id) { return this.dialog.querySelector('#' + id); }

  #fillPlaces() {
    const select = this.#el('set-place');
    const add = (value, text) => { const o = select.ownerDocument.createElement('option'); o.value = value; o.textContent = text; select.appendChild(o); };
    add('', 'My browser\'s time zone');
    [...Place.cities].sort((a, b) => a.city.localeCompare(b.city)).forEach(c => add(c.zone, c.city));
  }

  #keepToSelf() {
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel', 'keydown', 'keyup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']
      .forEach(type => this.dialog.addEventListener(type, e => e.stopPropagation()));
  }

  #wire() {
    const s = this.settings;
    this.#el('set-sound').addEventListener('click', () => this.sound.toggle());
    this.#el('set-place').addEventListener('change', e => s.set({ place: e.target.value || null }));
    this.#el('set-time-mode').addEventListener('change', e => {
      if (e.target.value === 'now') this.clock.setNow(); else this.clock.setStart(this.#el('set-time').value || this.#nowText());
    });
    this.#el('set-time').addEventListener('change', e => { if (e.target.value) this.clock.setStart(e.target.value); });
    this.#el('set-weather').addEventListener('change', e => s.set({ weather: Number(e.target.value) / 100 }));
    // a chosen wind lasts until the viewer picks Auto again (see Wind)
    const chosen = strength => ({ mode: 'fixed', strength });
    this.#el('set-wind-mode').addEventListener('change', e => s.set({ wind: e.target.value === 'auto' ? { mode: 'auto' } : chosen(Number(this.#el('set-wind').value) / 100) }));
    this.#el('set-wind').addEventListener('change', e => s.set({ wind: chosen(Number(e.target.value) / 100) }));
    this.#el('set-waves').addEventListener('change', e => s.set({ waves: e.target.value }));
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.close(); });   // a click on the backdrop closes it
    s.onChange(() => { if (this.dialog.open) this.#show(); });
  }

  /** The place's current time as HH:MM, a good first start time. */
  #nowText() {
    const l = this.place.local(this.clock.now()), two = n => String(n).padStart(2, '0');
    return `${two(l.hours)}:${two(l.minutes)}`;
  }

  /** Shows the current choices in the form. */
  #show() {
    const s = this.settings, sound = this.#el('set-sound');
    this.#el('sound-text').textContent = this.sound.on ? 'On' : 'Off';
    sound.classList.toggle('on', this.sound.on); sound.classList.toggle('a-btn--primary', this.sound.on);
    sound.setAttribute('aria-pressed', this.sound.on ? 'true' : 'false');
    const picked = s.get('place');
    this.#el('set-place').value = picked && Place.cities.some(c => c.zone === picked) ? picked : '';
    this.#el('place-hint').textContent = `${this.place.current.city} (${this.place.zone})`;
    const t = s.get('time'), start = t.mode === 'start';
    this.#el('set-time-mode').value = start ? 'start' : 'now';
    const time = this.#el('set-time'); time.hidden = !start; if (start) time.value = t.start;
    this.#el('set-weather').value = Math.round(s.get('weather') * 100);
    const wind = Wind.chosen(s.get('wind')), auto = wind === null;
    this.#el('set-wind-mode').value = auto ? 'auto' : 'set';
    const slider = this.#el('set-wind'); slider.hidden = auto; this.#el('wind-ends').hidden = auto; if (!auto) slider.value = Math.round(wind * 100);
    this.#el('set-waves').value = s.get('waves');
  }

  open() { this.#show(); if (!this.dialog.open) this.dialog.showModal(); this.#el('set-sound').focus(); }
  close() { if (this.dialog.open) this.dialog.close(); }
}
