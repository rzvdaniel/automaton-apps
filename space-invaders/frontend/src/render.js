import { ENEMY_SPRITES, PALETTE, WORLD } from './config.js'
import { getPauseMenuLayout } from './overlay-layout.js'
import { SettingsMenuRenderer } from './settings-menu-renderer.js'

const spriteCache = new Map()
let scanlineCanvas = null
const settingsMenuRenderer = new SettingsMenuRenderer()

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
  const compactHud = window.matchMedia('(max-width: 380px)').matches
  const hudAlpha = !state.running ? 0.72 : 1
  const labelColor = !state.running ? 'rgba(196, 216, 234, 0.78)' : PALETTE.white
  const valueColor = !state.running ? 'rgba(226, 236, 246, 0.82)' : PALETTE.white

  context.save()
  context.globalAlpha = hudAlpha
  context.fillStyle = 'rgba(6, 10, 24, 0.28)'
  context.fillRect(24, 32, WORLD.width - 48, 124)

  const columns = [
    { label: 'SCORE', value: String(state.score).padStart(6, '0'), x: 44 },
    { label: 'WAVE', value: String(state.wave).padStart(2, '0'), x: compactHud ? 270 : 266 },
    { label: 'LIVES', value: String(state.player.lives), x: compactHud ? 500 : 506 }
  ]

  context.textAlign = 'left'
  context.font = compactHud ? '700 28px monospace' : '700 30px monospace'
  for (const column of columns) {
    context.fillStyle = labelColor
    context.fillText(column.label, column.x, 70)
  }

  context.font = compactHud ? '700 38px monospace' : '700 42px monospace'
  for (const column of columns) {
    context.fillStyle = column.label === 'LIVES' && !state.running ? 'rgba(255,106,122,0.96)' : valueColor
    context.fillText(column.value, column.x, 118)
  }
  context.restore()
}

function drawShip(context, state, elapsed) {
  if (state.player.invulnerability > 0 && Math.floor(elapsed * 18) % 2 === 0) return
  const { x, y, visualTilt, thrust, fireFlash, destroyed, destroyedAt } = state.player
  const motionScale = state.settings.reducedMotion ? 0.35 : 1
  const enginePulse = 0.82 + Math.sin(elapsed * 14) * 0.12 * motionScale + Math.sin(elapsed * 31) * 0.06 * motionScale
  const thruster = 14 + thrust * 9 + enginePulse * 6
  const sideBias = visualTilt * 18
  const muzzleFlash = fireFlash * 18
  const deathTime = destroyed ? Math.min(2.4, Math.max(0, elapsed - destroyedAt)) : 0
  const shipY = destroyed ? y + deathTime * 34 : y
  const shipRotation = destroyed ? visualTilt - deathTime * 0.24 : visualTilt
  context.save()
  context.translate(x, shipY)
  context.rotate(shipRotation)

  if (destroyed) {
    const flicker = 0.06 * Math.sin(elapsed * 14)
    context.globalAlpha = Math.max(0.58, 0.82 - deathTime * 0.1 + flicker)
  }

  context.fillStyle = destroyed ? 'rgba(8, 14, 26, 0.82)' : 'rgba(12, 24, 46, 0.72)'
  context.beginPath()
  context.ellipse(0, 14, 76, 36, 0, 0, Math.PI * 2)
  context.fill()

  context.scale(0.88, 0.88)
  context.fillStyle = destroyed ? '#5d6e86' : '#8cf7ff'
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

  context.fillStyle = destroyed ? '#7c889a' : '#4bc9ff'
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

  context.fillStyle = destroyed ? 'rgba(222, 230, 238, 0.72)' : PALETTE.white
  context.fillRect(-12, -18, 24, 26)
  context.fillRect(-38, -2, 14, 10)
  context.fillRect(24, -2, 14, 10)

  if (destroyed) {
    context.fillStyle = 'rgba(255, 110, 92, 0.72)'
    context.fillRect(-8, -6, 44, 6)
    context.fillStyle = 'rgba(255, 214, 160, 0.5)'
    context.fillRect(18, -8, 12, 3)
    context.fillRect(-30, 6, 18, 3)
    context.fillStyle = 'rgba(255, 106, 122, 0.58)'
    context.fillRect(-6, 18, 6, 18)
    context.fillRect(16, 22, 6, 12)
    context.fillStyle = `rgba(255, 210, 140, ${0.36 + (Math.sin(elapsed * 18) + 1) * 0.12})`
    context.fillRect(12, 16, 4, 10)
    context.fillRect(-22, 8, 3, 8)
  } else {
    context.fillStyle = 'rgba(255, 110, 92, 0.96)'
    context.fillRect(-28, 22, 8, thruster * (0.8 - sideBias * 0.01))
    context.fillRect(-4, 26, 8, thruster)
    context.fillRect(20, 22, 8, thruster * (0.8 + sideBias * 0.01))
    context.fillStyle = 'rgba(255, 214, 160, 0.88)'
    context.fillRect(-26, 22, 4, thruster * (0.54 - sideBias * 0.008))
    context.fillRect(-2, 26, 4, thruster * 0.7)
    context.fillRect(22, 22, 4, thruster * (0.54 + sideBias * 0.008))
  }

  if (!destroyed && fireFlash > 0) {
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

function drawPausedEnemy(context, enemy, elapsed, settings) {
  context.save()
  context.globalAlpha = enemy.rank === 'elite' ? 0.42 : enemy.rank === 'mid' ? 0.46 : 0.5
  context.filter = 'saturate(0.55) brightness(0.72)'
  drawEnemy(context, enemy, elapsed, settings)
  context.restore()
}

function drawEnemyArrival(context, enemy, elapsed, settings, arrivalProgress) {
  const easedProgress = Math.min(1, Math.max(0, (arrivalProgress - enemy.arrivalDelay) / Math.max(0.18, 1 - enemy.arrivalDelay)))
  if (easedProgress <= 0) return
  const settle = 1 - (1 - easedProgress) * (1 - easedProgress)
  const dropOffset = (1 - settle) * 180

  context.save()
  context.globalAlpha = 0.22 + settle * 0.78
  drawEnemy(context, { ...enemy, y: enemy.y - dropOffset }, elapsed, settings)

  if (!settings.reducedMotion && settle < 1) {
    context.globalAlpha = 0.08 + (1 - settle) * 0.18
    drawEnemy(context, { ...enemy, y: enemy.y - dropOffset - 26 }, elapsed, settings)
  }

  context.restore()
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
  const gameOverOverlay = !settingsOpen && state.started && !state.running && !state.paused
  const titleOverlay = !settingsOpen && !state.started
  const intermissionOverlay = !settingsOpen && state.started && state.running && !state.paused && state.overlayTimer > 0

  if (settingsOpen) {
    settingsMenuRenderer.render(context, state.settingsMenu, desktopMode)
    return
  }

  if (pausedMenu) {
    context.fillStyle = 'rgba(1, 4, 12, 0.44)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const pauseFocus = context.createRadialGradient(WORLD.width / 2, 820, 140, WORLD.width / 2, 820, 760)
    pauseFocus.addColorStop(0, 'rgba(4, 12, 24, 0.04)')
    pauseFocus.addColorStop(0.4, 'rgba(4, 12, 24, 0.16)')
    pauseFocus.addColorStop(1, 'rgba(1, 4, 12, 0.32)')
    context.fillStyle = pauseFocus
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (gameOverOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.42)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (!titleOverlay && !intermissionOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.28)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  if (pausedMenu) {
    const layout = getPauseMenuLayout(desktopMode)
    const { panel, labelY, actions } = layout
    context.fillStyle = 'rgba(3, 10, 20, 0.36)'
    context.fillRect(panel.x - 30, panel.y - 34, panel.width + 60, panel.height + 68)

    const panelGradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height)
    panelGradient.addColorStop(0, 'rgba(18, 42, 62, 0.34)')
    panelGradient.addColorStop(1, 'rgba(6, 16, 30, 0.28)')
    context.fillStyle = panelGradient
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.45,
      panel.width * 0.08,
      WORLD.width / 2,
      panel.y + panel.height * 0.45,
      panel.width * 0.72
    )
    panelGlow.addColorStop(0, 'rgba(120, 220, 255, 0.06)')
    panelGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const glow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.35,
      40,
      WORLD.width / 2,
      panel.y + panel.height * 0.35,
      panel.width * 0.62
    )
    glow.addColorStop(0, 'rgba(140, 247, 255, 0.08)')
    glow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = glow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.save()
    context.strokeStyle = 'rgba(120, 220, 255, 0.18)'
    context.shadowColor = 'rgba(120, 220, 255, 0.18)'
    context.shadowBlur = 18
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.68)'
    context.lineWidth = 2
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
    const titleGlow = context.createRadialGradient(WORLD.width / 2, labelY - (desktopMode ? 18 : 24), 24, WORLD.width / 2, labelY - (desktopMode ? 18 : 24), 140)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.fillStyle = 'rgba(232, 248, 255, 0.96)'
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 14
    context.font = desktopMode ? '900 72px "Arial Black", Impact, sans-serif' : '900 86px "Arial Black", Impact, sans-serif'
    context.letterSpacing = '0.08em'
    context.fillText('PAUSED', WORLD.width / 2, labelY)
    context.letterSpacing = '0'

    context.shadowBlur = 0
    context.font = desktopMode ? '700 32px monospace' : '700 38px monospace'
    for (const action of actions) {
      const buttonGradient = context.createLinearGradient(action.x, action.y, action.x, action.y + action.height)
      buttonGradient.addColorStop(0, 'rgba(18, 40, 62, 0.78)')
      buttonGradient.addColorStop(0.18, 'rgba(32, 76, 114, 0.34)')
      buttonGradient.addColorStop(1, 'rgba(5, 10, 20, 0.58)')
      context.fillStyle = buttonGradient
      context.fillRect(action.x, action.y, action.width, action.height)
      context.strokeStyle = 'rgba(214, 248, 255, 0.18)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(action.x + 12, action.y + 10)
      context.lineTo(action.x + action.width - 12, action.y + 10)
      context.stroke()
      context.strokeStyle = 'rgba(140, 247, 255, 0.3)'
      context.lineWidth = 1.5
      context.strokeRect(action.x, action.y, action.width, action.height)
      context.shadowColor = 'rgba(120, 220, 255, 0.12)'
      context.shadowBlur = 10
      context.fillStyle = 'rgba(238,252,255,0.92)'
      context.fillText(action.label, WORLD.width / 2, action.y + action.height / 2 + (desktopMode ? 8 : 10))
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(4, 10, 22, 0.42)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(action.x + 12, action.y + action.height - 9)
      context.lineTo(action.x + action.width - 12, action.y + action.height - 9)
      context.stroke()
    }
    context.textAlign = 'left'
    return
  }

  if (gameOverOverlay) {
    const panelWidth = desktopMode ? WORLD.width - 420 : WORLD.width - 300
    const panelHeight = desktopMode ? 348 : 404
    const panelX = (WORLD.width - panelWidth) / 2
    const panelY = desktopMode ? 604 : 706
    const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
    panelGradient.addColorStop(0, 'rgba(8, 16, 30, 0.82)')
    panelGradient.addColorStop(1, 'rgba(4, 8, 18, 0.92)')
    context.fillStyle = panelGradient
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    context.strokeStyle = 'rgba(255, 106, 122, 0.24)'
    context.lineWidth = 2
    context.strokeRect(panelX, panelY, panelWidth, panelHeight)

    context.textAlign = 'center'
    context.fillStyle = 'rgba(255, 160, 174, 0.92)'
    context.font = desktopMode ? '700 22px monospace' : '700 28px monospace'
    context.fillText('SIGNAL LOST', WORLD.width / 2, panelY + (desktopMode ? 56 : 68))

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.red
    context.shadowBlur = 18
    context.font = desktopMode ? '900 58px "Arial Black", Impact, sans-serif' : '900 72px "Arial Black", Impact, sans-serif'
    context.fillText('GAME OVER', WORLD.width / 2, panelY + (desktopMode ? 132 : 156))
    context.shadowBlur = 0

    context.strokeStyle = 'rgba(255, 130, 142, 0.2)'
    context.beginPath()
    context.moveTo(panelX + 62, panelY + (desktopMode ? 172 : 196))
    context.lineTo(panelX + panelWidth - 62, panelY + (desktopMode ? 172 : 196))
    context.stroke()

    context.fillStyle = 'rgba(238,252,255,0.78)'
    context.font = desktopMode ? '600 22px monospace' : '600 28px monospace'
    context.fillText(`WAVE ${String(state.wave).padStart(2, '0')}   SCORE ${String(state.score).padStart(6, '0')}`, WORLD.width / 2, panelY + (desktopMode ? 224 : 258))
    context.fillStyle = 'rgba(255, 180, 190, 0.86)'
    context.font = desktopMode ? '600 18px monospace' : '600 24px monospace'
    context.fillText('PILOT OFFLINE   SHIP DESTROYED', WORLD.width / 2, panelY + (desktopMode ? 266 : 306))

    context.fillStyle = 'rgba(255,255,255,0.9)'
    context.font = desktopMode ? '700 22px monospace' : '700 28px monospace'
    context.fillText(desktopMode ? 'PRESS FIRE TO RETRY' : 'TAP FIRE TO RETRY', WORLD.width / 2, panelY + (desktopMode ? 304 : 352))
    context.textAlign = 'left'
    return
  }

  if (intermissionOverlay) {
    const transitionPulse = 0.68 + ((Math.sin(state.elapsed * 4.2) + 1) / 2) * 0.22
    const incomingWave = state.intermission?.toWave ?? state.wave
    const clearedWave = state.intermission?.fromWave

    context.textAlign = 'center'

    const softGlow = context.createRadialGradient(WORLD.width / 2, 720, 40, WORLD.width / 2, 720, desktopMode ? 260 : 320)
    softGlow.addColorStop(0, `rgba(120, 220, 255, ${transitionPulse * 0.14})`)
    softGlow.addColorStop(1, 'rgba(120, 220, 255, 0)')
    context.fillStyle = softGlow
    context.fillRect(120, 470, WORLD.width - 240, 480)

    context.fillStyle = `rgba(140,247,255,${transitionPulse})`
    context.font = desktopMode ? '700 22px monospace' : '700 34px monospace'
    context.fillText(clearedWave ? 'SECTOR CLEARED' : 'HOSTILE FLEET DETECTED', WORLD.width / 2, desktopMode ? 618 : 670)

    context.strokeStyle = `rgba(140, 247, 255, ${0.12 + transitionPulse * 0.18})`
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(184, desktopMode ? 648 : 704)
    context.lineTo(WORLD.width - 184, desktopMode ? 648 : 704)
    context.stroke()

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 18
    context.font = desktopMode ? '900 60px "Arial Black", Impact, sans-serif' : '900 84px "Arial Black", Impact, sans-serif'
    context.fillText(`WAVE ${String(incomingWave).padStart(2, '0')}`, WORLD.width / 2, desktopMode ? 728 : 794)
    context.shadowBlur = 0

    context.fillStyle = 'rgba(238,252,255,0.82)'
    context.font = desktopMode ? '600 20px monospace' : '600 30px monospace'
    context.fillText(clearedWave ? `WAVE ${String(clearedWave).padStart(2, '0')} COMPLETE` : 'TACTICAL SYSTEMS ONLINE', WORLD.width / 2, desktopMode ? 780 : 854)

    context.fillStyle = 'rgba(255, 196, 144, 0.86)'
    context.font = desktopMode ? '600 18px monospace' : '600 28px monospace'
    context.fillText('INCOMING HOSTILE FLEET', WORLD.width / 2, desktopMode ? 822 : 902)
    context.textAlign = 'left'
    return
  }

  const panelWidth = titleOverlay ? (desktopMode ? WORLD.width - 260 : WORLD.width - 260) : WORLD.width - 160
  const panelX = (WORLD.width - panelWidth) / 2
  const panelY = titleOverlay ? (desktopMode ? 318 : 350) : 276
  const panelHeight = titleOverlay ? (desktopMode ? 500 : 488) : desktopMode ? 660 : 710
  const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
  panelGradient.addColorStop(0, titleOverlay ? 'rgba(28, 78, 108, 0.2)' : 'rgba(4, 10, 22, 0.82)')
  panelGradient.addColorStop(1, titleOverlay ? 'rgba(10, 30, 50, 0.12)' : 'rgba(2, 6, 16, 0.72)')
  context.fillStyle = panelGradient
  context.fillRect(panelX, panelY, panelWidth, panelHeight)

  if (titleOverlay) {
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
  if (titleOverlay) {
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
  if (titleOverlay) {
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
    const insertCoinPulse = titleOverlay ? 0.72 + ((Math.sin(state.elapsed * 4.6) + 1) / 2) * 0.28 : 1
    context.fillStyle = titleOverlay ? `rgba(140,247,255,${insertCoinPulse})` : PALETTE.cyan
    context.font = desktopMode ? '600 32px monospace' : '600 42px monospace'
    const headline = state.paused ? 'PAUSED' : state.message
    context.fillText(headline, WORLD.width / 2, titleOverlay ? (desktopMode ? 642 : 678) : desktopMode ? 690 : 700)
  }
  if (!mobilePauseMenu && (!desktopMode || state.settings.keyboardHint)) {
    context.fillStyle = 'rgba(238,252,255,0.82)'
    if (desktopMode) {
      context.font = '500 24px monospace'
      context.fillText('ARROWS / A D MOVE   SPACE / ENTER FIRE   P PAUSE   M MUTE', WORLD.width / 2, 770)
    } else {
      context.font = titleOverlay ? '700 40px monospace' : '700 34px monospace'
      context.fillText('◀  ▶ MOVE', WORLD.width / 2, titleOverlay ? 760 : 760)
      context.fillText('TAP FIRE', WORLD.width / 2, titleOverlay ? 812 : 804)
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
  const intermissionActive = state.started && state.running && !state.paused && state.overlayTimer > 0
  const arrivalActive = state.running && state.waveArrivalTimer > 0 && state.waveArrivalDuration > 0
  if (state.running && !intermissionActive) {
    if (arrivalActive) {
      const arrivalProgress = 1 - state.waveArrivalTimer / state.waveArrivalDuration
      for (const enemy of state.enemies) drawEnemyArrival(context, enemy, elapsed, state.settings, arrivalProgress)
    } else {
      const pausedEnemies = state.paused && !state.settingsOpen
      for (const enemy of state.enemies) {
        if (pausedEnemies) {
          drawPausedEnemy(context, enemy, elapsed, state.settings)
        } else {
          drawEnemy(context, enemy, elapsed, state.settings)
        }
      }
    }
    drawProjectiles(context, state)
  }
  drawShip(context, state, elapsed)
  drawHud(context, state, desktopMode)
  drawOverlay(context, state, desktopMode)
  drawEffects(context, state)
  context.restore()
}