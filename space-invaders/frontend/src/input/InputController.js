export class InputController {
  constructor({ touchControls, onStartGame, onToggleMute, onTogglePause, audio }) {
    this.keys = new Set()
    this.pointer = { left: false, right: false, fire: false }
    this._zonePointers = {
      left: new Set(),
      right: new Set(),
      fire: new Set()
    }
    this._touchControls = touchControls
    this._audio = audio
    this._onStartGame = onStartGame
    this._onToggleMute = onToggleMute
    this._onTogglePause = onTogglePause

    this._boundKeyDown = this._handleKeyDown.bind(this)
    this._boundKeyUp = this._handleKeyUp.bind(this)
    this._boundBlur = this._handleBlur.bind(this)

    window.addEventListener('keydown', this._boundKeyDown)
    window.addEventListener('keyup', this._boundKeyUp)
    window.addEventListener('blur', this._boundBlur)

    this._bindHold(touchControls.left, 'left')
    this._bindHold(touchControls.right, 'right')
    this._bindHold(touchControls.fire, 'fire')
  }

  get moveLeft() {
    return this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.pointer.left
  }

  get moveRight() {
    return this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.pointer.right
  }

  get firing() {
    return this.keys.has('Space') || this.keys.has('Enter') || this.keys.has('ArrowUp') || this.pointer.fire
  }

  clearPointer() {
    this._zonePointers.left.clear()
    this._zonePointers.right.clear()
    this._zonePointers.fire.clear()
    this.pointer.left = false
    this.pointer.right = false
    this.pointer.fire = false
    this._touchControls.left.dataset.pressed = 'false'
    this._touchControls.right.dataset.pressed = 'false'
    this._touchControls.fire.dataset.pressed = 'false'
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown)
    window.removeEventListener('keyup', this._boundKeyUp)
    window.removeEventListener('blur', this._boundBlur)
  }

  _syncZone(zone) {
    const active = this._zonePointers[zone].size > 0
    this.pointer[zone] = active
    this._touchControls[zone].dataset.pressed = active ? 'true' : 'false'
  }

  _bindHold(button, key) {
    const down = async (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      button.setPointerCapture(event.pointerId)
      this._zonePointers[key].add(event.pointerId)
      this._syncZone(key)
      await this._audio.unlock()
      if (key === 'fire') this._onStartGame()
    }

    const up = (event) => {
      event.preventDefault()
      event.stopPropagation()
      this._zonePointers[key].delete(event.pointerId)
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId)
      }
      this._syncZone(key)
    }

    button.addEventListener('pointerdown', down)
    button.addEventListener('pointerup', up)
    button.addEventListener('pointercancel', up)
    button.addEventListener('lostpointercapture', up)
  }

  async _handleKeyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'KeyA', 'KeyD', 'KeyM', 'KeyP'].includes(event.code)) {
      event.preventDefault()
    }
    if (event.repeat && ['KeyM', 'KeyP'].includes(event.code)) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'KeyA', 'KeyD'].includes(event.code)) {
      await this._audio.unlock()
      this.keys.add(event.code)
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'ArrowUp') {
        this._onStartGame()
      }
    }
    if (event.code === 'KeyM') this._onToggleMute()
    if (event.code === 'KeyP') this._onTogglePause()
  }

  _handleKeyUp(event) {
    this.keys.delete(event.code)
  }

  _handleBlur() {
    this.clearPointer()
    this.keys.clear()
  }
}
