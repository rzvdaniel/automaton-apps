import { WORLD } from './config.js'

function random(min, max) {
  return min + Math.random() * (max - min)
}

class StaticStars {
  constructor() {
    this.stars = Array.from({ length: 78 }, () => ({
      x: random(0, WORLD.width),
      y: random(0, WORLD.height),
      size: random(1, 3),
      alpha: random(0.2, 0.85),
      tint: Math.random() > 0.82 ? '140, 247, 255' : '255, 255, 255'
    }))
  }

  update() {}

  render(context) {
    for (const star of this.stars) {
      context.fillStyle = `rgba(${star.tint}, ${star.alpha})`
      context.fillRect(star.x, star.y, star.size, star.size)
    }
  }
}

class NebulaField {
  constructor() {
    this.clouds = [
      { x: 190, y: 340, radius: 430, color: '120, 72, 255', alpha: 0.26, drift: 4 },
      { x: 860, y: 600, radius: 380, color: '70, 220, 255', alpha: 0.18, drift: -5 },
      { x: 560, y: 1180, radius: 340, color: '255, 90, 180', alpha: 0.12, drift: 3 }
    ]
  }

  update(dt) {
    for (const cloud of this.clouds) {
      cloud.x += cloud.drift * dt
      if (cloud.x < -120) cloud.x = WORLD.width + 120
      if (cloud.x > WORLD.width + 120) cloud.x = -120
    }
  }

  render(context) {
    for (const cloud of this.clouds) {
      const gradient = context.createRadialGradient(cloud.x, cloud.y, 20, cloud.x, cloud.y, cloud.radius)
      gradient.addColorStop(0, `rgba(${cloud.color}, ${cloud.alpha})`)
      gradient.addColorStop(0.55, `rgba(${cloud.color}, ${cloud.alpha * 0.42})`)
      gradient.addColorStop(1, `rgba(${cloud.color}, 0)`)
      context.fillStyle = gradient
      context.fillRect(cloud.x - cloud.radius, cloud.y - cloud.radius, cloud.radius * 2, cloud.radius * 2)
    }
  }
}

export function createBackgroundEffects() {
  const backEffects = [new StaticStars(), new NebulaField()]
  const frontEffects = [new NebulaField()]

  return {
    update(dt) {
      for (const effect of [...backEffects, ...frontEffects]) effect.update(dt)
    },
    renderBehindImage(context) {
      for (const effect of backEffects) effect.render(context)
    },
    renderAboveImage(context) {
      context.save()
      context.globalCompositeOperation = 'screen'
      for (const effect of frontEffects) effect.render(context)
      context.restore()
    }
  }
}
