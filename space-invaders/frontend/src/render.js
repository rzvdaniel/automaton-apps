import { ENEMY_SPRITES, PALETTE, WORLD } from './config.js'

const spriteCache = new Map()
let scanlineCanvas = null

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

function drawBackground(context, state) {
  const gradient = context.createLinearGradient(0, 0, 0, WORLD.height)
  gradient.addColorStop(0, PALETTE.bgTop)
  gradient.addColorStop(0.45, '#070b18')
  gradient.addColorStop(1, PALETTE.bgBottom)
  context.fillStyle = gradient
  context.fillRect(0, 0, WORLD.width, WORLD.height)

  state.backgroundEffects.renderBehindImage(context)

  if (state.backgroundImage?.complete) {
    context.save()
    context.filter = 'blur(2px) saturate(0.72) brightness(0.58)'
    context.globalAlpha = 0.36
    context.translate(WORLD.width * 0.06, WORLD.height * 0.14)
    context.drawImage(state.backgroundImage, 0, 0, WORLD.width, WORLD.height)
    context.restore()

    const shade = context.createLinearGradient(0, 0, 0, WORLD.height)
    shade.addColorStop(0, 'rgba(4, 8, 18, 0.14)')
    shade.addColorStop(0.5, 'rgba(4, 8, 18, 0.04)')
    shade.addColorStop(1, 'rgba(2, 5, 15, 0.3)')
    context.fillStyle = shade
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  state.backgroundEffects.renderAboveImage(context)
}

function drawHud(context, state, desktopMode) {
  const mobileHud = !desktopMode
  const compactHud = mobileHud && window.matchMedia('(max-width: 380px)').matches

  context.fillStyle = 'rgba(6, 10, 24, 0.28)'
  context.fillRect(24, mobileHud ? 32 : 24, WORLD.width - 48, mobileHud ? 124 : 86)
  context.fillStyle = PALETTE.white

  if (mobileHud) {
    const columns = [
      { label: 'SCORE', value: String(state.score).padStart(6, '0'), x: 36 },
      { label: 'WAVE', value: String(state.wave).padStart(2, '0'), x: compactHud ? 276 : 272 },
      { label: 'LIVES', value: String(state.player.lives), x: compactHud ? 508 : 514 }
    ]

    context.textAlign = 'left'
    context.font = compactHud ? '700 28px monospace' : '700 30px monospace'
    for (const column of columns) {
      context.fillText(column.label, column.x, 70)
    }

    context.font = compactHud ? '700 38px monospace' : '700 42px monospace'
    for (const column of columns) {
      context.fillText(column.value, column.x, 118)
    }
    return
  }

  context.textAlign = 'left'
  context.font = '700 26px monospace'
  context.fillText('SCORE', 42, 56)
  context.fillText(String(state.score).padStart(6, '0'), 42, 88)
  context.fillText('WAVE', 352, 56)
  context.fillText(String(state.wave).padStart(2, '0'), 352, 88)
  context.fillText('LIVES', 554, 56)
  context.fillText(String(state.player.lives), 554, 88)
  context.fillText('HI', 776, 56)
  context.fillText(String(state.highScore).padStart(6, '0'), 776, 88)

  context.textAlign = 'right'
  context.fillStyle = state.muted ? 'rgba(255,211,107,0.88)' : 'rgba(140,247,255,0.88)'
  context.fillText(state.muted ? 'MUTE' : 'SFX', WORLD.width - 42, 56)
  context.fillStyle = state.paused ? 'rgba(255,106,122,0.92)' : 'rgba(255,255,255,0.62)'
  context.fillText(state.paused ? 'PAUSED' : 'LIVE', WORLD.width - 42, 88)
}

function drawShip(context, state, elapsed) {
  if (state.player.invulnerability > 0 && Math.floor(elapsed * 18) % 2 === 0) return
  const { x, y, visualTilt, thrust, fireFlash } = state.player
  const motionScale = state.settings.reducedMotion ? 0.35 : 1
  const enginePulse = 0.82 + Math.sin(elapsed * 14) * 0.12 * motionScale + Math.sin(elapsed * 31) * 0.06 * motionScale
  const thruster = 14 + thrust * 9 + enginePulse * 6
  const sideBias = visualTilt * 18
  const muzzleFlash = fireFlash * 18
  context.save()
  context.translate(x, y)
  context.rotate(visualTilt)

  context.fillStyle = 'rgba(12, 24, 46, 0.72)'
  context.beginPath()
  context.ellipse(0, 14, 76, 36, 0, 0, Math.PI * 2)
  context.fill()

  context.scale(0.88, 0.88)
  context.fillStyle = '#8cf7ff'
  context.beginPath()
  context.moveTo(0, -56)
  context.lineTo(22, -22)
  context.lineTo(50, -8)
  context.lineTo(70, 20)
  context.lineTo(34, 18)
  context.lineTo(18, 8)
  context.lineTo(8, 28)
  context.lineTo(-8, 28)
  context.lineTo(-18, 8)
  context.lineTo(-34, 18)
  context.lineTo(-70, 20)
  context.lineTo(-50, -8)
  context.lineTo(-22, -22)
  context.closePath()
  context.fill()

  context.fillStyle = '#4bc9ff'
  context.beginPath()
  context.moveTo(0, -44)
  context.lineTo(16, -16)
  context.lineTo(28, 6)
  context.lineTo(12, 18)
  context.lineTo(-12, 18)
  context.lineTo(-28, 6)
  context.lineTo(-16, -16)
  context.closePath()
  context.fill()

  context.fillStyle = PALETTE.white
  context.fillRect(-12, -18, 24, 26)
  context.fillRect(-38, -2, 14, 10)
  context.fillRect(24, -2, 14, 10)

  context.fillStyle = 'rgba(255, 110, 92, 0.96)'
  context.fillRect(-28, 22, 8, thruster * (0.8 - sideBias * 0.01))
  context.fillRect(-4, 26, 8, thruster)
  context.fillRect(20, 22, 8, thruster * (0.8 + sideBias * 0.01))
  context.fillStyle = 'rgba(255, 214, 160, 0.88)'
  context.fillRect(-26, 22, 4, thruster * (0.54 - sideBias * 0.008))
  context.fillRect(-2, 26, 4, thruster * 0.7)
  context.fillRect(22, 22, 4, thruster * (0.54 + sideBias * 0.008))

  if (fireFlash > 0) {
    context.fillStyle = `rgba(255,255,255,${0.45 * fireFlash})`
    context.beginPath()
    context.moveTo(0, -86 - muzzleFlash)
    context.lineTo(10, -50)
    context.lineTo(-10, -50)
    context.closePath()
    context.fill()
  }

  context.restore()
}

function drawEnemy(context, enemy, elapsed, settings) {
  const pixelSize = Math.max(1, Math.round(enemy.width / 8))
  const bob = Math.sin(elapsed * 5 + enemy.phase) * (settings.reducedMotion ? 1 : 2.5)
  const x = enemy.x
  const y = enemy.y + bob
  const spriteKey = enemy.rank + (Math.sin(elapsed * 4.2 + enemy.phase) > 0 ? '' : 'Alt')
  const color = enemy.rank === 'elite' ? PALETTE.magentaSoft : enemy.rank === 'mid' ? PALETTE.amber : '#75ffd2'
  const glow = enemy.rank === 'elite' ? 'rgba(255, 88, 216, 0.38)' : enemy.rank === 'mid' ? 'rgba(255, 211, 107, 0.34)' : 'rgba(64, 247, 196, 0.34)'
  drawPixelSprite(context, ENEMY_SPRITES[spriteKey], x, y, pixelSize, color, glow, settings.spriteStyle)
}

function drawProjectiles(context, state) {
  for (const bullet of state.bullets) {
    context.save()
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 14
    context.fillStyle = PALETTE.white
    context.fillRect(bullet.x - 3, bullet.y - bullet.height / 2, 6, bullet.height)
    context.fillStyle = PALETTE.cyan
    context.fillRect(bullet.x - 1.5, bullet.y - bullet.height / 2 - 10, 3, 10)
    context.restore()
  }

  for (const bullet of state.enemyBullets) {
    context.save()
    context.shadowColor = PALETTE.red
    context.shadowBlur = 10
    context.fillStyle = PALETTE.red
    context.fillRect(bullet.x - 4, bullet.y - bullet.height / 2, 8, bullet.height)
    context.fillStyle = PALETTE.amber
    context.fillRect(bullet.x - 2, bullet.y + bullet.height / 2 - 6, 4, 6)
    context.restore()
  }
}

function drawParticles(context, particles) {
  for (const particle of particles) {
    const alpha = particle.life / particle.maxLife
    context.save()
    context.globalAlpha = alpha
    context.shadowColor = particle.color
    context.shadowBlur = 10
    context.fillStyle = particle.color
    context.fillRect(particle.x, particle.y, particle.size, particle.size)
    context.restore()
  }
}

function drawEffects(context, state) {
  if (state.flash > 0) {
    context.fillStyle = `rgba(255,255,255,${state.flash})`
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  context.drawImage(getScanlineCanvas(), 0, 0)

  const vignette = context.createRadialGradient(
    WORLD.width / 2,
    WORLD.height / 2,
    WORLD.width * 0.16,
    WORLD.width / 2,
    WORLD.height / 2,
    WORLD.height * 0.76
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.36)')
  context.fillStyle = vignette
  context.fillRect(0, 0, WORLD.width, WORLD.height)
}

function drawOverlay(context, state, desktopMode) {
  if (state.started && state.running && state.overlayTimer <= 0 && !state.paused) return
  const mobilePauseMenu = !desktopMode && state.paused && state.running
  context.fillStyle = 'rgba(1, 4, 12, 0.6)'
  context.fillRect(0, 0, WORLD.width, WORLD.height)
  const panelWidth = WORLD.width - 160
  const panelX = 80
  const panelY = 276
  const panelHeight = desktopMode ? 660 : 710
  const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
  panelGradient.addColorStop(0, 'rgba(4, 10, 22, 0.82)')
  panelGradient.addColorStop(1, 'rgba(2, 6, 16, 0.72)')
  context.fillStyle = panelGradient
  context.fillRect(panelX, panelY, panelWidth, panelHeight)
  context.strokeStyle = 'rgba(140, 247, 255, 0.1)'
  context.lineWidth = 2
  context.strokeRect(panelX, panelY, panelWidth, panelHeight)
  context.textAlign = 'center'
  context.shadowColor = PALETTE.cyan
  context.shadowBlur = 18
  context.fillStyle = PALETTE.white
  context.font = desktopMode ? '700 86px monospace' : '700 98px monospace'
  context.fillText('SPACE', WORLD.width / 2, desktopMode ? 390 : 400)
  context.fillText('INVADERS', WORLD.width / 2, desktopMode ? 474 : 490)
  context.shadowBlur = 0
  context.fillStyle = PALETTE.cyan
  if (!mobilePauseMenu) {
    context.font = desktopMode ? '600 32px monospace' : '600 36px monospace'
    const headline = state.paused ? 'PAUSED' : state.message
    context.fillText(headline, WORLD.width / 2, desktopMode ? 690 : 700)
  }
  if (!mobilePauseMenu && (!desktopMode || state.settings.keyboardHint)) {
    context.fillStyle = 'rgba(238,252,255,0.82)'
    if (desktopMode) {
      context.font = '500 24px monospace'
      context.fillText('ARROWS / A D MOVE   SPACE / ENTER FIRE   P PAUSE   M MUTE', WORLD.width / 2, 770)
    } else {
      context.font = '700 30px monospace'
      context.fillText('HOLD \u25c0 / \u25b6 TO MOVE', WORLD.width / 2, 760)
      context.fillText('TAP FIRE', WORLD.width / 2, 804)
    }
  }
  if (!mobilePauseMenu && !state.running) {
    context.font = desktopMode ? '500 24px monospace' : '700 28px monospace'
    context.fillText('PRESS FIRE TO RESTART', WORLD.width / 2, desktopMode ? 822 : 856)
  }
  context.textAlign = 'left'
}

export function renderScene(context, canvas, state, elapsed, desktopMode) {
  const rect = canvas.getBoundingClientRect()
  context.fillStyle = '#030613'
  context.fillRect(0, 0, rect.width, rect.height)
  context.save()
  context.translate(state.offsetX + state.shake.x, state.offsetY + state.shake.y)
  context.scale(state.scale, state.scale)
  drawBackground(context, state)
  drawParticles(context, state.particles)
  for (const enemy of state.enemies) drawEnemy(context, enemy, elapsed, state.settings)
  drawProjectiles(context, state)
  drawShip(context, state, elapsed)
  drawHud(context, state, desktopMode)
  drawOverlay(context, state, desktopMode)
  drawEffects(context, state)
  context.restore()
}
