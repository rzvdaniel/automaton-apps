/**
 * The page's own buttons: the settings button in the bottom-right corner (opens and closes the settings panel, which holds
 * every choice) and the reset-zoom button that appears while zoomed. They live in the HTML; this connects them to the panel
 * and the camera, and keeps their taps from reaching the island.
 */
export class Controls {
  /**
   * @param {{ sound: import('../audio/sound.js').Sound, camera: import('../engine/camera.js').Camera, panel: import('./settings-panel.js').SettingsPanel, document?: Document }} parts
   */
  constructor({ sound, camera, panel, document = window.document }) {
    this.panel = panel;
    this.#bindSettings(document.getElementById('settings'));
    this.#bindHome(document.getElementById('home'), camera, document.body);
    // sound remembered as on needs one tap or key press before the browser lets it play
    if (sound.on) ['pointerdown', 'keydown'].forEach(type => window.addEventListener(type, () => sound.resume(), { once: true }));
  }

  /** A button must not also click what is under it. */
  #keepToSelf(button) {
    ['pointerdown', 'pointerup', 'pointercancel', 'wheel'].forEach(type => button.addEventListener(type, e => e.stopPropagation()));
  }

  #bindSettings(button) {
    if (!button) return;
    this.#keepToSelf(button);
    this.panel.button = button;
    button.addEventListener('click', () => this.panel.toggle());
  }

  #bindHome(button, camera, body) {
    camera.onChange(c => body.classList.toggle('zoomed', c.zoomed));   // the button is shown by CSS while zoomed
    if (!button) return;
    this.#keepToSelf(button);
    button.addEventListener('click', () => camera.reset());
  }
}
