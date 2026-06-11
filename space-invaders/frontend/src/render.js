import { ENEMY_SPRITES, PALETTE, UFO_SPRITES, WORLD } from './config.js'
import { getPauseMenuLayout } from './overlay-layout.js'
import { BossRenderer } from './rendering/BossRenderer.js'

const spriteCache = new Map()
let scanlineCanvas = null
const bossRenderer = new BossRenderer()
const bossBeamChargeBulletSprite = new Image()
bossBeamChargeBulletSprite.src = './images/boss-beam-charge-bullet.png'

function createBuffer(width, height) {
  const buffer = document.createElement('canvas')
  buffer.width = width
  buffer.height = height
  return buffer
}

function getCachedSprite(sprite, pixelSize, color, glow, spriteStyle = 'pixel-gaps') {
  const unit = Math.max(1, Math.round(pixelSize))
  const cacheKey = `${sprite.join('')}:${unit}:${color}:${glow}:${spriteStyle}`
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey)

  const width = sprite[0].length * unit
  const height = sprite.length * unit
  const padding = Math.max(2, Math.ceil(unit * 1.5))
  const pixelInset = spriteStyle === 'pixel-gaps' && unit >= 8 ? 0.5 : 0
  const pixelDrawSize = Math.max(1, unit - pixelInset * 2)
  const buffer = createBuffer(width + padding * 2, height + padding * 2)
  const bufferContext = buffer.getContext('2d')
  bufferContext.imageSmoothingEnabled = false
  bufferContext.shadowColor = glow
  bufferContext.shadowBlur = unit * 0.35
  bufferContext.fillStyle = color

  for (let row = 0; row < sprite.length; row += 1) {
    const line = sprite[row]
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] === '1') {
        bufferContext.fillRect(
          padding + col * unit + pixelInset,
          padding + row * unit + pixelInset,
          pixelDrawSize,
          pixelDrawSize
        )
      }
    }
  }

  const cached = { buffer, padding }
  spriteCache.set(cacheKey, cached)
  return cached
}

function getScanlineCanvas() {
  if (scanlineCanvas) return scanlineCanvas
  scanlineCanvas = createBuffer(WORLD.width, WORLD.height)
  const bufferContext = scanlineCanvas.getContext('2d')
  bufferContext.fillStyle = 'rgba(255,255,255,0.04)'
  for (let y = 0; y < WORLD.height; y += 4) {
    bufferContext.fillRect(0, y, WORLD.width, 1)
  }
  return scanlineCanvas
}

function drawPixelSprite(context, sprite, x, y, pixelSize, color, glow = color, spriteStyle = 'pixel-gaps') {
  const unit = Math.max(1, Math.round(pixelSize))
  const startX = Math.round(x)
  const startY = Math.round(y)
  const { buffer, padding } = getCachedSprite(sprite, unit, color, glow, spriteStyle)
  context.drawImage(buffer, startX - padding, startY - padding)
}

function drawBossBeamChargeBullet(context, bullet) {
  const vx = bullet.vx ?? 0
  const vy = bullet.vy ?? bullet.speed ?? 1
  const angle = Math.atan2(vy, vx) - Math.PI / 2
  const spriteSize = Math.max(28, Math.max(bullet.width, bullet.height) * 1.45)

  context.save()
  context.translate(bullet.x, bullet.y)
  context.rotate(angle)
  context.globalCompositeOperation = 'screen'
  context.shadowColor = bullet.glowColor ?? 'rgba(255, 84, 188, 0.9)'
  context.shadowBlur = 18

  if (bossBeamChargeBulletSprite.complete && bossBeamChargeBulletSprite.naturalWidth > 0) {
    context.imageSmoothingEnabled = false
    context.drawImage(
      bossBeamChargeBulletSprite,
      -spriteSize / 2,
      -spriteSize / 2,
      spriteSize,
      spriteSize
    )
  } else {
    context.fillStyle = bullet.coreColor ?? '#ffd6ff'
    context.beginPath()
    context.moveTo(0, -spriteSize * 0.45)
    context.lineTo(spriteSize * 0.3, 0)
    context.lineTo(0, spriteSize * 0.45)
    context.lineTo(-spriteSize * 0.3, 0)
    context.closePath()
    context.fill()
  }

  context.restore()
}
