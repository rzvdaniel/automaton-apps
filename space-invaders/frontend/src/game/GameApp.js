import { createAudioManager } from '../audio/AudioManager.js'
import { createBackgroundEffects } from '../background-effects.js'
import { DPR_LIMIT, PALETTE, PLAYER_COOLDOWN, PLAYER_INVULNERABILITY, STORAGE_KEYS, WORLD } from '../config.js'
import { EnemyFormation } from '../entities/EnemyFormation.js'
import { InputController } from '../input/InputController.js'
import { Renderer } from '../rendering/Renderer.js'
import { loadSettings, saveSettings } from '../settings.js'
import { rectFromCenter, rectFromTopLeft, intersects } from '../systems/CollisionSystem.js'
import { tryHitBoss, updateBoss } from '../systems/BossSystem.js'
import { getFormationEnemies, updateDivingAliens } from '../systems/DivingAliensSystem.js'
import { ProjectileManager } from '../systems/ProjectileManager.js'
import { ScoreManager } from '../systems/ScoreManager.js'
import { WaveManager } from '../systems/WaveManager.js'
import { UfoEncounter } from '../ufo-encounter.js'
import { GameLoop } from './GameLoop.js'
import { createInitialState } from './GameState.js'
import { getAbsoluteWave, getBackgroundDefinition, getLevelDefinition, getLevelProgression, LAST_LEVEL, LEVEL_DEFINITIONS, WAVES_PER_LEVEL } from '../content/levels.js'

function random(min, max) {
  return min + Math.random() * (max - min)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isCompactViewport() {
  return window.matchMedia('(max-width: 420px)').matches
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches
}

function isShortViewport() {
  return window.matchMedia('(max-height: 700px)').matches
}

function getCompositionProfile(rect) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const shellShortSide = Math.min(rect.width, rect.height)
  const shellLongSide = Math.max(rect.width, rect.height)
  const portraitRatio = rect.height / Math.max(rect.width, 1)
  const isTabletLike = shellShortSide >= 700 || shellLongSide >= 1180 || (rect.width >= 620 && portraitRatio >= 1.28)

  if (!isTabletLike) {
    return {
      progress: 0,
      enemyShiftWorld: 0,
      playerLiftWorld: 0,
      overlayShiftWorld: 0,
      pauseShiftWorld: 0,
      settingsShiftWorld: 0,
      controlsLiftPx: 0,
      controlsMaxWidthPx: 420
    }
  }

  const heightProgress = clamp((Math.max(rect.height, viewportHeight) - 980) / 520, 0, 1)
  const widthProgress = clamp((Math.max(rect.width, viewportWidth) - 620) / 280, 0, 1)
  const portraitProgress = clamp((portraitRatio - 1.58) / 0.5, 0, 1)
  const progress = clamp(Math.max(heightProgress, widthProgress * 0.92, portraitProgress * 0.78), 0, 1)

  return {
    progress,
    enemyShiftWorld: Math.round(112 * progress),
    playerLiftWorld: Math.round(184 * progress),
    overlayShiftWorld: Math.round(136 * progress),
    pauseShiftWorld: Math.round(108 * progress),
    settingsShiftWorld: Math.round(112 * progress),
    controlsLiftPx: Math.round(52 * progress),
    controlsMaxWidthPx: 420 + Math.round(200 * progress)
  }
}

export function createGame({ canvas, shell, installButton, muteButton = null, pauseButton, touchControls }) {
  const context = canvas.getContext('2d', { alpha: false })
  const audio = createAudioManager()
  const backgroundEffects = createBackgroundEffects()
  const ufoEncounter = new UfoEncounter({ audio })
  const backgroundImage = new Image()
  const bossSprite = new Image()
  const playerShipSprite = new Image()
  const settings = loadSettings()
  const defaultPlayerY = WORLD.height - 236

  const state = createInitialState({ settings, backgroundImage, backgroundEffects })
  backgroundImage.src = state.backgroundDefinition.imageSrc
  bossSprite.src = './images/mothership.png'
  state.bossSprite = bossSprite
  bossSprite.addEventListener('load', () => {
    if (bossSprite.naturalWidth > 0) {
      state.bossSpriteAspect = bossSprite.naturalHeight / bossSprite.naturalWidth
      if (state.boss) {
        state.boss.height = state.boss.width * state.bossSpriteAspect
      }
    }
  })
  playerShipSprite.src = './images/player-ship.png'
  state.playerShipSprite = playerShipSprite
  state.highScore = Number(localStorage.getItem(STORAGE_KEYS.highScore) || 0)
  state.muted = localStorage.getItem(STORAGE_KEYS.muted) === '1'
  state.desktopMode = !isMobileViewport()

  const waveManager = new WaveManager({ audio, ufoEncounter })
  const projectileManager = new ProjectileManager()
  const scoreManager = new ScoreManager(state.highScore)
  const renderer = new Renderer(context, canvas)

  function syncProjectilesToState() {
    state.bullets = projectileManager.playerBullets
    state.enemyBullets = projectileManager.enemyBullets
  }

  function getPlayerSafeY(rect = canvas.getBoundingClientRect()) {
    const controlsTop = touchControls?.fire?.getBoundingClientRect().top
    const preferredPlayerY = defaultPlayerY - state.composition.playerLiftWorld

    if (!controlsTop || controlsTop <= rect.top) return preferredPlayerY

    const clearance = isCompactViewport() ? 32 : 44
    const worldY = (controlsTop - rect.top - state.offsetY) / Math.max(state.scale, 0.001)
    const shipBottomReach = 68
    const maxSafeY = worldY - shipBottomReach - clearance

    return Math.min(preferredPlayerY, Math.max(1180, maxSafeY))
  }

  function syncPlayerVerticalPosition(rect = canvas.getBoundingClientRect()) {
    state.player.y = getPlayerSafeY(rect)
  }

  audio.setMuted(state.muted)

  function syncShellState() {
    shell.dataset.gamePaused = state.paused ? 'true' : 'false'
    shell.dataset.gameStarted = state.started ? 'true' : 'false'
    shell.dataset.gameRunning = state.running ? 'true' : 'false'
    shell.dataset.settingsOpen = state.settingsOpen ? 'true' : 'false'
    shell.dataset.controlsMode = state.settings.controls
    shell.dispatchEvent(
      new CustomEvent('game-state-change', {
        detail: {
          paused: state.paused,
          started: state.started,
          running: state.running,
          muted: state.muted,
          settingsOpen: state.settingsOpen
        }
      })
    )
  }

  function setSettingsMenuState(menuState) {
    const wasOpen = state.settingsOpen
    state.settingsMenu = menuState
    state.settingsOpen = Boolean(menuState)
    shell.dataset.settingsOpen = state.settingsOpen ? 'true' : 'false'
    if (wasOpen !== state.settingsOpen) {
      shell.dispatchEvent(new CustomEvent('settings-menu-change', { detail: { open: state.settingsOpen } }))
    }
  }

  function updateMuteButton() {
    if (!muteButton) return
    muteButton.textContent = state.muted ? '🔇' : '🔊'
    muteButton.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on')
    muteButton.setAttribute('title', state.muted ? 'Sound off' : 'Sound on')
  }

  function updatePauseButton() {
    pauseButton.dataset.state = state.paused ? 'play' : 'pause'
    pauseButton.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause')
    pauseButton.setAttribute('title', state.paused ? 'Resume' : 'Pause')
  }

  function persistHighScore() {
    scoreManager.setScore(state.score)
    scoreManager.persistHighScore()
    state.highScore = scoreManager.highScore
  }

  function resize() {
    const rect = shell.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    context.imageSmoothingEnabled = false
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.scale(dpr, dpr)
    state.scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height)
    state.offsetX = (rect.width - WORLD.width * state.scale) / 2
    state.offsetY = isMobileViewport() ? 0 : (rect.height - WORLD.height * state.scale) / 2
    state.composition = getCompositionProfile(rect)
    shell.style.setProperty('--touch-controls-bottom-offset', `${state.composition.controlsLiftPx}px`)
    shell.style.setProperty('--touch-controls-max-width', `${state.composition.controlsMaxWidthPx}px`)
    state.desktopMode = !isMobileViewport()
    syncPlayerVerticalPosition(rect)
  }

  function addParticles(x, y, color, count, force, gravity = 0) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = random(force * 0.35, force)
      const life = random(0.3, 0.85)
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity, life,
        maxLife: life,
        size: random(2, 8),
        color
      })
    }
  }

  function triggerShake(power, duration) {
    const shakeLevel = state.settings.screenShake
    if (shakeLevel === 'off') return
    const multiplier = shakeLevel === 'low' ? 0.45 : 1
    if (state.shake.cooldown > 0) return
    state.shake.power = Math.max(state.shake.power, power * multiplier)
    state.shake.duration = Math.max(state.shake.duration, duration * (shakeLevel === 'low' ? 0.8 : 1))
    state.shake.cooldown = 0.12
  }

  function getEnemyScore(enemy) {
    if (enemy.rank === 'commander') return 90
    if (enemy.rank === 'elite') return 50
    if (enemy.rank === 'mid') return 30
    return 15
  }

  function getEnemyExplosionColor(enemy) {
    if (enemy.rank === 'commander' || enemy.rank === 'elite') return PALETTE.magenta
    if (enemy.rank === 'mid') return PALETTE.amber
    return PALETTE.cyan
  }

  function spawnWave(wave, { fromWave = null } = {}) {
    waveManager.spawnWave(wave, state, { fromWave, isShortViewport: isShortViewport() })
    if (state.backgroundDefinition?.imageSrc && backgroundImage.src !== state.backgroundDefinition.imageSrc) {
      backgroundImage.src = state.backgroundDefinition.imageSrc
    }
    projectileManager.playerBullets = state.bullets
    projectileManager.enemyBullets = state.enemyBullets
  }

  function resetGame({ immediateStart = false } = {}) {
    resetGameToWave(1, { immediateStart })
  }

  function resetToIntro() {
    state.started = false
    state.running = true
    state.paused = false
    state.score = 0
    state.wave = 1
    state.waveInLevel = 1
    state.level = 1
    state.levelDefinition = getLevelDefinition(1)
    state.backgroundDefinition = getBackgroundDefinition(state.levelDefinition.backgroundId)
    state.flash = 0
    state.message = 'INSERT COIN'
    state.overlayTimer = 999
    state.intermission = null
    state.waveArrivalTimer = 0
    state.waveArrivalDuration = 0
    state.waveArrivalCuePending = false
    state.waveLockTimer = 0
    state.waveLockDuration = 0
    state.restartLockTimer = 0
    state.restartInputArmed = true
    state.divingAttackCooldown = 0
    state.divingAttackTimer = 0
    state.boss = null
    state.victory = false
    state.bullets = []
    state.enemyBullets = []
    state.enemies = []
    state.ufo = null
    state.particles = []
    state.enemyStepTimer = 0
    ufoEncounter.reset(1, null)
    projectileManager.clear()
    syncProjectilesToState()
    state.player.x = WORLD.width / 2
    syncPlayerVerticalPosition()
    state.player.cooldown = 0
    state.player.lives = 3
    state.player.invulnerability = 0
    state.player.visualTilt = 0
    state.player.thrust = 0
    state.player.fireFlash = 0
    state.player.destroyed = false
    state.player.destroyedAt = 0
    state.shake.power = 0
    state.shake.duration = 0
    state.shake.cooldown = 0
    updatePauseButton()
    syncShellState()
  }

  function resetGameToWave(startWave, { immediateStart = false, startingLives = 3 } = {}) {
    const wasStarted = state.started
    state.started = true
    state.running = true
    state.paused = false
    state.score = 0
    const progression = getLevelProgression(startWave)
    state.wave = progression.wave
    state.waveInLevel = progression.waveInLevel
    state.level = progression.level
    state.levelDefinition = getLevelDefinition(progression.level)
    state.backgroundDefinition = getBackgroundDefinition(state.levelDefinition.backgroundId)
    state.flash = 0
    state.intermission = null
    state.waveArrivalTimer = 0
    state.waveArrivalDuration = 0
    state.waveArrivalCuePending = false
    state.waveLockTimer = 0
    state.waveLockDuration = 0
    state.restartLockTimer = 0
    state.restartInputArmed = true
    state.divingAttackCooldown = 0
    state.divingAttackTimer = 0
    state.boss = null
    state.victory = false
    state.shake.power = 0
    state.shake.duration = 0
    state.shake.cooldown = 0
    state.bullets = []
    state.enemyBullets = []
    state.ufo = null
    state.particles = []
    state.enemyStepTimer = 0
    ufoEncounter.reset(startWave, state.levelDefinition?.mechanics?.aggressiveUfo ?? null)
    projectileManager.clear()
    syncProjectilesToState()
    state.player.x = WORLD.width / 2
    syncPlayerVerticalPosition()
    state.player.cooldown = 0
    state.player.lives = clamp(Math.floor(startingLives) || 3, 1, 9)
    state.player.invulnerability = 0
    state.player.visualTilt = 0
    state.player.thrust = 0
    state.player.fireFlash = 0
    state.player.destroyed = false
    state.player.destroyedAt = 0
    state.started = wasStarted
    if (immediateStart) state.started = false
    spawnWave(startWave)
    state.started = true
    syncShellState()
  }

  function setMuted(value) {
    state.muted = value
    audio.setMuted(value)
    localStorage.setItem(STORAGE_KEYS.muted, value ? '1' : '0')
    updateMuteButton()
    syncShellState()
  }

  function setPaused(value) {
    if (!state.started || !state.running) return
    state.paused = value
    updatePauseButton()
    state.message = value ? 'PAUSED' : `LEVEL ${state.level}  WAVE ${state.waveInLevel}`
    state.overlayTimer = value ? 999 : 0
    syncShellState()
  }

  function shootPlayer() {
    if (!state.running || state.paused || state.player.cooldown > 0) return
    state.player.cooldown = PLAYER_COOLDOWN
    state.player.fireFlash = 1
    const bullet = {
      x: state.player.x,
      y: state.player.y - 52,
      width: 8,
      height: 40,
      speed: 1200
    }
    projectileManager.addPlayerBullet(bullet)
    syncProjectilesToState()
    addParticles(state.player.x, state.player.y - 46, PALETTE.cyan, 7, 150, 20)
    addParticles(state.player.x, state.player.y - 54, PALETTE.white, 3, 90, 10)
    audio.shoot()
  }

  function shootEnemy(enemy) {
    if (projectileManager.enemyBullets.length >= state.maxEnemyBullets && !enemy.ignoreEnemyBulletLimit) return
    const originX = enemy.originX ?? (enemy.x + enemy.width / 2)
    const originY = enemy.originY ?? (enemy.y + enemy.height)
    const width = enemy.projectileWidth ?? 10
    const height = enemy.projectileHeight ?? 28
    const speed = enemy.projectileSpeed ?? state.enemyBulletSpeed
    const bullet = {
      x: originX,
      y: originY,
      width,
      height,
      speed,
      vx: enemy.projectileVx,
      vy: enemy.projectileVy,
      kind: enemy.projectileKind ?? 'enemy',
      glowColor: enemy.projectileGlowColor,
      coreColor: enemy.projectileCoreColor,
      tailColor: enemy.projectileTailColor
    }
    projectileManager.addEnemyBullet(bullet)
    syncProjectilesToState()
    audio.enemyShoot()
  }

  function hitPlayer() {
    if (state.player.invulnerability > 0) return
    state.player.lives -= 1
    state.player.invulnerability = PLAYER_INVULNERABILITY
    state.flash = 0.22
    triggerShake(2.6, 0.09)
    addParticles(state.player.x, state.player.y, PALETTE.cyan, 24, 320, 40)
    audio.playerHit()
    if (state.player.lives <= 0) {
      state.running = false
      state.message = 'SIGNAL LOST'
      state.overlayTimer = 999
      state.bullets = []
      state.enemyBullets = []
      state.enemies = []
      state.ufo = null
      state.player.cooldown = 0
      state.player.fireFlash = 0
      state.player.invulnerability = 0
      state.player.destroyed = true
      state.player.destroyedAt = state.elapsed
      state.player.visualTilt = -0.18
      state.player.thrust = 0
      state.restartLockTimer = 1.2
      state.restartInputArmed = false
      projectileManager.clear()
      syncProjectilesToState()
      addParticles(state.player.x, state.player.y - 10, PALETTE.red, 28, 420, 55)
      addParticles(state.player.x, state.player.y + 8, PALETTE.white, 10, 240, 35)
      persistHighScore()
      syncShellState()
    }
  }

  function triggerVictory(message = 'MISSION COMPLETE') {
    state.victory = true
    state.running = false
    state.message = message
    state.overlayTimer = 999
    state.restartLockTimer = 1.2
    state.restartInputArmed = false
    state.enemyBullets = []
    state.bullets = []
    state.ufo = null
    projectileManager.clear()
    syncProjectilesToState()
    persistHighScore()
    syncShellState()
  }

  const inputController = new InputController({
    touchControls,
    audio,
    onStartGame() {
      if (!state.started) resetGame()
    },
    onToggleMute() {
      setMuted(!state.muted)
    },
    onTogglePause() {
      setPaused(!state.paused)
    }
  })

  function update(dt) {
    const desktopMode = !isMobileViewport()
    const moveLeft = inputController.moveLeft
    const moveRight = inputController.moveRight
    const firing = inputController.firing

    state.backgroundEffects.update(dt)

    state.flash = Math.max(0, state.flash - dt * 1.7)
    state.shake.cooldown = Math.max(0, state.shake.cooldown - dt)
    state.shake.duration = Math.max(0, state.shake.duration - dt)
    state.restartLockTimer = Math.max(0, state.restartLockTimer - dt)
    if (state.shake.duration > 0) {
      state.shake.x = random(-state.shake.power, state.shake.power)
      state.shake.y = random(-state.shake.power * 0.45, state.shake.power * 0.45)
    } else {
      state.shake.power = Math.max(0, state.shake.power - dt * 40)
      state.shake.x = 0
      state.shake.y = 0
    }

    if (!state.started) {
      if (moveLeft || moveRight || firing) resetGame()
      return desktopMode
    }

    if (!state.running) {
      if (!firing) {
        state.restartInputArmed = true
      }
      if (firing && state.restartLockTimer === 0 && state.restartInputArmed) {
        state.restartInputArmed = false
        resetGame({ immediateStart: true })
      }
      return desktopMode
    }

    if (state.paused) return desktopMode

    state.overlayTimer = Math.max(0, state.overlayTimer - dt)
    state.player.cooldown = Math.max(0, state.player.cooldown - dt)
    state.player.invulnerability = Math.max(0, state.player.invulnerability - dt)
    state.player.fireFlash = Math.max(0, state.player.fireFlash - dt * 7.5)

    if (state.overlayTimer > 0) {
      for (const particle of state.particles) {
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.vx *= 0.985
        particle.vy = particle.vy * 0.988 + particle.gravity * dt
        particle.life -= dt
      }
      state.particles = state.particles.filter((particle) => particle.life > 0)
      return desktopMode
    }

    state.intermission = null

    if (state.waveArrivalCuePending && state.waveArrivalTimer > 0) {
      audio.waveArrival()
      state.waveArrivalCuePending = false
    }

    state.ufo = ufoEncounter.update(dt, {
      running: state.running,
      paused: state.paused,
      overlayActive: state.overlayTimer > 0 || state.waveArrivalTimer > 0 || state.waveLockTimer > 0,
      wave: state.wave,
      aggressiveUfo: state.levelDefinition?.mechanics?.aggressiveUfo ?? null
    })

    if (state.waveArrivalTimer > 0) {
      state.waveArrivalTimer = Math.max(0, state.waveArrivalTimer - dt)
      for (const particle of state.particles) {
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.vx *= 0.985
        particle.vy = particle.vy * 0.988 + particle.gravity * dt
        particle.life -= dt
      }
      state.particles = state.particles.filter((particle) => particle.life > 0)
      if (state.waveArrivalTimer === 0 && state.waveLockDuration > 0) {
        state.waveLockTimer = state.waveLockDuration
        state.flash = Math.max(state.flash, 0.08)
        triggerShake(0.8, 0.05)
        audio.formationLocked()
      }
      return desktopMode
    }

    if (state.waveLockTimer > 0) {
      state.waveLockTimer = Math.max(0, state.waveLockTimer - dt)
      return desktopMode
    }

    let movement = 0
    if (moveLeft) movement -= 1
    if (moveRight) movement += 1
    const motionScale = state.settings.reducedMotion ? 0.45 : 1
    const targetTilt = movement * 0.18 * motionScale
    state.player.visualTilt += (targetTilt - state.player.visualTilt) * Math.min(1, dt * 14)
    const thrustTarget = movement === 0 ? 0.45 : 1
    state.player.thrust += (thrustTarget - state.player.thrust) * Math.min(1, dt * 8)
    state.player.x += movement * state.player.speed * dt
    state.player.x = clamp(state.player.x, 74, WORLD.width - 74)

    if (firing) shootPlayer()

    projectileManager.update(dt)
    syncProjectilesToState()

    if (state.boss?.active) {
      updateBoss(state, dt, { shootEnemy, hitPlayer })
    }

    const aliveEnemies = state.enemies.filter((enemy) => enemy.alive)
    updateDivingAliens(state, dt)
    const formationEnemies = getFormationEnemies(aliveEnemies)
    const totalEnemies = state.enemies.length || 1
    const aliveRatio = aliveEnemies.length / totalEnemies
    const speedBoost = 1 + (1 - aliveRatio) * state.killSpeedBoost
    const currentStepInterval = Math.max(0.08, state.enemyStepInterval / speedBoost)
    state.enemyStepTimer += dt

    while (state.enemyStepTimer >= currentStepInterval && formationEnemies.length > 0) {
      state.enemyStepTimer -= currentStepInterval

      let leftEdge = Infinity
      let rightEdge = -Infinity
      for (const enemy of formationEnemies) {
        leftEdge = Math.min(leftEdge, enemy.x)
        rightEdge = Math.max(rightEdge, enemy.x + enemy.width)
      }

      const nextLeftEdge = leftEdge + state.enemyDirection * state.enemyHorizontalStep
      const nextRightEdge = rightEdge + state.enemyDirection * state.enemyHorizontalStep
      const hitWall = nextLeftEdge < 50 || nextRightEdge > WORLD.width - 50

      if (hitWall) {
        state.enemyDirection *= -1
        for (const enemy of formationEnemies) {
          enemy.y += state.enemyDrop
        }
      } else {
        for (const enemy of formationEnemies) {
          enemy.x += state.enemyDirection * state.enemyHorizontalStep
        }
      }
    }

    if (formationEnemies.length && Math.random() < dt * state.enemyFireRate) {
      const columns = new Map()
      for (const enemy of formationEnemies) {
        const key = Math.round(enemy.x / 12)
        const current = columns.get(key)
        if (!current || enemy.y > current.y) columns.set(key, enemy)
      }
      const shooters = [...columns.values()]
      shootEnemy(shooters[Math.floor(Math.random() * shooters.length)])
    }

    for (const bullet of state.bullets) {
      const bulletRect = rectFromCenter(bullet)
      const bossHit = tryHitBoss(state.boss, bulletRect)
      if (bossHit) {
        bullet.y = -100
        state.flash = 0.16
        triggerShake(1.4, 0.06)
        addParticles(bossHit.x, bossHit.y, PALETTE.magenta, bossHit.defeated ? 40 : 12, bossHit.defeated ? 420 : 180, 45)
        addParticles(bossHit.x, bossHit.y, PALETTE.white, bossHit.defeated ? 22 : 6, bossHit.defeated ? 260 : 110, 20)
        if (bossHit.defeated) {
          state.score += 1500
          triggerVictory()
          return desktopMode
        }
        continue
      }

      const ufoHit = ufoEncounter.tryHit(bulletRect, state.wave, state.levelDefinition?.mechanics?.aggressiveUfo ?? null)
      if (ufoHit) {
        bullet.y = -100
        state.ufo = ufoEncounter.getState()
        state.score += ufoHit.score
        persistHighScore()
        state.flash = 0.16
        triggerShake(1.1, 0.05)
        addParticles(ufoHit.x, ufoHit.y, PALETTE.amber, 18, 320, 40)
        addParticles(ufoHit.x, ufoHit.y, PALETTE.magenta, 10, 240, 20)
        addParticles(ufoHit.x, ufoHit.y, PALETTE.white, 8, 180, 16)
        continue
      }

      for (const enemy of aliveEnemies) {
        if (!enemy.alive) continue
        if (intersects(bulletRect, rectFromTopLeft(enemy))) {
          bullet.y = -100
          enemy.hp = Math.max(0, (enemy.hp ?? 1) - 1)

          if (enemy.hp > 0) {
            enemy.damageFlash = 1
            state.flash = 0.08
            triggerShake(0.75, 0.04)
            addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, PALETTE.white, 8, 170, 24)
            addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, getEnemyExplosionColor(enemy), 6, 150, 24)
            break
          }

          enemy.alive = false
          state.score += getEnemyScore(enemy)
          persistHighScore()
          state.flash = 0.12
          addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, getEnemyExplosionColor(enemy), enemy.rank === 'commander' ? 28 : 20, enemy.rank === 'commander' ? 460 : 380, 70)
          addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, PALETTE.white, enemy.rank === 'commander' ? 12 : 8, enemy.rank === 'commander' ? 260 : 220, 30)
          audio.explosion()
          break
        }
      }
    }

    const playerRect = rectFromCenter(state.player)
    for (const bullet of state.enemyBullets) {
      if (intersects(rectFromCenter(bullet), playerRect)) {
        bullet.y = WORLD.height + 100
        hitPlayer()
        break
      }
    }

    for (const enemy of aliveEnemies) {
      if (enemy.diving && enemy.y >= WORLD.height) {
        enemy.alive = false
        continue
      }

      const enemyRect = rectFromCenter({
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        width: enemy.width,
        height: enemy.height
      })
      if (intersects(enemyRect, playerRect) || (!enemy.diving && enemy.y + enemy.height > state.player.y + 16)) {
        hitPlayer()
        break
      }
    }

    state.enemies = state.enemies.filter((enemy) => enemy.alive)
    if (!state.boss?.active && state.enemies.length === 0) {
      const clearedWave = state.wave
      if (state.level >= LAST_LEVEL && state.waveInLevel >= WAVES_PER_LEVEL) {
        triggerShake(2.4, 0.12)
        addParticles(WORLD.width / 2, WORLD.height * 0.38, PALETTE.magenta, 38, 420, 40)
        addParticles(WORLD.width / 2, WORLD.height * 0.38, PALETTE.white, 24, 300, 20)
        triggerVictory()
        return desktopMode
      }
      triggerShake(1.8, 0.08)
      spawnWave(clearedWave + 1, { fromWave: clearedWave })
      return desktopMode
    }

    for (const particle of state.particles) {
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vx *= 0.985
      particle.vy = particle.vy * 0.988 + particle.gravity * dt
      particle.life -= dt
    }
    state.particles = state.particles.filter((particle) => particle.life > 0)

    return desktopMode
  }

  function render(desktopMode) {
    renderer.render(state, state.elapsed, desktopMode)
  }

  const gameLoop = new GameLoop({
    onTick(dt) {
      state.elapsed += dt
      const desktopMode = update(dt)
      render(desktopMode)
    }
  })

  if (muteButton) {
    muteButton.addEventListener('click', async () => {
      await audio.unlock()
      setMuted(!state.muted)
    })
  }

  pauseButton.addEventListener('click', () => {
    setPaused(!state.paused)
  })

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    state.pendingInstallPrompt = event
    installButton.classList.remove('hidden')
  })

  installButton.addEventListener('click', async () => {
    if (!state.pendingInstallPrompt) return
    state.pendingInstallPrompt.prompt()
    await state.pendingInstallPrompt.userChoice
    state.pendingInstallPrompt = null
    installButton.classList.add('hidden')
  })

  resize()
  setMuted(state.muted)
  updatePauseButton()
  syncShellState()
  render(!isMobileViewport())
  requestAnimationFrame(() => resize())
  gameLoop.start()

  return {
    resize,
    clearPointer() {
      inputController.clearPointer()
    },
    restart() {
      resetToIntro()
    },
    startAtWave(wave) {
      resetGameToWave(clamp(Math.floor(wave) || 1, 1, 99))
    },
    startAtLevel(level, waveInLevel = 1, startingLives = 3) {
      const safeLevel = clamp(Math.floor(level) || 1, 1, LEVEL_DEFINITIONS.length)
      const safeWaveInLevel = clamp(Math.floor(waveInLevel) || 1, 1, WAVES_PER_LEVEL)
      const absoluteWave = getAbsoluteWave(safeLevel, safeWaveInLevel)
      resetGameToWave(absoluteWave, { startingLives })
    },
    setPaused,
    getSettings() {
      return { ...state.settings }
    },
    updateSettings(nextSettings) {
      state.settings = { ...state.settings, ...nextSettings }
      saveSettings(state.settings)
      syncShellState()
      resize()
    },
    isMuted() {
      return state.muted
    },
    setMuted(value) {
      setMuted(value)
    },
    getWave() {
      return state.wave
    },
    getProgression() {
      return {
        wave: state.wave,
        level: state.level,
        waveInLevel: state.waveInLevel
      }
    },
    getScore() {
      return state.score
    },
    hasVictory() {
      return state.victory
    },
    getLives() {
      return state.player.lives
    },
    getAvailableLevels() {
      return LEVEL_DEFINITIONS.map((level) => ({ id: level.id, name: level.name }))
    },
    getViewport() {
      return {
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        desktopMode: state.desktopMode,
        composition: state.composition
      }
    },
    setSettingsMenuState,
    isSettingsOpen() {
      return state.settingsOpen
    }
  }
}
