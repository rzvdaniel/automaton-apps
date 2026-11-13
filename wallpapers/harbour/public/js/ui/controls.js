/**
 * The page's own buttons: the speaker (sound on and off) and the reset-zoom button that appears while zoomed.
 * They live in the HTML; this connects them to the sound and the camera, and keeps their taps from reaching the island.
 */
export class Controls {
  /**
   * @param {{ sound: import('../audio/sound.js').Sound, camera: import('../engine/camera.js').Camera, document?: Document }} parts
   */
  constructor({ sound, camera, document = window.document }) {
    this.#bindSound(document.getElementById('sound'), sound);
    this.#bindHome(document.getElementById('home'), camera, document.body);
    // sound remembered as on needs one tap or key press before the browser lets it play
    if (sound.on) ['pointerdown', 'keydown'].forEach(type => window.addEventListener(type, () => sound.resume(), { once: true }));
  }

  /** A button must not also click what is under it. */
  #keepToSelf(button) {
    ['pointerdown', 'pointerup', 'pointercancel', 'wheel'].forEach(type => button.addEventListener(type, e => e.stopPropagation()));
  }

  #bindSound(button, sound) {
    if (!button) return;
    this.#keepToSelf(button);
    const show = on => { button.classList.toggle('on', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    show(sound.on); sound.onChange(show);
    button.addEventListener('click', () => sound.toggle());
  }

  #bindHome(button, camera, body) {
    camera.onChange(c => body.classList.toggle('zoomed', c.zoomed));   // the button is shown by CSS while zoomed
    if (!button) return;
    this.#keepToSelf(button);
    button.addEventListener('click', () => camera.reset());
  }
}
