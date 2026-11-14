import { disc } from '../core/draw.js';
import { Backdrop } from './backdrop.js';
import { LAYERS, LIGHTS, CLOUD_SHADE } from './scene.js';
import { Lighting } from './lighting.js';

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
  }

  /** Sizes both canvases for the viewport. */
  resize(viewport) {
    this.backdrop.resize(Math.round(viewport.width * viewport.glScale), Math.round(viewport.height * viewport.glScale));
    this.canvas.width = this.lightsCanvas.width = Math.round(viewport.width * viewport.dpr);
    this.canvas.height = this.lightsCanvas.height = Math.round(viewport.height * viewport.dpr);
  }
  setCursor(cursor) { this.canvas.style.cursor = cursor; }

  /** @param {{ viewport, camera, terrain, effects, scene, time: number, light?: object, darkness?: number }} frame everything a picture is made of */
  render({ viewport, camera, terrain, effects, scene, time, light, darkness = 0 }) {
    const c = this.ctx, { canvas, backdrop } = this;
    if (light) this.lighting.apply(light);
    backdrop.render({ viewport, camera, terrain, effects, time });
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    if (!backdrop.gl) { c.fillStyle = '#16aed0'; c.fillRect(0, 0, canvas.width, canvas.height); }   // no WebGL: a flat sea and plain land
    camera.applyTo(c);
    if (!backdrop.gl) terrain.map.land.forEach(b => disc(c, b[0], b[1], b[2], '#a9d277'));
    c.lineCap = 'round'; c.lineJoin = 'round';
    const k = viewport.scale * camera.zoom, halfW = viewport.width / (2 * k), halfH = viewport.height / (2 * k);
    const view = { minX: camera.x - halfW, maxX: camera.x + halfW, minY: camera.y - halfH, maxY: camera.y + halfH };   // what is on screen, in world units
    for (const layer of LAYERS) {
      if (layer === 'effects') effects.draw(c);
      scene.drawLayer(layer, c, time, () => camera.applyTo(c), view);
    }
    this.#drawLights({ camera, scene, time, view, darkness });
  }

  /** The night lights, added on top (by day the canvas is just left empty). */
  #drawLights({ camera, scene, time, view, darkness }) {
    const l = this.lights, { lightsCanvas } = this;
    if (darkness <= 0) {
      if (this.lightsShown) { l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height); this.lightsShown = false; }
      return;
    }
    l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height);
    camera.applyTo(l); l.globalCompositeOperation = 'lighter';   // light adds to light
    scene.drawLayer(LIGHTS, l, time, () => camera.applyTo(l), view);
    l.globalCompositeOperation = 'source-over';
    scene.drawLayer(CLOUD_SHADE, l, time, () => camera.applyTo(l), view);   // clouds hide the lights under them
    this.lightsShown = true;
  }
}
