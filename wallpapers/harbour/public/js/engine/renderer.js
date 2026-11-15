import { disc } from '../core/draw.js';
import { Backdrop } from './backdrop.js';
import { LAYERS, LIGHTS, CLOUD_SHADE, SKY_LIGHTS } from './scene.js';
import { Lighting } from './lighting.js';
import { Profiler } from './profiler.js';

const LIGHTS_SCALE = 0.5;   // the lights canvas is this much of the drawing canvas, each way

/**
 * Puts the island on the screen: owns the three canvases (the shader's backdrop at the bottom, the 2D drawing above it, and
 * the night lights on top), sizes them, and paints a frame: the backdrop first, then every drawing pass of the scene through
 * the camera, then, when it is dark, the lights. The time of day's light goes over the first two at once, through Lighting;
 * the lights canvas has no tint, so windows, lamps and the lighthouse stay warm and bright over the darkened island;
 * clouds then rub out the lights beneath them, so only the lights in the gaps shine.
 */
export class Renderer {
  /** @param {HTMLElement} stage where the canvases go */
  constructor(stage) {
    const make = () => { const canvas = document.createElement('canvas'); stage.appendChild(canvas); return canvas; };
    this.backdrop = new Backdrop(make());
    this.canvas = make();
    this.ctx = this.canvas.getContext('2d');
    this.lightsCanvas = make(); this.lightsCanvas.style.pointerEvents = 'none';   // clicks go through to the island
    this.lights = this.lightsCanvas.getContext('2d'); this.lightsShown = false;
    this.lighting = new Lighting({ canvas: this.canvas, backdrop: this.backdrop });
    this.profiler = new Profiler({ query: typeof location !== 'undefined' ? location.search : '' });
    this.lighting.disabled = this.profiler.noFilter;
  }

  /** Sizes both canvases for the viewport. */
  resize(viewport) {
    this.backdrop.resize(Math.round(viewport.width * viewport.glScale), Math.round(viewport.height * viewport.glScale));
    this.canvas.width = Math.round(viewport.width * viewport.dpr);
    this.canvas.height = Math.round(viewport.height * viewport.dpr);
    // the lights are soft glows and flat panes: a canvas a quarter the size, stretched over the screen, looks the same and is a quarter of the work
    this.lightsCanvas.width = Math.max(1, Math.round(this.canvas.width * LIGHTS_SCALE));
    this.lightsCanvas.height = Math.max(1, Math.round(this.canvas.height * LIGHTS_SCALE));
  }
  setCursor(cursor) { this.canvas.style.cursor = cursor; }

  /** @param {{ viewport, camera, terrain, effects, swirls?: object, scene, time: number, light?: object, darkness?: number }} frame everything a picture is made of */
  render({ viewport, camera, terrain, effects, swirls, scene, time, light, darkness = 0, glitter, wind, waves, palette }) {
    const c = this.ctx, { canvas, backdrop } = this;
    const P = this.profiler, T = (name, fn) => P.time(name, fn);
    if (light) T('light', () => this.lighting.apply(light));
    if (palette) backdrop.setPalette(palette);
    if (glitter) backdrop.setGlitter(glitter);
    if (wind) backdrop.setWind(wind, viewport.quality, waves);
    T('backdrop', () => backdrop.render({ viewport, camera, terrain, effects, time }));
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    if (!backdrop.gl) { c.fillStyle = '#16aed0'; c.fillRect(0, 0, canvas.width, canvas.height); }   // no WebGL: a flat sea and plain land
    camera.applyTo(c);
    if (!backdrop.gl) terrain.map.land.forEach(b => disc(c, b[0], b[1], b[2], '#a9d277'));
    c.lineCap = 'round'; c.lineJoin = 'round';
    const k = viewport.scale * camera.zoom, halfW = viewport.width / (2 * k), halfH = viewport.height / (2 * k);
    const view = { minX: camera.centreX - halfW, maxX: camera.centreX + halfW, minY: camera.centreY - halfH, maxY: camera.centreY + halfH };   // what is on screen, in world units
    for (const layer of LAYERS) {
      T(layer === 'clouds' ? 'clouds' : layer === 'effects' ? 'effects+swirls' : 'entities', () => {
        if (layer === 'effects') { effects.draw(c); swirls?.draw(c, camera.zoom, k, darkness, view); }   // the wind's swirls: above land, sea and everything standing on them, below the clouds and their shadows
        scene.drawLayer(layer, c, time, () => camera.applyTo(c), view);
      });
    }
    this.#drawLights({ camera, scene, time, view, darkness });
    P.endFrame();
  }

  /** The night lights, added on top (by day the canvas is just left empty). */
  #drawLights({ camera, scene, time, view, darkness }) {
    const l = this.lights, { lightsCanvas } = this, T = (name, fn) => this.profiler.time(name, fn);
    if (darkness <= 0 || this.profiler.noLights) {
      if (this.lightsShown) { l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height); this.lightsShown = false; }
      return;
    }
    const place = () => camera.applyTo(l, LIGHTS_SCALE);
    l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height);
    place(); l.globalCompositeOperation = 'lighter';   // light adds to light
    T('lights', () => scene.drawLayer(LIGHTS, l, time, place, view));
    l.globalCompositeOperation = 'source-over';
    T('cloudShade', () => scene.drawLayer(CLOUD_SHADE, l, time, place, view));   // clouds hide the lights under them
    l.globalCompositeOperation = 'lighter';
    T('skyLights', () => scene.drawLayer(SKY_LIGHTS, l, time, place, view));    // but not the plane's and the balloon's, up among them
    l.globalCompositeOperation = 'source-over';
    this.lightsShown = true;
  }
}
