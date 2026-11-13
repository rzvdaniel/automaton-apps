import { disc } from '../core/draw.js';
import { Backdrop } from './backdrop.js';
import { LAYERS } from './scene.js';

/**
 * Puts the island on the screen: owns the two canvases (the shader's backdrop below, the 2D drawing above), sizes them,
 * and paints a frame: the backdrop first, then every drawing pass of the scene through the camera.
 */
export class Renderer {
  /** @param {HTMLElement} stage where the canvases go */
  constructor(stage) {
    const make = () => { const canvas = document.createElement('canvas'); stage.appendChild(canvas); return canvas; };
    this.backdrop = new Backdrop(make());
    this.canvas = make();
    this.ctx = this.canvas.getContext('2d');
  }

  /** Sizes both canvases for the viewport. */
  resize(viewport) {
    this.backdrop.resize(Math.round(viewport.width * viewport.glScale), Math.round(viewport.height * viewport.glScale));
    this.canvas.width = Math.round(viewport.width * viewport.dpr); this.canvas.height = Math.round(viewport.height * viewport.dpr);
  }
  setCursor(cursor) { this.canvas.style.cursor = cursor; }

  /** @param {{ viewport, camera, terrain, effects, scene, time: number }} frame everything a picture is made of */
  render({ viewport, camera, terrain, effects, scene, time }) {
    const c = this.ctx, { canvas, backdrop } = this;
    backdrop.render({ viewport, camera, terrain, effects, time });
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    if (!backdrop.gl) { c.fillStyle = '#16aed0'; c.fillRect(0, 0, canvas.width, canvas.height); }   // no WebGL: a flat sea and plain land
    camera.applyTo(c);
    if (!backdrop.gl) terrain.map.land.forEach(b => disc(c, b[0], b[1], b[2], '#a9d277'));
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const layer of LAYERS) {
      if (layer === 'effects') effects.draw(c);
      scene.drawLayer(layer, c, time, () => camera.applyTo(c));
    }
  }
}
