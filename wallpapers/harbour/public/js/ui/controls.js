/**
 * The page's own buttons: the settings button in the bottom-right corner (opens and closes the settings panel, which holds
 * every choice) and the zoom in and out buttons and the reset-zoom button that appears while zoomed. They live in the HTML; this connects them to the panel
 * and the camera, and keeps their taps from reaching the island.
 */
export class Controls {
  /**
   * @param {{ sound: import('../audio/sound.js').Sound, camera: import('../engine/camera.js').Camera, zoomStep?: (factor: number) => void, panel: import('./settings-panel.js').SettingsPanel, document?: Document }} parts
   */
  constructor({ sound, camera, panel, zoomStep, document = window.document }) {
    this.panel = panel;
    this.#bindSettings(document.getElementById('settings'));
    this.#bindZoom(document.getElementById('zoom-in'), zoomStep, 1.4);
    this.#bindZoom(document.getElementById('zoom-out'), zoomStep, 1 / 1.4);
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

  /** A zoom button: the same step as the + and - keys, about the visible centre (`zoomStep` is the world's). */
  #bindZoom(button, zoomStep, factor) {
    if (!button || !zoomStep) return;
    this.#keepToSelf(button);
    button.addEventListener('click', () => zoomStep(factor));
  }

  #bindHome(button, camera, body) {
    camera.onChange(c => body.classList.toggle('zoomed', c.zoomed));   // the button is shown by CSS while zoomed
    if (!button) return;
    this.#keepToSelf(button);
    button.addEventListener('click', () => camera.reset());
  }
}
