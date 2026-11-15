import { SettingsForm } from '../ui/settings-form.js';

/**
 * The debug side panel shown with ?debug: fixed to the right edge, always open (folded to a button on a phone), built from the UI kit.
 * From the top: the time slider (live while dragged; "Now" returns to the real time, "Keep" saves the shown time as the time
 * setting), the moon (Real, Full or New, for this page only), the settings controls the settings dialog has (SettingsForm), a place
 * for the palette set (#211), and the status lines: frames per second, how many things there are, the zoom, the wind's strength, the clock and any errors.
 * The pieces that need no page (the status text, the hour text, the markup) are static so tests can reach them.
 */
export class DebugPanel {
  /** "06:30" for 390 minutes past midnight; 1440 is "24:00". */
  static hourText(minutes) {
    const m = Math.min(1440, Math.max(0, Math.round(minutes)));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /** The status lines for the facts of one frame. */
  static statusText(fps, { entities, zoom, soundOn, errors, clock, wind = 0 }) {
    return `${fps} fps   ${entities} entities   zoom ${zoom.toFixed(2)}\nsound ${soundOn ? 'on' : 'off'}   wind ${wind.toFixed(2)}   clock ${clock}\n${errors.length ? 'ERRORS\n' + errors.slice(-3).join('\n') : 'no errors'}`;
  }

  /** The moon choices, in the order shown: [mode handed to setMoon, label]. */
  static MOONS = [[null, 'Real'], ['full', 'Full'], ['new', 'New']];

  /** The panel's markup. */
  static markup() {
    const moons = DebugPanel.MOONS.map(([mode, label]) => `<button type="button" class="a-btn" data-moon="${mode ?? ''}" aria-pressed="false">${label}</button>`).join('');
    return `<div class="a-card__head"><h2 class="a-card__title">Harbour debug</h2>
    <button type="button" class="a-btn a-btn--icon" id="dbg-toggle" aria-expanded="true" aria-controls="dbg-body" aria-label="Hide the debug panel" title="Hide the panel">&#8250;</button></div>
  <div class="a-form" id="dbg-body">
    <div class="a-field"><label class="a-label" for="dbg-hour">Time <output id="dbg-hour-text"></output></label>
      <input class="slider" id="dbg-hour" type="range" min="0" max="1440" step="1">
      <span class="slider-ends a-hint"><span>00:00</span><span>24:00</span></span>
      <span class="dbg-row"><button type="button" class="a-btn" id="dbg-now">Now</button><button type="button" class="a-btn" id="dbg-keep">Keep</button></span></div>
    <div class="a-field"><span class="a-label" id="dbg-lbl-moon">Moon</span>
      <span class="dbg-row" role="group" aria-labelledby="dbg-lbl-moon">${moons}</span></div>
    ${SettingsForm.markup({ time: false, prefix: 'dbg-' })}
    <div id="dbg-palette"><!-- the palette set (#211) goes here --></div>
    <pre class="dbg-status" id="dbg-status"></pre>
  </div>`;
  }

  /**
   * @param {Document} document
   * @param {{ settings: object, place: object, clock: import('../sky/sky-clock.js').SkyClock, sound: object, setMoon: (mode: string | null) => void }} parts
   */
  constructor(document, { settings, place, clock, sound, setMoon }) {
    this.clock = clock; this.setMoon = setMoon; this.dragging = false; this.moon = null;
    this.el = document.createElement('aside');
    this.el.className = 'debug-panel a-card';
    this.el.setAttribute('aria-label', 'Debug panel');
    this.el.innerHTML = DebugPanel.markup();
    document.body.appendChild(this.el);
    this.form = new SettingsForm({ root: this.el, settings, place, clock, sound, time: false, prefix: 'dbg-' });
    this.form.show();
    this.status = this.el.querySelector('#dbg-status');
    this.#keepToSelf();
    this.#wire();
    this.collapse(typeof innerWidth !== 'undefined' && innerWidth < 640);   // a phone starts with the panel folded away
    this.#showMoon();
    this.at = performance.now(); this.frames = 0; this.shown = 0;
  }

  #el(id) { return this.el.querySelector('#dbg-' + id); }

  /** Folds the panel to its button (or opens it). */
  collapse(on) {
    this.el.classList.toggle('collapsed', on);
    const b = this.#el('toggle');
    b.setAttribute('aria-expanded', on ? 'false' : 'true');
    b.setAttribute('aria-label', on ? 'Show the debug panel' : 'Hide the debug panel');
    b.innerHTML = on ? '&#8249;' : '&#8250;';
  }

  #keepToSelf() {
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel', 'keydown', 'keyup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']
      .forEach(type => this.el.addEventListener(type, e => e.stopPropagation()));
  }

  #wire() {
    const slider = this.#el('hour');
    slider.addEventListener('input', () => { this.dragging = true; this.clock.setLocalMinutes(Number(slider.value)); this.#showHour(Number(slider.value)); });
    slider.addEventListener('change', () => { this.dragging = false; });
    this.#el('now').addEventListener('click', () => { this.dragging = false; this.clock.showReal(); });
    this.#el('keep').addEventListener('click', () => this.clock.keep());
    this.#el('toggle').addEventListener('click', () => this.collapse(!this.el.classList.contains('collapsed')));
    this.el.querySelectorAll('[data-moon]').forEach(b => b.addEventListener('click', () => { this.moon = b.dataset.moon || null; this.setMoon(this.moon); this.#showMoon(); }));
  }

  #showHour(minutes) { this.#el('hour-text').textContent = DebugPanel.hourText(minutes); }

  #showMoon() {
    this.el.querySelectorAll('[data-moon]').forEach(b => {
      const on = (b.dataset.moon || null) === this.moon;
      b.classList.toggle('a-btn--primary', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /** Call once per frame with the current facts; it refreshes the text (and the slider, when it is not being dragged) twice a second. */
  update(now, facts) {
    this.frames++;
    if (now - this.at < 500) return;
    const fps = Math.round((this.frames - this.shown) * 1000 / (now - this.at));
    this.at = now; this.shown = this.frames;
    this.status.textContent = DebugPanel.statusText(fps, facts);
    if (!this.dragging) { const m = this.clock.minutes(); this.#el('hour').value = Math.round(m); this.#showHour(m); }
  }
}
