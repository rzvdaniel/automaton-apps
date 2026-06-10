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

  const sprite = state.playerShipSprite
  const spriteWidth = 132
  const spriteHeight = 132

  if (destroyed) {
    context.globalAlpha = Math.max(0.45, 0.82 - deathTime * 0.18)
    context.filter = 'grayscale(0.4) brightness(0.85)'
  }

  if (sprite?.complete && sprite.naturalWidth > 0) {
    context.imageSmoothingEnabled = false
    context.drawImage(
      sprite,
      -spriteWidth / 2,
      -spriteHeight / 2,
      spriteWidth,
      spriteHeight
    )
  }

  if (destroyed) {
    context.fillStyle = 'rgba(255, 110, 92, 0.45)'
    context.fillRect(-18, -4, 36, 6)
    context.fillRect(12, 18, 18, 5)
  } else {
    const flameHeight = 16 + thrust * 14 + Math.sin(elapsed * 16) * 4

    context.fillStyle = 'rgba(255, 110, 92, 0.95)'
    context.fillRect(-26, 38, 8, flameHeight)
    context.fillRect(-4, 42, 8, flameHeight * 1.15)
    context.fillRect(18, 38, 8, flameHeight)

    context.fillStyle = 'rgba(255, 214, 160, 0.9)'
    context.fillRect(-24, 38, 4, flameHeight * 0.55)
    context.fillRect(-2, 42, 4, flameHeight * 0.7)
    context.fillRect(20, 38, 4, flameHeight * 0.55)
  }

  if (!destroyed && fireFlash > 0) {
    context.fillStyle = `rgba(255,255,255,${0.45 * fireFlash})`
    context.beginPath()
    context.moveTo(0, -78 - muzzleFlash)
    context.lineTo(9, -48)
    context.lineTo(-9, -48)
    context.closePath()
    context.fill()
  }

  context.restore()
}

function drawEnemy(context, enemy, elapsed, settings) {
  const pixelSize = Math.max(1, Math.round(enemy.width / 8))
  const warningPulse = enemy.diveWarning > 0 ? 0.55 + ((Math.sin(elapsed * 28) + 1) / 2) * 0.45 : 1
  const bob = Math.sin(elapsed * 5 + enemy.phase) * (settings.reducedMotion ? 1 : 2.5)
  const x = enemy.x + (enemy.diveWarning > 0 && !settings.reducedMotion ? Math.sin(elapsed * 44 + enemy.phase) * 3.5 : 0)
  const y = enemy.y + bob
  const spriteRank = enemy.rank === 'commander' ? 'elite' : enemy.rank
  const spriteKey = spriteRank + (Math.sin(elapsed * 4.2 + enemy.phase) > 0 ? '' : 'Alt')
  const color = enemy.palette?.color ?? (
    spriteRank === 'elite' ? PALETTE.magentaSoft :
    spriteRank === 'mid' ? PALETTE.amber :
    '#75ffd2'
  )
  const glow = enemy.palette?.glow ?? (
    spriteRank === 'elite' ? 'rgba(255, 186, 239, 0.71)' :
    spriteRank === 'mid' ? 'rgba(255, 211, 107, 0.34)' :
    'rgba(64, 247, 196, 0.34)'
  )
  context.save()
  context.globalAlpha = warningPulse
  drawPixelSprite(context, ENEMY_SPRITES[spriteKey], x, y, pixelSize, color, glow, settings.spriteStyle)
  if (enemy.diveWarning > 0) {
    context.globalAlpha = 0.22 + ((Math.sin(elapsed * 24) + 1) / 2) * 0.12
    context.shadowColor = PALETTE.white
    context.shadowBlur = 24
    context.strokeStyle = PALETTE.white
    context.lineWidth = 2
    context.strokeRect(x - 8, y - 8, enemy.width + 16, enemy.height + 16)
  }
  if (enemy.rank === 'commander') {
    context.globalAlpha = 0.55
    context.fillStyle = PALETTE.magenta
    context.fillRect(
      x + enemy.width * 0.42,
      y + enemy.height * 0.38,
      enemy.width * 0.16,
      Math.max(3, enemy.height * 0.08)
    )
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
  const intermissionOverlay = !settingsOpen && state.started && state.running && !state.paused && state.overlayTimer > 0

  if (settingsOpen) {
    settingsMenuRenderer.render(context, state.settingsMenu, desktopMode)
    return
  }

  if (intermissionOverlay) {
    const transitionPulse = 0.68 + ((Math.sin(state.elapsed * 4.2) + 1) / 2) * 0.22
    const incomingWave = state.intermission?.waveInLevel ?? state.waveInLevel
    const clearedWave = state.intermission?.fromWave
    const clearedProgress = clearedWave ? state.intermission?.isLevelTransition ? 5 : ((clearedWave - 1) % 5) + 1 : null
    const completedLevel = state.intermission?.completedLevel
    const fadeWindow = 0.22
    const fadeProgress = Math.min(1, state.overlayTimer / fadeWindow)
    const fadeAlpha = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)

    context.save()
    context.globalAlpha = fadeAlpha
    context.textAlign = 'center'

    const softGlow = context.createRadialGradient(WORLD.width / 2, 720, 40, WORLD.width / 2, 720, desktopMode ? 260 : 320)
    softGlow.addColorStop(0, `rgba(120, 220, 255, ${transitionPulse * 0.14})`)
    softGlow.addColorStop(1, 'rgba(120, 220, 255, 0)')
    context.fillStyle = softGlow
    context.fillRect(120, 470, WORLD.width - 240, 480)

    context.fillStyle = state.intermission?.isLevelTransition ? `rgba(255, 214, 156, ${transitionPulse})` : `rgba(140,247,255,${transitionPulse})`
    context.font = desktopMode ? '700 22px monospace' : '700 34px monospace'
    context.fillText(
      state.intermission?.isBossWave
        ? 'MOTHERSHIP APPROACHING'
        : state.intermission?.isLevelTransition
          ? `LEVEL ${String(completedLevel ?? 0).padStart(2, '0')} COMPLETE`
          : clearedWave
            ? 'SECTOR CLEARED'
            : 'HOSTILE FLEET DETECTED',
      WORLD.width / 2,
      desktopMode ? 618 : 670
    )

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
    context.fillText(state.intermission?.isBossWave ? 'WARNING' : `LEVEL ${String(state.intermission?.level ?? state.level).padStart(2, '0')}`, WORLD.width / 2, desktopMode ? 704 : 764)
    context.font = desktopMode ? '900 50px "Arial Black", Impact, sans-serif' : '900 70px "Arial Black", Impact, sans-serif'
    context.fillText(state.intermission?.isBossWave ? 'FINAL BOSS' : `WAVE ${String(incomingWave).padStart(2, '0')}`, WORLD.width / 2, desktopMode ? 768 : 836)
    context.shadowBlur = 0

    context.fillStyle = 'rgba(238,252,255,0.82)'
    context.font = desktopMode ? '600 20px monospace' : '600 30px monospace'
    context.fillText(
      state.intermission?.isBossWave
        ? 'INPUT LOCKED  STAND BY'
        : state.intermission?.isLevelTransition
          ? (state.intermission?.levelName ?? 'NEW SECTOR').toUpperCase()
          : clearedProgress
            ? `WAVE ${String(clearedProgress).padStart(2, '0')} COMPLETE`
            : 'TACTICAL SYSTEMS ONLINE',
      WORLD.width / 2,
      desktopMode ? 826 : 896
    )

    context.fillStyle = 'rgba(255, 196, 144, 0.86)'
    context.font = desktopMode ? '600 18px monospace' : '600 28px monospace'
    context.fillText((state.intermission?.levelSubtitle ?? 'INCOMING HOSTILE FLEET').toUpperCase(), WORLD.width / 2, desktopMode ? 864 : 944)

    if (state.intermission?.isBossWave) {
      context.fillStyle = 'rgba(255, 228, 236, 0.88)'
      context.font = desktopMode ? '700 16px monospace' : '700 24px monospace'
      context.fillText('WEAPONS ONLINE AFTER MOTHERSHIP ARRIVAL', WORLD.width / 2, desktopMode ? 900 : 986)
    }
    context.textAlign = 'left'
    context.restore()
    return
  }
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
    if (state.ufo) {
      if (state.paused && !state.settingsOpen) {
        drawPausedUfo(context, state.ufo, elapsed, state.settings)
      } else {
        drawUfo(context, state.ufo, elapsed, state.settings)
      }
    }
    bossRenderer.draw(context, state.boss, state.bossSprite, elapsed, state.settings)
    drawProjectiles(context, state)
  }
  drawShip(context, state, elapsed)
  drawHud(context, state, desktopMode)
  drawOverlay(context, state, desktopMode)
  drawEffects(context, state)
  context.restore()
}
