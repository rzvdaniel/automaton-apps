import { SettingsForm } from './settings-form.js';

/**
 * The settings dialog: a small window around the settings controls (SettingsForm: sound, place, time, weather, wind, waves).
 * It builds its own form from the page's UI kit classes and shows the current choices each time it opens.
 * The dialog and its open button keep their taps and keys to themselves, so they never click or zoom the island.
 */
export class SettingsDialog {
  /**
   * @param {{ settings: import('../sky/settings.js').Settings, place: import('../sky/place.js').Place, clock: import('../sky/sky-clock.js').SkyClock, sound: import('../audio/sound.js').Sound, document?: Document }} parts
   */
  constructor({ settings, place, clock, sound, document = window.document }) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'settings-title');
    this.dialog.innerHTML = SettingsDialog.markup();
    document.body.appendChild(this.dialog);
    this.form = new SettingsForm({ root: this.dialog, settings, place, clock, sound });
    this.#keepToSelf();
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.close(); });   // a click on the backdrop closes it
  }

  /** The form's markup (the tests read it too). */
  static markup() {
    return `<form class="a-card a-form" method="dialog">
  <div class="a-card__head"><h2 class="a-card__title" id="settings-title">Settings</h2></div>
  ${SettingsForm.markup()}
  <div class="dialog-actions"><button class="a-btn a-btn--primary" id="set-close" value="close">Done</button></div>
</form>`;
  }

  #keepToSelf() {
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel', 'keydown', 'keyup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']
      .forEach(type => this.dialog.addEventListener(type, e => e.stopPropagation()));
  }

  open() { this.form.show(); if (!this.dialog.open) this.dialog.showModal(); this.dialog.querySelector('#set-sound').focus(); }
  close() { if (this.dialog.open) this.dialog.close(); }
}
