import { SettingsForm } from './settings-form.js';
import { ICONS } from './icons.js';

/**
 * The settings panel: a floating card in the bottom-right corner, above the round settings button, opened and closed by that
 * button (Escape closes it too), built from the UI kit. It holds the settings controls (SettingsForm); with `?debug` it also
 * shows the status lines (frame rate, entities, zoom, wind, clock, errors). On a phone-width screen it is a sheet across the
 * bottom (CSS). Its taps, keys and wheel never reach the island.
 */
export class SettingsPanel {
  /** The status lines for the facts of one frame. */
  static statusText(fps, { entities, zoom, soundOn, errors, clock, wind = 0 }) {
    return `${fps} fps   ${entities} entities   zoom ${zoom.toFixed(2)}\nsound ${soundOn ? 'on' : 'off'}   wind ${wind.toFixed(2)}   clock ${clock}\n${errors.length ? 'ERRORS\n' + errors.slice(-3).join('\n') : 'no errors'}`;
  }

  /** The panel's markup; the status lines only with `debug`. */
  static markup({ debug = false } = {}) {
    return `<div class="a-card__head"><h2 class="a-card__title" id="settings-title">Settings</h2>
    <button type="button" class="a-btn a-btn--icon" id="set-close" aria-label="Close settings" title="Close">${ICONS.close}</button></div>
  <div class="a-form">
    ${SettingsForm.markup()}${debug ? '\n    <pre class="set-status" id="set-status"></pre>' : ''}
  </div>`;
  }

  /**
   * @param {Document} document
   * @param {{ settings: object, place: object, clock: import('../sky/sky-clock.js').SkyClock, sound: object, debug?: boolean }} parts
   */
  constructor(document, { settings, place, clock, sound, debug = false }) {
    this.debug = debug; this.button = null;
    this.el = document.createElement('aside');
    this.el.className = 'settings-panel a-card';
    this.el.id = 'settings-panel';
    this.el.setAttribute('aria-labelledby', 'settings-title');
    this.el.hidden = true;
    this.el.innerHTML = SettingsPanel.markup({ debug });
    document.body.appendChild(this.el);
    this.form = new SettingsForm({ root: this.el, settings, place, clock, sound });
    this.form.show();
    this.status = this.el.querySelector('#set-status');
    this.#keepToSelf();
    this.el.querySelector('#set-close').addEventListener('click', () => this.close());
    // Escape closes it from anywhere (the capture phase, so the panel keeping its keys to itself does not stop it)
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen) this.close(); }, true);
    this.at = performance.now(); this.frames = 0; this.shown = 0;
  }

  #keepToSelf() {
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel', 'keydown', 'keyup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']
      .forEach(type => this.el.addEventListener(type, e => e.stopPropagation()));
  }

  get isOpen() { return !this.el.hidden; }

  open() {
    this.form.show();
    this.el.hidden = false;
    this.button?.setAttribute('aria-expanded', 'true');
    this.el.querySelector('#set-hour').focus();
  }

  close() {
    if (this.el.contains(this.el.ownerDocument.activeElement)) this.button?.focus();   // never leave focus in a hidden panel
    this.el.hidden = true;
    this.button?.setAttribute('aria-expanded', 'false');
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  /** Call once per frame with the current facts; it refreshes the time bar and the status text twice a second. */
  update(now, facts) {
    this.frames++;
    if (now - this.at < 500) return;
    const fps = Math.round((this.frames - this.shown) * 1000 / (now - this.at));
    this.at = now; this.shown = this.frames;
    if (this.status) this.status.textContent = SettingsPanel.statusText(fps, facts);
    if (this.isOpen) this.form.showTime();
  }
}
