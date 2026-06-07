export class GameLoop {
  constructor({ onTick }) {
    this._onTick = onTick
    this._rafId = null
    this._lastTime = 0
  }

  start() {
    const tick = (timestamp) => {
      const dt = Math.min(0.032, (timestamp - this._lastTime) / 1000 || 0)
      this._lastTime = timestamp
      this._onTick(dt, timestamp)
      this._rafId = requestAnimationFrame(tick)
    }
    this._rafId = requestAnimationFrame(tick)
  }

  stop() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }
}
