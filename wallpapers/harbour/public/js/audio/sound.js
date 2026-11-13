import { AudioEngine } from './audio-engine.js';
import { Ambience } from './ambience.js';
import { SOUNDS } from './sounds.js';

const STORAGE_KEY = 'harbour-sound';

/** Remembers the on/off choice in the browser, when it lets us. */
const preference = {
  load() { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } },
  save(on) { try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* private window: forget it */ } }
};

/**
 * What the rest of the program talks to for sound: switch it on or off, and play a named sound.
 * Off until switched on (browsers only allow sound after a click); the choice is remembered.
 */
export class Sound {
  /** @param {{ gullPan?: () => number }} options where across the screen a gull is, for the ambient calls */
  constructor({ gullPan } = {}) {
    this.engine = new AudioEngine();
    this.ambience = new Ambience(this.engine, (name, options) => this.play(name, options), gullPan);
    this.on = false;
    this.lastPlayed = {};   // when each named sound last played, so the same one never piles on itself
    this.listeners = new Set();
    if (preference.load()) this.set(true);
  }

  /** Is it audible right now? (On, and the browser has allowed it.) */
  get live() { return this.on && this.engine.live; }
  /** Runs `fn(on)` whenever sound is switched on or off. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** Where across the screen a gull is, for the ambient calls. */
  set gullPan(fn) { this.ambience.gullPan = fn; }
  /** Asks the browser to allow sound again (after a page load with sound remembered as on). */
  resume() { this.engine.resume(); }

  set(on) {
    if (on && !this.engine.start()) return;
    this.on = on; preference.save(on);
    if (on) this.ambience.start(); else { this.ambience.stop(); this.engine.stop(); }
    this.listeners.forEach(fn => fn(on));
  }
  toggle() { this.set(!this.on); }

  /**
   * Plays a named sound (see sounds.js). options: pan -1 (left) to 1 (right); level volume; entity the thing that was clicked;
   * calm true for the quiet, spaced-out kind. Does nothing while sound is off or the name is unknown.
   */
  play(name, options = {}) {
    if (!this.live) return;
    const sound = SOUNDS[name];
    if (!sound) { console.warn(`Harbour: no sound called "${name}"`); return; }
    const now = this.engine.now;
    if (now - (this.lastPlayed[name] ?? 0) < (options.calm ? 4 : 0.15)) return;
    this.lastPlayed[name] = now;
    try { sound(this.engine, now + 0.01, this.engine.out(options.pan, options.level), options); }
    catch (err) { console.error(`Harbour: sound "${name}" failed:`, err); }
  }
}
