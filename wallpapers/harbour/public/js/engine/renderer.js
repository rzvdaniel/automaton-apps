import { disc } from '../core/draw.js';
import { Backdrop } from './backdrop.js';
import { LAYERS, LIGHTS, CLOUD_SHADE, SKY_LIGHTS } from './scene.js';
import { bulbMode, lightColour } from '../core/glow.js';
import { Lighting } from './lighting.js';

/**
 * Puts the island on the screen: owns the three canvases (the shader's backdrop at the bottom, the 2D drawing above it, and
 * the light map on top), sizes them, and paints a frame: the backdrop first, then every drawing pass of the scene through
 * the camera, then, when it is dark, the light map. The time of day's light goes over the first two at once, through Lighting.
 * At night the light map is filled with the night's colour, the lamps and windows are added to it, and it is multiplied over
 * the picture (CSS mix-blend-mode): away from a light the island is the night's colour, in a lamp's pool near white, so the
 * ground shows in its real colours. Clouds paint the night's colour over the lights beneath them, so only the lights in the
 * gaps shine. A multiply cannot brighten, so the bulbs and lit windows are also drawn as small bright dots on the main canvas.
 * By day the light map is empty and unblended, so it multiplies nothing and costs nothing.
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
  render({ viewport, camera, terrain, effects, scene, time, light, darkness = 0, wind, waves }) {
    const c = this.ctx, { canvas, backdrop } = this;
    if (light) this.lighting.apply(light, darkness > 0);
    if (wind) backdrop.setWind(wind, viewport.quality, waves);
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
      if (layer === 'clouds' && darkness > 0) this.#drawBulbs(LIGHTS, c, camera, scene, time, view);   // just under the clouds, so a cloud covers the dots below it
      scene.drawLayer(layer, c, time, () => camera.applyTo(c), view);
    }
    if (darkness > 0) this.#drawBulbs(SKY_LIGHTS, c, camera, scene, time, view);   // the plane's and the balloon's lights, above the clouds
    this.#drawLights({ camera, scene, time, view, darkness, light });
  }

  /** A pass of the lights as small bright dots on the main canvas (see bulbMode in core/glow.js). */
  #drawBulbs(pass, c, camera, scene, time, view) {
    bulbMode(true);
    try { scene.drawLayer(pass, c, time, () => camera.applyTo(c), view); } finally { bulbMode(false); }
  }

  /** The night's light map: the night's colour with the lights added (by day the canvas is just left empty). */
  #drawLights({ camera, scene, time, view, darkness, light }) {
    const l = this.lights, { lightsCanvas } = this;
    l.setTransform(1, 0, 0, 1, 0, 0);
    if (darkness <= 0) {
      if (this.lightsShown) { l.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height); lightsCanvas.style.mixBlendMode = ''; this.lightsShown = false; }
      return;
    }
    if (!this.lightsShown) lightsCanvas.style.mixBlendMode = 'multiply';
    l.globalCompositeOperation = 'source-over'; l.globalAlpha = 1;
    l.fillStyle = lightColour(light); l.fillRect(0, 0, lightsCanvas.width, lightsCanvas.height);
    camera.applyTo(l); l.globalCompositeOperation = 'lighter';   // light adds to light
    scene.drawLayer(LIGHTS, l, time, () => camera.applyTo(l), view);
    l.globalCompositeOperation = 'source-over';
    scene.drawLayer(CLOUD_SHADE, l, time, () => camera.applyTo(l), view);   // clouds paint the night's colour over the lights under them
    l.globalCompositeOperation = 'lighter';
    scene.drawLayer(SKY_LIGHTS, l, time, () => camera.applyTo(l), view);    // but not the plane's and the balloon's, up among them
    l.globalCompositeOperation = 'source-over';
    this.lightsShown = true;
  }
}
