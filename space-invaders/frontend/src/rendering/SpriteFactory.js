import { WORLD } from '../config.js'

const spriteCache = new Map()
let scanlineCanvas = null

function createBuffer(width, height) {
  const buffer = document.createElement('canvas')
  buffer.width = width
  buffer.height = height
  return buffer
}

export function getCachedSprite(sprite, pixelSize, color, glow, spriteStyle = 'pixel-gaps') {
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

export function getScanlineCanvas() {
  if (scanlineCanvas) return scanlineCanvas
  scanlineCanvas = createBuffer(WORLD.width, WORLD.height)
  const bufferContext = scanlineCanvas.getContext('2d')
  bufferContext.fillStyle = 'rgba(255,255,255,0.04)'
  for (let y = 0; y < WORLD.height; y += 4) {
    bufferContext.fillRect(0, y, WORLD.width, 1)
  }
  return scanlineCanvas
}

export function drawPixelSprite(context, sprite, x, y, pixelSize, color, glow = color, spriteStyle = 'pixel-gaps') {
  const unit = Math.max(1, Math.round(pixelSize))
  const startX = Math.round(x)
  const startY = Math.round(y)
  const { buffer, padding } = getCachedSprite(sprite, unit, color, glow, spriteStyle)
  context.drawImage(buffer, startX - padding, startY - padding)
}
