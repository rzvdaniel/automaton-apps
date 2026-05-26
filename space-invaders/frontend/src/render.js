import { ENEMY_SPRITES, PALETTE, WORLD } from './config.js'
import { getPauseMenuLayout, getSettingsMenuLayout } from './overlay-layout.js'

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
    const image = state.backgroundImage
    const blurSetting = state.settings.backgroundBlur ?? 'low'
    const blurAmount = blurSetting === 'off' ? 0 : blurSetting === 'normal' ? 1.25 : 0.6
    const imageAspect = image.width / image.height
    const worldAspect = WORLD.width / WORLD.height
    let sourceWidth = image.width
    let sourceHeight = image.height
    let sourceX = 0
    let sourceY = 0

    if (imageAspect > worldAspect) {
      sourceWidth = image.height * worldAspect
      sourceX = (image.width - sourceWidth) / 2
    } else {
      sourceHeight = image.width / worldAspect
      sourceY = (image.height - sourceHeight) / 2
    }

    context.save()
    context.filter = blurAmount > 0 ? `blur(${blurAmount}px)` : 'none'
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, WORLD.width, WORLD.height)
    context.restore()

    context.save()
    const rimGlow = context.createRadialGradient(
      WORLD.width * 0.55,
      WORLD.height * 0.73,
      WORLD.width * 0.12,
      WORLD.width * 0.55,
      WORLD.height * 0.73,
      WORLD.width * 0.34
    )
    rimGlow.addColorStop(0, 'rgba(120, 220, 255, 0)')
    rimGlow.addColorStop(0.72, 'rgba(120, 220, 255, 0.04)')
    rimGlow.addColorStop(1, 'rgba(120, 220, 255, 0.1)')
    context.fillStyle = rimGlow
    context.fillRect(0, 0, WORLD.width, WORLD.height)
    context.restore()

    const shade = context.createLinearGradient(0, 0, 0, WORLD.height)
    shade.addColorStop(0, 'rgba(4, 8, 18, 0.1)')
    shade.addColorStop(0.5, 'rgba(4, 8, 18, 0.02)')
    shade.addColorStop(1, 'rgba(2, 5, 15, 0.2)')
    context.fillStyle = shade
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  const gameplayContrast = context.createLinearGradient(0, 0, 0, WORLD.height)
  gameplayContrast.addColorStop(0, 'rgba(4, 10, 22, 0.28)')
  gameplayContrast.addColorStop(0.22, 'rgba(4, 10, 22, 0.18)')
  gameplayContrast.addColorStop(0.45, 'rgba(4, 10, 22, 0.06)')
  gameplayContrast.addColorStop(0.7, 'rgba(4, 10, 22, 0)')
  context.fillStyle = gameplayContrast
  context.fillRect(0, 0, WORLD.width, WORLD.height)

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
      { label: 'SCORE', value: String(state.score).padStart(6, '0'), x: 44 },
      { label: 'WAVE', value: String(state.wave).padStart(2, '0'), x: compactHud ? 270 : 266 },
      { label: 'LIVES', value: String(state.player.lives), x: compactHud ? 500 : 506 }
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
    context.shadowColor = 'rgba(255, 92, 140, 0.9)'
    context.shadowBlur = 16
    context.fillStyle = '#ff5c8c'
    context.fillRect(bullet.x - 4, bullet.y - bullet.height / 2, 8, bullet.height)
    context.fillStyle = '#ffd37b'
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
  const settingsOpen = state.settingsOpen
  if (state.started && state.running && state.overlayTimer <= 0 && !state.paused) return
  const pausedMenu = !settingsOpen && state.paused && state.running
  const mobilePauseMenu = !desktopMode && pausedMenu
  const introOverlay = !settingsOpen && (!state.started || (!state.running && !state.paused) || (!state.paused && state.overlayTimer > 0))
  if (settingsOpen) {
    const settingsMenu = state.settingsMenu
    const { panel, dividerY, rows, closeButton, footerY } = getSettingsMenuLayout(desktopMode, settingsMenu?.items?.length ?? 7)
    context.fillStyle = 'rgba(1, 4, 12, 0.42)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const panelGradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height)
    panelGradient.addColorStop(0, 'rgba(20, 60, 90, 0.88)')
    panelGradient.addColorStop(1, 'rgba(6, 18, 34, 0.82)')
    context.fillStyle = panelGradient
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.24,
      40,
      WORLD.width / 2,
      panel.y + panel.height * 0.24,
      panel.width * 0.6
    )
    panelGlow.addColorStop(0, 'rgba(140, 247, 255, 0.12)')
    panelGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.save()
    context.strokeStyle = 'rgba(0, 200, 255, 0.16)'
    context.shadowColor = 'rgba(0, 200, 255, 0.18)'
    context.shadowBlur = 22
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.72)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(panel.x + 18, panel.y + corner)
    context.lineTo(panel.x + 18, panel.y + 18)
    context.lineTo(panel.x + corner, panel.y + 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + corner)
    context.moveTo(panel.x + 18, panel.y + panel.height - corner)
    context.lineTo(panel.x + 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + corner, panel.y + panel.height - 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - corner)
    context.stroke()

    context.textAlign = 'center'
    const titleGlow = context.createRadialGradient(WORLD.width / 2, panel.y + 122, 24, WORLD.width / 2, panel.y + 122, 160)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 16
    context.font = desktopMode ? '900 52px "Arial Black", Impact, sans-serif' : '900 62px "Arial Black", Impact, sans-serif'
    context.fillText('SPACE', WORLD.width / 2, panel.y + (desktopMode ? 108 : 126))
    context.fillText('INVADERS', WORLD.width / 2, panel.y + (desktopMode ? 164 : 186))

    context.shadowBlur = 0
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panel.x + 54, dividerY)
    context.lineTo(panel.x + panel.width - 54, dividerY)
    context.stroke()

    context.fillStyle = PALETTE.cyan
    context.font = desktopMode ? '600 24px monospace' : '600 30px monospace'
    context.textAlign = 'center'
    context.fillText('SETTINGS', WORLD.width / 2, panel.y + (desktopMode ? 276 : 306))

    const titleFont = desktopMode ? 30 : 34
    const valueFont = desktopMode ? 28 : 32
    const footerFont = desktopMode ? 18 : 22
    const closeSelected = settingsMenu?.selectedIndex === settingsMenu?.items?.length

    context.textAlign = 'left'
    settingsMenu?.items?.forEach((item, index) => {
      const row = rows[index]
      const selected = settingsMenu.selectedIndex === index
      context.save()
      context.beginPath()
      context.roundRect(row.x, row.y, row.width, row.height, desktopMode ? 18 : 22)
      const rowFill = selected ? 'rgba(18, 44, 74, 0.84)' : 'rgba(7, 18, 34, 0.72)'
      context.fillStyle = rowFill
      context.fill()
      context.lineWidth = selected ? 3 : 2
      context.strokeStyle = selected ? 'rgba(140, 247, 255, 0.72)' : 'rgba(140, 247, 255, 0.18)'
      context.shadowColor = selected ? 'rgba(140, 247, 255, 0.24)' : 'transparent'
      context.shadowBlur = selected ? 24 : 0
      context.stroke()
      context.restore()

      context.fillStyle = selected ? PALETTE.white : 'rgba(238, 252, 255, 0.82)'
      context.font = `700 ${titleFont}px monospace`
      context.fillText(item.label, row.x + (desktopMode ? 26 : 30), row.y + row.height * 0.62)

      context.textAlign = 'right'
      context.fillStyle = selected ? PALETTE.cyan : 'rgba(140, 247, 255, 0.88)'
      context.font = `700 ${valueFont}px monospace`
      context.fillText(item.valueLabel, row.x + row.width - (desktopMode ? 54 : 62), row.y + row.height * 0.62)

      context.textAlign = 'center'
      context.fillStyle = selected ? PALETTE.cyan : 'rgba(140, 247, 255, 0.52)'
      context.font = `700 ${valueFont - 2}px monospace`
      context.fillText('‹', row.x + (desktopMode ? 18 : 22), row.y + row.height * 0.62)
      context.fillText('›', row.x + row.width - (desktopMode ? 24 : 28), row.y + row.height * 0.62)
      context.textAlign = 'left'
    })

    context.save()
    context.beginPath()
    context.roundRect(closeButton.x, closeButton.y, closeButton.width, closeButton.height, desktopMode ? 18 : 22)
    context.fillStyle = closeSelected ? 'rgba(255, 112, 122, 0.2)' : 'rgba(7, 18, 34, 0.68)'
    context.fill()
    context.lineWidth = closeSelected ? 3 : 2
    context.strokeStyle = closeSelected ? 'rgba(255, 130, 142, 0.8)' : 'rgba(255, 130, 142, 0.24)'
    context.stroke()
    context.restore()

    context.textAlign = 'center'
    context.fillStyle = closeSelected ? 'rgba(255, 214, 220, 0.98)' : 'rgba(255, 214, 220, 0.86)'
    context.font = `700 ${valueFont}px monospace`
    context.fillText(settingsMenu?.closeLabel ?? 'Back', closeButton.x + closeButton.width / 2, closeButton.y + closeButton.height * 0.63)

    context.fillStyle = 'rgba(196, 240, 255, 0.68)'
    context.font = `700 ${footerFont}px monospace`
    context.fillText(settingsMenu?.footerLabel ?? 'ARROWS MOVE  ENTER CHANGE  ESC CLOSE', WORLD.width / 2, footerY)
    context.textAlign = 'left'
    return
  }
  if (pausedMenu) {
    context.fillStyle = 'rgba(1, 4, 12, 0.18)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (!introOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.28)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }
  if (pausedMenu) {
    const layout = getPauseMenuLayout(desktopMode, state.muted)
    const { panel, actions } = layout
    const panelGradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height)
    panelGradient.addColorStop(0, 'rgba(28, 78, 108, 0.2)')
    panelGradient.addColorStop(1, 'rgba(10, 30, 50, 0.12)')
    context.fillStyle = panelGradient
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.32,
      40,
      WORLD.width / 2,
      panel.y + panel.height * 0.32,
      panel.width * 0.58
    )
    panelGlow.addColorStop(0, 'rgba(140, 247, 255, 0.11)')
    panelGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.save()
    context.strokeStyle = 'rgba(0, 200, 255, 0.16)'
    context.shadowColor = 'rgba(0, 200, 255, 0.18)'
    context.shadowBlur = 22
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.72)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(panel.x + 18, panel.y + corner)
    context.lineTo(panel.x + 18, panel.y + 18)
    context.lineTo(panel.x + corner, panel.y + 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + corner)
    context.moveTo(panel.x + 18, panel.y + panel.height - corner)
    context.lineTo(panel.x + 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + corner, panel.y + panel.height - 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - corner)
    context.stroke()

    context.textAlign = 'center'
    const titleGlow = context.createRadialGradient(WORLD.width / 2, panel.y + 118, 24, WORLD.width / 2, panel.y + 118, 140)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 16
    context.font = desktopMode ? '900 52px "Arial Black", Impact, sans-serif' : '900 62px "Arial Black", Impact, sans-serif'
    context.fillText('SPACE', WORLD.width / 2, panel.y + (desktopMode ? 108 : 126))
    context.fillText('INVADERS', WORLD.width / 2, panel.y + (desktopMode ? 164 : 186))

    context.shadowBlur = 0
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panel.x + 54, panel.y + (desktopMode ? 208 : 232))
    context.lineTo(panel.x + panel.width - 54, panel.y + (desktopMode ? 208 : 232))
    context.stroke()

    context.fillStyle = PALETTE.cyan
    context.font = desktopMode ? '600 22px monospace' : '600 30px monospace'
    context.fillText('PAUSED', WORLD.width / 2, panel.y + (desktopMode ? 250 : 280))
    context.fillStyle = 'rgba(140,247,255,0.58)'
    context.font = desktopMode ? '600 12px monospace' : '600 16px monospace'
    context.fillText('COMMAND LINK ACTIVE', WORLD.width / 2, panel.y + (desktopMode ? 282 : 318))

    context.font = desktopMode ? '700 24px monospace' : '700 30px monospace'
    for (const action of actions) {
      const buttonGradient = context.createLinearGradient(action.x, action.y, action.x, action.y + action.height)
      buttonGradient.addColorStop(0, 'rgba(16, 32, 54, 0.58)')
      buttonGradient.addColorStop(1, 'rgba(8, 16, 30, 0.34)')
      context.fillStyle = buttonGradient
      context.fillRect(action.x, action.y, action.width, action.height)
      context.strokeStyle = 'rgba(140, 247, 255, 0.22)'
      context.lineWidth = 1
      context.strokeRect(action.x, action.y, action.width, action.height)
      context.fillStyle = PALETTE.white
      context.fillText(action.label, WORLD.width / 2, action.y + action.height / 2 + (desktopMode ? 8 : 10))
    }
    context.textAlign = 'left'
    return
  }
  const panelWidth = introOverlay ? (desktopMode ? WORLD.width - 260 : WORLD.width - 260) : WORLD.width - 160
  const panelX = (WORLD.width - panelWidth) / 2
  const panelY = introOverlay ? (desktopMode ? 318 : 350) : 276
  const panelHeight = introOverlay ? (desktopMode ? 500 : 488) : desktopMode ? 660 : 710
  const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
  panelGradient.addColorStop(0, introOverlay ? 'rgba(28, 78, 108, 0.2)' : 'rgba(4, 10, 22, 0.82)')
  panelGradient.addColorStop(1, introOverlay ? 'rgba(10, 30, 50, 0.12)' : 'rgba(2, 6, 16, 0.72)')
  context.fillStyle = panelGradient
  context.fillRect(panelX, panelY, panelWidth, panelHeight)
  if (introOverlay) {
    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panelY + panelHeight * 0.45,
      panelWidth * 0.08,
      WORLD.width / 2,
      panelY + panelHeight * 0.45,
      panelWidth * 0.72
    )
    panelGlow.addColorStop(0, 'rgba(120, 220, 255, 0.08)')
    panelGlow.addColorStop(1, 'rgba(120, 220, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    const glow = context.createRadialGradient(
      WORLD.width / 2,
      panelY + panelHeight * 0.35,
      40,
      WORLD.width / 2,
      panelY + panelHeight * 0.35,
      panelWidth * 0.62
    )
    glow.addColorStop(0, 'rgba(140, 247, 255, 0.1)')
    glow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = glow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    context.save()
    context.strokeStyle = 'rgba(0, 200, 255, 0.16)'
    context.shadowColor = 'rgba(0, 200, 255, 0.18)'
    context.shadowBlur = 22
    context.lineWidth = 1
    context.strokeRect(panelX + 10, panelY + 10, panelWidth - 20, panelHeight - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.72)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(panelX + 18, panelY + corner)
    context.lineTo(panelX + 18, panelY + 18)
    context.lineTo(panelX + corner, panelY + 18)
    context.moveTo(panelX + panelWidth - corner, panelY + 18)
    context.lineTo(panelX + panelWidth - 18, panelY + 18)
    context.lineTo(panelX + panelWidth - 18, panelY + corner)
    context.moveTo(panelX + 18, panelY + panelHeight - corner)
    context.lineTo(panelX + 18, panelY + panelHeight - 18)
    context.lineTo(panelX + corner, panelY + panelHeight - 18)
    context.moveTo(panelX + panelWidth - corner, panelY + panelHeight - 18)
    context.lineTo(panelX + panelWidth - 18, panelY + panelHeight - 18)
    context.lineTo(panelX + panelWidth - 18, panelY + panelHeight - corner)
    context.stroke()
  } else {
    context.strokeStyle = 'rgba(140, 247, 255, 0.1)'
    context.lineWidth = 2
    context.strokeRect(panelX, panelY, panelWidth, panelHeight)
  }
  context.textAlign = 'center'
  context.shadowColor = PALETTE.cyan
  context.shadowBlur = mobilePauseMenu ? 8 : 18
  context.fillStyle = mobilePauseMenu ? 'rgba(238,252,255,0.28)' : PALETTE.white
  if (introOverlay) {
    const titleGlow = context.createRadialGradient(WORLD.width / 2, desktopMode ? 428 : 452, 24, WORLD.width / 2, desktopMode ? 428 : 452, 140)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)
    context.fillStyle = mobilePauseMenu ? 'rgba(238,252,255,0.28)' : PALETTE.white
  }
  context.font = desktopMode ? '900 76px "Arial Black", Impact, sans-serif' : '900 88px "Arial Black", Impact, sans-serif'
  context.fillText('SPACE', WORLD.width / 2, desktopMode ? 446 : 472)
  context.fillText('INVADERS', WORLD.width / 2, desktopMode ? 528 : 554)
  if (introOverlay) {
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panelX + 54, desktopMode ? 582 : 608)
    context.lineTo(panelX + panelWidth - 54, desktopMode ? 582 : 608)
    context.stroke()
  }
  context.shadowBlur = 0
  context.fillStyle = PALETTE.cyan
  if (!mobilePauseMenu) {
    const insertCoinPulse = introOverlay ? 0.72 + ((Math.sin(state.elapsed * 4.6) + 1) / 2) * 0.28 : 1
    context.fillStyle = introOverlay ? `rgba(140,247,255,${insertCoinPulse})` : PALETTE.cyan
    context.font = desktopMode ? '600 32px monospace' : '600 42px monospace'
    const headline = state.paused ? 'PAUSED' : state.message
    context.fillText(headline, WORLD.width / 2, introOverlay ? (desktopMode ? 642 : 678) : desktopMode ? 690 : 700)
  }
  if (!mobilePauseMenu && (!desktopMode || state.settings.keyboardHint)) {
    context.fillStyle = 'rgba(238,252,255,0.82)'
    if (desktopMode) {
      context.font = '500 24px monospace'
      context.fillText('ARROWS / A D MOVE   SPACE / ENTER FIRE   P PAUSE   M MUTE', WORLD.width / 2, 770)
    } else {
      context.font = introOverlay ? '700 40px monospace' : '700 34px monospace'
      context.fillText('\u25c0  \u25b6 MOVE', WORLD.width / 2, introOverlay ? 760 : 760)
      context.fillText('TAP FIRE', WORLD.width / 2, introOverlay ? 812 : 804)
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
