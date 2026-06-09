import { ENEMY_SPRITES, PALETTE, UFO_SPRITES, WORLD } from './config.js'
import { getPauseMenuLayout } from './overlay-layout.js'
import { BossRenderer } from './rendering/BossRenderer.js'
import { SettingsMenuRenderer } from './settings-menu-renderer.js'

const spriteCache = new Map()
let scanlineCanvas = null
const settingsMenuRenderer = new SettingsMenuRenderer()
const bossRenderer = new BossRenderer()

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
    const levelTint = state.backgroundDefinition?.tint
    const glowColor = state.backgroundDefinition?.glowColor ?? 'rgba(120, 220, 255, 0.1)'
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

    if (levelTint) {
      context.save()
      context.fillStyle = levelTint
      context.fillRect(0, 0, WORLD.width, WORLD.height)
      context.restore()
    }

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
    rimGlow.addColorStop(0.72, glowColor.replace(/0?\.\d+\)$/, '0.04)'))
    rimGlow.addColorStop(1, glowColor)
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
    { label: 'LEVEL', value: String(state.level).padStart(2, '0'), x: compactHud ? 252 : 248 },
    { label: 'WAVE', value: String(state.waveInLevel).padStart(2, '0'), x: compactHud ? 446 : 452 },
    { label: 'LIVES', value: String(state.player.lives), x: compactHud ? 642 : 652 }
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
  const isCommander = enemy.rank === 'commander'
  const spriteRank = isCommander ? 'elite' : enemy.rank
  const pixelSize = Math.max(1, Math.round(enemy.width / 8))
  const warningPulse = enemy.diveWarning > 0 ? 0.55 + ((Math.sin(elapsed * 28) + 1) / 2) * 0.45 : 1
  const commanderPulse = isCommander ? 0.74 + ((Math.sin(elapsed * 8.5 + enemy.phase) + 1) / 2) * 0.26 : 1
  const bob = Math.sin(elapsed * 5 + enemy.phase) * (settings.reducedMotion ? 1 : 2.5)
  const x = enemy.x + (enemy.diveWarning > 0 && !settings.reducedMotion ? Math.sin(elapsed * 44 + enemy.phase) * 3.5 : 0)
  const y = enemy.y + bob
  const spriteKey = spriteRank + (Math.sin(elapsed * 4.2 + enemy.phase) > 0 ? '' : 'Alt')
  const color = enemy.palette?.color ?? (spriteRank === 'elite' ? PALETTE.magentaSoft : spriteRank === 'mid' ? PALETTE.amber : '#75ffd2')
  const glow = enemy.palette?.glow ?? (spriteRank === 'elite' ? 'rgba(255, 88, 216, 0.38)' : spriteRank === 'mid' ? 'rgba(255, 211, 107, 0.34)' : 'rgba(64, 247, 196, 0.34)')
  context.save()
  context.globalAlpha = warningPulse
  if (isCommander) {
    context.shadowColor = glow
    context.shadowBlur = 22
    context.strokeStyle = `rgba(255, 235, 255, ${0.3 + commanderPulse * 0.24})`
    context.lineWidth = 3
    context.strokeRect(x - 8, y - 8, enemy.width + 16, enemy.height + 16)
  }
  drawPixelSprite(context, ENEMY_SPRITES[spriteKey], x, y, pixelSize, color, glow, settings.spriteStyle)
  if (isCommander) {
    context.globalAlpha = 0.28 + commanderPulse * 0.2
    context.fillStyle = PALETTE.white
    context.fillRect(x + enemy.width * 0.42, y + enemy.height * 0.38, enemy.width * 0.16, Math.max(3, enemy.height * 0.08))
    if ((enemy.hp ?? 1) < (enemy.maxHp ?? 1)) {
      context.globalAlpha = 0.28
      context.fillStyle = '#ff7ad3'
      context.fillRect(x + enemy.width * 0.2, y + enemy.height * 0.74, enemy.width * 0.6, 4)
    }
  }
  if (enemy.damageFlash > 0) {
    context.globalAlpha = enemy.damageFlash * 0.24
    context.fillStyle = PALETTE.white
    context.fillRect(x - 4, y - 4, enemy.width + 8, enemy.height + 8)
    enemy.damageFlash = Math.max(0, enemy.damageFlash - 0.08)
  }
  if (enemy.diveWarning > 0) {
    context.globalAlpha = 0.22 + ((Math.sin(elapsed * 24) + 1) / 2) * 0.12
    context.shadowColor = PALETTE.white
    context.shadowBlur = 24
    context.strokeStyle = PALETTE.white
    context.lineWidth = 2
    context.strokeRect(x - 8, y - 8, enemy.width + 16, enemy.height + 16)
  }
  context.restore()
}

function drawUfo(context, ufo, elapsed, settings) {
  const pixelSize = Math.max(1, Math.round(ufo.width / 16))
  const bob = Math.sin(elapsed * 6 + ufo.phase) * (settings.reducedMotion ? 0.8 : 2)
  const spriteKey = Math.sin(elapsed * 7.5 + ufo.phase) > 0 ? 'ufo' : 'ufoAlt'
  const x = ufo.x - ufo.width / 2
  const y = ufo.y - ufo.height / 2 + bob
  drawPixelSprite(context, UFO_SPRITES[spriteKey], x, y, pixelSize, '#ffb46e', 'rgba(255, 148, 88, 0.34)', settings.spriteStyle)
  context.save()
  context.globalAlpha = 0.28
  context.fillStyle = 'rgba(120, 220, 255, 0.48)'
  context.fillRect(ufo.x - 18, ufo.y + 8 + bob, 36, 8)
  context.restore()
}

function drawPausedUfo(context, ufo, elapsed, settings) {
  context.save()
  context.globalAlpha = 0.46
  context.filter = 'saturate(0.5) brightness(0.72)'
  drawUfo(context, ufo, elapsed, settings)
  context.restore()
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
    const glowColor = bullet.glowColor ?? 'rgba(255, 92, 140, 0.9)'
    const coreColor = bullet.coreColor ?? '#ff5c8c'
    const tailColor = bullet.tailColor ?? '#ffd37b'
    context.shadowColor = glowColor
    context.shadowBlur = bullet.kind === 'boss-core' ? 24 : 16
    context.fillStyle = coreColor
    context.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height)
    context.fillStyle = tailColor
    context.fillRect(bullet.x - Math.max(2, bullet.width * 0.25), bullet.y + bullet.height / 2 - Math.max(6, bullet.height * 0.22), Math.max(4, bullet.width * 0.5), Math.max(6, bullet.height * 0.22))
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
  const formationLockOverlay = false
  if (state.started && state.running && state.overlayTimer <= 0 && !state.paused && !formationLockOverlay) return
  const pausedMenu = !settingsOpen && state.paused && state.running
  const mobilePauseMenu = !desktopMode && pausedMenu
  const gameOverOverlay = !settingsOpen && state.started && !state.running && !state.paused
  const victoryOverlay = gameOverOverlay && state.victory
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
    pauseFocus.addColorStop(1, 'rgba(4, 12, 24, 0.62)')
    context.fillStyle = pauseFocus
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    if (mobilePauseMenu) {
      const layout = getPauseMenuLayout()
      const panelX = WORLD.width / 2 - layout.panelWidth / 2
      const panelY = WORLD.height / 2 - layout.panelHeight / 2 + 70
      drawPanel(context, panelX, panelY, layout.panelWidth, layout.panelHeight, 24, {
        fill: 'rgba(4, 10, 22, 0.78)',
        stroke: 'rgba(140, 247, 255, 0.35)',
        shadow: 'rgba(140, 247, 255, 0.18)'
      })
      context.textAlign = 'center'
      context.fillStyle = PALETTE.white
      context.font = '900 72px monospace'
      context.fillText('PAUSED', WORLD.width / 2, panelY + 108)
      context.font = '700 28px monospace'
      context.fillStyle = 'rgba(238,252,255,0.74)'
      context.fillText('Use controls below', WORLD.width / 2, panelY + 154)
      return
    }
  }

  if (gameOverOverlay) {
    context.fillStyle = victoryOverlay ? 'rgba(0, 8, 18, 0.44)' : 'rgba(1, 4, 12, 0.64)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const focusY = victoryOverlay ? WORLD.height * 0.36 : WORLD.height * 0.48
    const focus = context.createRadialGradient(WORLD.width / 2, focusY, 120, WORLD.width / 2, focusY, 640)
    focus.addColorStop(0, victoryOverlay ? 'rgba(122,255,146,0.14)' : 'rgba(255, 76, 120, 0.12)')
    focus.addColorStop(1, 'rgba(1,4,12,0.82)')
    context.fillStyle = focus
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    context.textAlign = 'center'
    context.fillStyle = victoryOverlay ? PALETTE.cyan : PALETTE.red
    context.font = '900 76px monospace'
    context.fillText(victoryOverlay ? 'MISSION' : 'SIGNAL', WORLD.width / 2, focusY - 72)
    context.fillText(victoryOverlay ? 'COMPLETE' : 'LOST', WORLD.width / 2, focusY + 8)

    context.fillStyle = PALETTE.white
    context.font = '700 34px monospace'
    context.fillText(`FINAL SCORE ${String(state.score).padStart(6, '0')}`, WORLD.width / 2, focusY + 88)
    context.fillStyle = 'rgba(238,252,255,0.76)'
    context.font = '600 25px monospace'
    context.fillText(`HIGH SCORE ${String(state.highScore).padStart(6, '0')}`, WORLD.width / 2, focusY + 132)
    context.fillText('PRESS FIRE TO RESTART', WORLD.width / 2, focusY + 192)
    return
  }

  if (titleOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.36)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const centerY = WORLD.height * 0.47 + state.composition.overlayShiftWorld
    drawPanel(context, 86, centerY - 260, WORLD.width - 172, 520, 28, {
      fill: 'rgba(4, 10, 22, 0.76)',
      stroke: 'rgba(140, 247, 255, 0.42)',
      shadow: 'rgba(140, 247, 255, 0.18)'
    })

    context.textAlign = 'center'
    context.fillStyle = PALETTE.cyan
    context.font = '900 58px monospace'
    context.fillText('SPACE', WORLD.width / 2, centerY - 132)
    context.fillText('INVADERS', WORLD.width / 2, centerY - 64)
    context.fillStyle = PALETTE.white
    context.font = '600 28px monospace'
    context.fillText('A retro mobile arcade mission', WORLD.width / 2, centerY + 16)
    context.fillStyle = PALETTE.amber
    context.font = '700 26px monospace'
    context.fillText('PRESS FIRE TO START', WORLD.width / 2, centerY + 92)

    context.fillStyle = 'rgba(238,252,255,0.62)'
    context.font = '500 22px monospace'
    context.fillText('Move with arrows or touch zones', WORLD.width / 2, centerY + 148)
    return
  }

  if (intermissionOverlay) {
    const isBossWave = state.intermission?.isBossWave
    const centerY = WORLD.height * 0.43 + state.composition.overlayShiftWorld
    const panelHeight = isBossWave ? 390 : 330
    context.fillStyle = isBossWave ? 'rgba(1, 4, 12, 0.56)' : 'rgba(1, 4, 12, 0.28)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    drawPanel(context, 98, centerY - panelHeight / 2, WORLD.width - 196, panelHeight, 28, {
      fill: isBossWave ? 'rgba(9, 6, 20, 0.84)' : 'rgba(4, 10, 22, 0.68)',
      stroke: isBossWave ? 'rgba(255, 92, 216, 0.5)' : 'rgba(140, 247, 255, 0.38)',
      shadow: isBossWave ? 'rgba(255, 92, 216, 0.18)' : 'rgba(140, 247, 255, 0.14)'
    })

    context.textAlign = 'center'
    context.fillStyle = isBossWave ? PALETTE.magenta : PALETTE.cyan
    context.font = '900 44px monospace'
    context.fillText(`LEVEL ${state.intermission?.level ?? state.level}`, WORLD.width / 2, centerY - 96)
    context.fillStyle = PALETTE.white
    context.font = '900 58px monospace'
    context.fillText(isBossWave ? 'FINAL WAVE' : `WAVE ${state.intermission?.waveInLevel ?? state.waveInLevel}`, WORLD.width / 2, centerY - 34)
    context.font = '700 27px monospace'
    context.fillStyle = isBossWave ? 'rgba(255,220,255,0.86)' : 'rgba(238,252,255,0.76)'
    context.fillText(state.intermission?.levelName ?? state.levelDefinition?.name ?? '', WORLD.width / 2, centerY + 26)
    context.font = '600 24px monospace'
    context.fillStyle = isBossWave ? 'rgba(255,190,245,0.82)' : 'rgba(238,252,255,0.62)'
    context.fillText(state.intermission?.levelSubtitle ?? state.levelDefinition?.subtitle ?? '', WORLD.width / 2, centerY + 76)
    return
  }
}

function drawPanel(context, x, y, width, height, radius, { fill, stroke, shadow }) {
  context.save()
  context.shadowColor = shadow
  context.shadowBlur = 32
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  context.fill()
  context.stroke()
  context.restore()
}

export function renderScene(context, canvas, state, elapsed, desktopMode) {
  const width = canvas.width / (Math.min(window.devicePixelRatio || 1, 2))
  const height = canvas.height / (Math.min(window.devicePixelRatio || 1, 2))
  context.save()
  context.setTransform(state.scale, 0, 0, state.scale, state.offsetX, state.offsetY)
  context.imageSmoothingEnabled = false

  drawBackground(context, state)

  if (state.shake.duration > 0 && state.shake.power > 0) {
    const shakeScale = state.settings.screenShake === 'low' ? 0.55 : 1
    context.translate((Math.random() - 0.5) * state.shake.power * shakeScale, (Math.random() - 0.5) * state.shake.power * shakeScale)
    state.shake.duration -= 0.016
    state.shake.power *= 0.9
    state.shake.cooldown = Math.max(0, state.shake.cooldown - 0.016)
  }

  if (state.waveArrivalTimer > 0 && state.enemies.length) {
    const arrivalProgress = 1 - state.waveArrivalTimer / Math.max(0.001, state.waveArrivalDuration)
    for (const enemy of state.enemies) {
      drawEnemyArrival(context, enemy, elapsed, state.settings, arrivalProgress)
    }
  } else {
    for (const enemy of state.enemies) {
      if (state.paused || !state.running) drawPausedEnemy(context, enemy, elapsed, state.settings)
      else drawEnemy(context, enemy, elapsed, state.settings)
    }
  }

  if (state.ufo) {
    if (state.paused || !state.running) drawPausedUfo(context, state.ufo, elapsed, state.settings)
    else drawUfo(context, state.ufo, elapsed, state.settings)
  }

  bossRenderer.draw(context, state.boss, state.bossSprite, elapsed, state.settings)

  drawProjectiles(context, state)
  drawShip(context, state, elapsed)
  drawParticles(context, state.particles)
  drawEffects(context, state)
  drawHud(context, state, desktopMode)
  drawOverlay(context, state, desktopMode)

  context.restore()

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, state.offsetY)
  context.clearRect(0, state.offsetY + WORLD.height * state.scale, width, height)
  context.restore()
}
