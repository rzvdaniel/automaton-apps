import { WORLD } from './config.js'

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

const UFO_BONUS_SCORES = [50, 100, 150, 300]

export class UfoEncounter {
  constructor({ audio }) {
    this.audio = audio
    this.active = null
    this.spawnTimer = this.getNextSpawnDelay(1)
  }

  getNextSpawnDelay(wave, aggressiveUfo = null) {
    const baseDelay = Math.max(10.5, 16.5 - Math.min(wave, 10) * 0.5)
    const multiplier = aggressiveUfo?.spawnDelayMultiplier ?? 1
    return randomBetween(baseDelay * multiplier, (baseDelay + 4.5) * multiplier)
  }

  reset(wave = 1, aggressiveUfo = null) {
    this.active = null
    this.spawnTimer = this.getNextSpawnDelay(wave, aggressiveUfo)
  }

  spawn(wave, aggressiveUfo = null) {
    const fromLeft = Math.random() >= 0.5
    const width = 132
    const height = 58
    const y = randomBetween(164, 248)
    const speed = (220 + wave * 12 + (aggressiveUfo?.speedBonus ?? 0)) * (fromLeft ? 1 : -1)
    this.active = {
      x: fromLeft ? -width : WORLD.width + width,
      y,
      width,
      height,
      speed,
      score: UFO_BONUS_SCORES[Math.floor(Math.random() * UFO_BONUS_SCORES.length)],
      phase: Math.random() * Math.PI * 2
    }
    this.audio.ufoPass()
  }

  update(dt, { running, paused, overlayActive, wave, aggressiveUfo = null }) {
    if (!running) {
      this.active = null
      return this.getState()
    }

    if (paused || overlayActive || wave < 2) {
      return this.getState()
    }

    if (this.active) {
      this.active.x += this.active.speed * dt
      const offscreenRight = this.active.speed > 0 && this.active.x - this.active.width / 2 > WORLD.width + 40
      const offscreenLeft = this.active.speed < 0 && this.active.x + this.active.width / 2 < -40
      if (offscreenRight || offscreenLeft) {
        this.active = null
        this.spawnTimer = this.getNextSpawnDelay(wave, aggressiveUfo)
      }
      return this.getState()
    }

    this.spawnTimer = Math.max(0, this.spawnTimer - dt)
    if (this.spawnTimer === 0) {
      this.spawn(wave, aggressiveUfo)
    }
    return this.getState()
  }

  tryHit(bulletRect, wave, aggressiveUfo = null) {
    if (!this.active) return null

    const hitbox = {
      left: this.active.x - this.active.width / 2,
      right: this.active.x + this.active.width / 2,
      top: this.active.y - this.active.height / 2,
      bottom: this.active.y + this.active.height / 2
    }

    if (!intersects(bulletRect, hitbox)) return null

    const hit = {
      x: this.active.x,
      y: this.active.y,
      score: this.active.score
    }

    this.active = null
    this.spawnTimer = this.getNextSpawnDelay(wave, aggressiveUfo)
    this.audio.ufoHit()
    return hit
  }

  getState() {
    return this.active ? { ...this.active } : null
  }
}
