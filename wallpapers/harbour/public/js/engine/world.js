import { rng } from '../core/math.js';
import { Viewport } from './viewport.js';
import { Camera } from './camera.js';
import { Terrain } from './terrain.js';
import { Wind } from './wind.js';
import { Settings } from '../sky/settings.js';
import { Place } from '../sky/place.js';
import { SkyClock } from '../sky/sky-clock.js';
import { DayCycle } from '../sky/day-cycle.js';
import { Weather } from '../sky/weather.js';
import { CloudBank } from './cloud-bank.js';
import { Effects } from './effects.js';
import { Scene } from './scene.js';
import { Presence } from './presence.js';
import { Interaction } from './interaction.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { FrameLoop } from './frame-loop.js';
import { QualityMonitor } from './quality-monitor.js';
import { DebugPanel } from './debug-panel.js';
import { buildIsland } from '../island/builder.js';

/** A sound that does nothing: for a world with no audio (tests, the gallery). */
const SILENT = { play() {}, live: false, on: false };
const DAY_EVERY = 1;   // seconds between updates of the time of day

/**
 * The world is where everything meets. It owns the parts, each with one job, and hands entities the few things they need:
 *
 *   viewport     screen size and scale           camera       zoom and pan
 *   terrain      the land and the shore          windField    the wind: its direction, strength and gusts
 *   effects      ripples, spray, bell rings      scene        the entities, and drawing them in order
 *   interaction  what a tap or hover does        input        mouse, finger and pen gestures
 *   renderer     the canvases and the picture    loop         one step per frame
 *   settings     the viewer's choices (saved)    place        where the island is (city, latitude, longitude)
 *   skyClock     the time the island shows       day          dawn, day, dusk or night, the light, where shadows fall
 *   presence     who is out at this hour (balloons by day, the fox by night)
 *   weather      how cloudy it is (changing slowly over hours)   cloudBank    keeps the number of clouds in step with it
 *
 * Without a `stage` it runs headless (no page, no drawing): that is how the tests build islands.
 */
export class World {
  /**
   * @param {{ stage?: HTMLElement, sound?: object, width?: number, height?: number, debug?: boolean }} options
   */
  constructor({ stage = null, sound = SILENT, width, height, debug, settings } = {}) {
    const headless = !stage;
    this.sound = sound;
    this.debug = debug ?? (typeof location !== 'undefined' && /[?&](debug|all)\b/.test(location.search));   // ?debug shows every extra element and a status panel
    this.clock = 0; this.seed = undefined; this.errors = [];

    this.viewport = headless ? new Viewport({ width, height }) : new Viewport({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio });
    this.camera = new Camera(this.viewport);
    this.terrain = new Terrain();
    this.windField = new Wind();
    this.settings = settings ?? new Settings({ storage: headless ? null : undefined });   // headless worlds (tests) never touch the browser's storage
    this.place = new Place({ settings: this.settings });
    this.skyClock = new SkyClock({ settings: this.settings, place: this.place });
    this.weather = new Weather({ settings: this.settings });
    this.cloudBank = new CloudBank(this);
    this.day = new DayCycle(); this.#updateDay();
    this.settings.onChange(() => { this.#updateDay(); this.loop?.keepBusy(200); });   // a new time or place shows at once, not at the next tick
    this.effects = new Effects();
    this.presence = new Presence({ day: this.day, dates: () => this.#dates() });
    this.scene = new Scene({ onError: line => this.#reportError(line), presence: this.presence });
    this.interaction = new Interaction({ scene: this.scene, camera: this.camera, terrain: this.terrain, effects: this.effects, sound, onActivity: ms => this.loop?.keepBusy(ms) });
    this.quality = new QualityMonitor();

    if (!headless) {
      this.renderer = new Renderer(stage);
      this.loop = new FrameLoop((dt, gap) => this.#frame(dt, gap), { timeScale: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1 });
      this.input = new Input(window, this.#gestureHandler()).start();
      this.panel = this.debug ? new DebugPanel(document) : null;
      this.camera.onChange(() => this.#updateCursor(false));
      window.addEventListener('resize', () => this.resize(innerWidth, innerHeight, devicePixelRatio));
      this.renderer.resize(this.viewport);
    }
  }

  // ---------- what entities may use ----------
  get hw() { return this.viewport.hw; }
  get hh() { return this.viewport.hh; }
  get map() { return this.terrain.map; }
  get wind() { return this.windField.vector; }
  /** How strong the wind is, 0 calm .. 1 stormy (see Wind). */
  get windStrength() { return this.windField.strength; }
  /** How much more than usual wind-blown things move: 1 at an ordinary breeze, less when calm, about twice in a storm. */
  get windPush() { return this.windField.push; }
  get mouse() { return this.interaction.pointer; }
  field(x, y) { return this.terrain.field(x, y); }
  grad(x, y) { return this.terrain.grad(x, y); }
  pushIn(p, depth) { return this.terrain.pushIn(p, depth); }
  sway(x, y) { return this.windField.sway(x, y, this.clock); }
  add(entity) { return this.scene.add(entity); }
  all(Type) { return this.scene.all(Type); }
  count(Type) { return this.scene.count(Type); }
  ripple(x, y, strength) { this.effects.ripple(x, y, strength); }
  burst(x, y, n, speed, color, size, life) { this.effects.burst(x, y, n, speed, color, size, life); }
  ring(x, y, delay) { this.effects.ring(x, y, delay); }
  scare(x, y, reach, water) { this.scene.scare(x, y, reach, water); }

  // ---------- building and running ----------
  /** Forgets the island so a new one can be built. */
  reset() { this.scene.clear(); this.terrain.reset(); this.effects.clear(); this.windField.setAngle(0); }

  /** Builds the island for a seed (the same seed always builds the same island) and brings the camera back to the whole view. */
  generate(seed) {
    this.seed = seed; this.camera.reset(true);
    const G = rng(seed);
    for (let attempt = 0; attempt < 40; attempt++) if (buildIsland(this, G)) break;
    this.renderer?.backdrop.setLand(this.terrain.map.land);
    console.log(`Harbour seed ${seed}`);
  }

  start() { this.loop?.start(); }

  /** Advances the island by dt seconds. */
  update(dt) {
    this.clock += dt;
    if (Math.abs(this.clock - this.dayAt) >= DAY_EVERY) this.#updateDay();
    if (this.camera.ease(dt)) this.loop?.keepBusy(200);   // still zooming: stay at full speed
    this.effects.update(dt);
    this.scene.update(dt);
  }

  /** Paints the island as it is now. */
  render() {
    this.renderer?.render({ viewport: this.viewport, camera: this.camera, terrain: this.terrain, effects: this.effects, scene: this.scene, time: this.clock, light: this.day.light, darkness: this.day.darkness, wind: this.windField, waves: this.settings.get('waves') });
    this.panel?.update(performance.now(), { entities: this.scene.entities.length, zoom: this.camera.zoom, soundOn: this.sound.live, errors: this.errors, wind: this.windField.strength, clock: `${this.skyClock.text()} ${this.place.current.city}${this.skyClock.isNow ? '' : ' (set)'}` });
  }

  #frame(dt, gapMs) {
    if (this.quality.sample(gapMs) && this.viewport.lowerQuality()) this.renderer.resize(this.viewport);   // a slow device draws fewer pixels
    this.update(dt);
    this.render();
  }

  /** The screen changed size (or the phone turned). A turn lays the island out again for the new shape. */
  resize(width, height, dpr) {
    const turned = this.viewport.resize(width, height, dpr);
    this.renderer?.resize(this.viewport);
    this.camera.clampToWorld();
    if (turned && this.seed !== undefined) this.generate(this.seed);
  }

  /**
   * Which day and which night the island shows, at the place, as text: the seeds Presence draws who is out from. A night
   * runs from noon to noon (its date is the evening's), so the draw never changes in the dark.
   */
  #dates() {
    const now = this.skyClock.now().getTime(), date = t => { const l = this.place.local(new Date(t)); return `${l.year}-${l.month}-${l.day}`; };
    return { day: date(now), night: date(now - 12 * 3600000) };
  }
  /** The sun and the weather move slowly: they are worked out again every DAY_EVERY seconds, not every frame. */
  #updateDay() {
    const seconds = this.clock - (this.dayAt ?? this.clock), now = this.skyClock.now();
    this.dayAt = this.clock;
    this.weather.update(now, seconds);
    this.windField.update({ setting: this.settings.get('wind'), cover: this.weather.cover, date: now, day: Wind.dayAt(this.place, now), seconds });
    this.day.update(now, this.place.current, this.weather.cover);
    if (seconds > 0) this.cloudBank.update(seconds);   // not while the island is being built: its clouds come from its seed
  }

  /** One broken entity is reported once; the rest of the island carries on. */
  #reportError(line) {
    if (this.errors.length < 20) this.errors.push(line);
    console.error(`Harbour: ${line} failed; it was removed from the scene.`);
  }

  #updateCursor(dragging) { this.renderer?.setCursor(this.camera.zoomed ? (dragging ? 'grabbing' : 'grab') : ''); }

  /** What the gesture recogniser tells the world to do. */
  #gestureHandler() {
    const { camera, interaction } = this, busy = ms => this.loop.keepBusy(ms);
    return {
      tap: (x, y) => interaction.tap(x, y),
      hover: (x, y) => interaction.hover(x, y),
      leave: () => interaction.leave(),
      pan: (dx, dy) => { camera.panBy(dx, dy); busy(1500); },
      zoom: (factor, x, y, instant) => { camera.zoomAt(factor, x, y, instant); busy(1500); },
      dragging: on => this.#updateCursor(on),
      isZoomed: () => camera.zoomed,
      zoomLevel: () => camera.targetZoom,
      key: key => {
        if (key === 'n' || key === 'N') this.generate(Math.floor(Math.random() * 1e9));
        else if (key === '+' || key === '=') camera.zoomAt(1.4, this.viewport.width / 2, this.viewport.height / 2);
        else if (key === '-' || key === '_') camera.zoomAt(1 / 1.4, this.viewport.width / 2, this.viewport.height / 2);
        else if (key === '0') camera.reset();
      }
    };
  }
}
