import { renderScene } from '../render.js'

export class Renderer {
  constructor(context, canvas) {
    this._context = context
    this._canvas = canvas
  }

  render(state, elapsed, desktopMode) {
    renderScene(this._context, this._canvas, state, elapsed, desktopMode)
  }
}
