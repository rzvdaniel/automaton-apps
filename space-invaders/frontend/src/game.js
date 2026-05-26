import { createAudioManager } from './audio.js'
import { createBackgroundEffects } from './background-effects.js'
import { DPR_LIMIT, PALETTE, PLAYER_COOLDOWN, PLAYER_INVULNERABILITY, STORAGE_KEYS, WORLD } from './config.js'
import { renderScene } from './render.js'

function random(min, max) {
  return min + Math.random() * (max - min)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function rectFromCenter(entity) {
  return {
    left: entity.x - entity.width / 2,
    right: entity.x + entity.width / 2,
    top: entity.y - entity.height / 2,
    bottom: entity.y + entity.height / 2
  }
}

function rectFromTopLeft(entity) {
  return {
    left: entity.x,
    right: entity.x + entity.width,
    top: entity.y,
    bottom: entity.y + entity.height
  }
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function getWaveConfig(wave) {
  const intensity = wave - 1
  const tier = Math.floor(intensity / 2)
  return {
    columns: clamp(6 + Math.floor(intensity / 2), 6, 9),
    rows: clamp(4 + Math.floor(intensity / 2), 4, 6),
    gapX: clamp(30 - intensity * 1.7, 16, 30),
    gapY: clamp(40 - intensity * 1.4, 24, 40),
    enemyWidth: clamp(72 - intensity * 2, 58, 72),
    enemyHeight: clamp(72 - intensity * 2, 58, 72),
    startY: clamp(224 + intensity * 18, 224, 380),
    stepInterval: Math.max(0.11, 0.54 - intensity * 0.055 - tier * 0.025),
    horizontalStep: 26 + intensity * 2.5 + tier * 1.5,
    drop: 30 + intensity * 5 + tier * 3,
    enemyFireRate: 0.34 + intensity * 0.16 + tier * 0.08,
    enemyBulletSpeed: 500 + intensity * 55 + tier * 25,
    maxEnemyBullets: clamp(2 + Math.ceil(wave / 2), 2, 8),
    killSpeedBoost: 3.2 + intensity * 0.22 + tier * 0.18
  }
}

export function createGame({ canvas, shell, installButton, muteButton, pauseButton, touchControls }) {
  const context = canvas.getContext('2d', { alpha: false })
  const audio = createAudioManager()
  const backgroundEffects = createBackgroundEffects()
  const backgroundImage = new Image()
  backgroundImage.src = './images/planet-bg.jpg'
  const state = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    lastTime: 0,
    elapsed: 0,
    running: true,
    started: false,
    paused: false,
    score: 0,
    wave: 1,
    highScore: Number(localStorage.getItem(STORAGE_KEYS.highScore) || 0),
    muted: localStorage.getItem(STORAGE_KEYS.muted) === '1',
    overlayTimer: 999,
    message: 'INSERT COIN',
    particles: [],
    bullets: [],
    enemyBullets: [],
    enemies: [],
    keys: new Set(),
    pointer: { left: false, right: false, fire: false },
    pendingInstallPrompt: null,
    flash: 0,
    shake: { x: 0, y: 0, power: 0, duration: 0, cooldown: 0 },
    backgroundImage,
    backgroundEffects,
    player: {
      x: WORLD.width / 2,
      y: WORLD.height - 182,
      width: 96,
      height: 58,
      speed: 760,
      cooldown: 0,
      lives: 3,
      invulnerability: 0
    }
  }

  audio.setMuted(state.muted)

  function persistHighScore() {
    if (state.score > state.highScore) {
      state.highScore = state.score
      localStorage.setItem(STORAGE_KEYS.highScore, String(state.highScore))
    }
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
    state.offsetY = (rect.height - WORLD.height * state.scale) / 2
  }

  function addParticles(x, y, color, count, force, gravity = 0) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = random(force * 0.35, force)
      const life = random(0.3, 0.85)
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity,
        life,
        maxLife: life,
        size: random(2, 8),
        color
      })
    }
  }

  function triggerShake(power, duration) {
    if (state.shake.cooldown > 0) return
    state.shake.power = Math.max(state.shake.power, power)
    state.shake.duration = Math.max(state.shake.duration, duration)
    state.shake.cooldown = 0.12
  }

  function spawnWave(wave) {
    const config = getWaveConfig(wave)
    const { columns, rows, gapX, gapY, enemyWidth, enemyHeight } = config
    const formationWidth = columns * enemyWidth + (columns - 1) * gapX
    const startX = (WORLD.width - formationWidth) / 2
    state.wave = wave
    state.message = wave === 1 ? 'READY' : `WAVE ${wave}`
    state.overlayTimer = wave === 1 ? 1 : 0.9
    state.enemies = []
    state.enemyBullets = []

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const rank = row === 0 ? 'elite' : row < 3 ? 'mid' : 'grunt'
        state.enemies.push({
          x: startX + col * (enemyWidth + gapX),
          y: config.startY + row * (enemyHeight + gapY),
          width: enemyWidth,
          height: enemyHeight,
          rank,
          alive: true,
          phase: Math.random() * Math.PI * 2
        })
      }
    }

    state.enemyDirection = 1
    state.enemyStepInterval = config.stepInterval
    state.enemyHorizontalStep = config.horizontalStep
    state.enemyStepTimer = 0
    state.enemyDrop = config.drop
    state.enemyFireRate = config.enemyFireRate
    state.enemyBulletSpeed = config.enemyBulletSpeed
    state.maxEnemyBullets = config.maxEnemyBullets
    state.killSpeedBoost = config.killSpeedBoost
    state.enemyEdgeLock = false
    audio.wave()
  }

  function resetGame() {
    resetGameToWave(1)
  }

  function resetGameToWave(startWave) {
    state.started = true
    state.running = true
    state.paused = false
    state.score = 0
    state.wave = startWave
    state.flash = 0
    state.shake.power = 0
    state.shake.duration = 0
    state.shake.cooldown = 0
    state.bullets = []
    state.enemyBullets = []
    state.particles = []
    state.enemyStepTimer = 0
    state.player.x = WORLD.width / 2
    state.player.cooldown = 0
    state.player.lives = 3
    state.player.invulnerability = 0
    spawnWave(startWave)
  }

  function setMuted(value) {
    state.muted = value
    audio.setMuted(value)
    localStorage.setItem(STORAGE_KEYS.muted, value ? '1' : '0')
    muteButton.textContent = value ? 'Unmute' : 'Mute'
  }

  function setPaused(value) {
    if (!state.started || !state.running) return
    state.paused = value
    pauseButton.textContent = value ? 'Resume' : 'Pause'
    state.message = value ? 'PAUSED' : `WAVE ${state.wave}`
    state.overlayTimer = value ? 999 : 0.6
  }

  function shootPlayer() {
    if (!state.running || state.paused || state.player.cooldown > 0) return
    state.player.cooldown = PLAYER_COOLDOWN
    state.bullets.push({
      x: state.player.x,
      y: state.player.y - 42,
      width: 8,
      height: 40,
      speed: 1200
    })
    addParticles(state.player.x, state.player.y - 38, PALETTE.cyan, 7, 150, 20)
    audio.shoot()
  }

  function shootEnemy(enemy) {
    if (state.enemyBullets.length >= state.maxEnemyBullets) return
    state.enemyBullets.push({
      x: enemy.x + enemy.width / 2,
      y: enemy.y + enemy.height,
      width: 10,
      height: 28,
      speed: state.enemyBulletSpeed
    })
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
      state.message = 'GAME OVER'
      state.overlayTimer = 999
      persistHighScore()
    }
  }

  function update(dt) {
    const desktopMode = window.matchMedia('(pointer:fine)').matches
    const moveLeft = state.keys.has('ArrowLeft') || state.keys.has('KeyA') || state.pointer.left
    const moveRight = state.keys.has('ArrowRight') || state.keys.has('KeyD') || state.pointer.right
    const firing =
      state.keys.has('Space') || state.keys.has('Enter') || state.keys.has('ArrowUp') || state.pointer.fire

    state.backgroundEffects.update(dt)

    state.flash = Math.max(0, state.flash - dt * 1.7)
    state.shake.cooldown = Math.max(0, state.shake.cooldown - dt)
    state.shake.duration = Math.max(0, state.shake.duration - dt)
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
      if (firing) resetGame()
      return desktopMode
    }

    if (state.paused) return desktopMode

    state.overlayTimer = Math.max(0, state.overlayTimer - dt)
    state.player.cooldown = Math.max(0, state.player.cooldown - dt)
    state.player.invulnerability = Math.max(0, state.player.invulnerability - dt)

    let movement = 0
    if (moveLeft) movement -= 1
    if (moveRight) movement += 1
    state.player.x += movement * state.player.speed * dt
    state.player.x = clamp(state.player.x, 74, WORLD.width - 74)

    if (firing) shootPlayer()

    for (const bullet of state.bullets) bullet.y -= bullet.speed * dt
    state.bullets = state.bullets.filter((bullet) => bullet.y > -80)

    for (const bullet of state.enemyBullets) bullet.y += bullet.speed * dt
    state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < WORLD.height + 80)

    const aliveEnemies = state.enemies.filter((enemy) => enemy.alive)
    const totalEnemies = state.enemies.length || 1
    const aliveRatio = aliveEnemies.length / totalEnemies
    const speedBoost = 1 + (1 - aliveRatio) * state.killSpeedBoost
    const currentStepInterval = Math.max(0.08, state.enemyStepInterval / speedBoost)
    state.enemyStepTimer += dt

    while (state.enemyStepTimer >= currentStepInterval && aliveEnemies.length > 0) {
      state.enemyStepTimer -= currentStepInterval

      let leftEdge = Infinity
      let rightEdge = -Infinity
      for (const enemy of aliveEnemies) {
        leftEdge = Math.min(leftEdge, enemy.x)
        rightEdge = Math.max(rightEdge, enemy.x + enemy.width)
      }

      const nextLeftEdge = leftEdge + state.enemyDirection * state.enemyHorizontalStep
      const nextRightEdge = rightEdge + state.enemyDirection * state.enemyHorizontalStep
      const hitWall = nextLeftEdge < 50 || nextRightEdge > WORLD.width - 50

      if (hitWall) {
        state.enemyDirection *= -1
        for (const enemy of aliveEnemies) {
          enemy.y += state.enemyDrop
        }
      } else {
        for (const enemy of aliveEnemies) {
          enemy.x += state.enemyDirection * state.enemyHorizontalStep
        }
      }
    }

    if (aliveEnemies.length && Math.random() < dt * state.enemyFireRate) {
      const columns = new Map()
      for (const enemy of aliveEnemies) {
        const key = Math.round(enemy.x / 12)
        const current = columns.get(key)
        if (!current || enemy.y > current.y) columns.set(key, enemy)
      }
      const shooters = [...columns.values()]
      shootEnemy(shooters[Math.floor(Math.random() * shooters.length)])
    }

    for (const bullet of state.bullets) {
      const bulletRect = rectFromCenter(bullet)
      for (const enemy of aliveEnemies) {
        if (!enemy.alive) continue
        if (intersects(bulletRect, rectFromTopLeft(enemy))) {
          enemy.alive = false
          bullet.y = -100
          state.score += enemy.rank === 'elite' ? 50 : enemy.rank === 'mid' ? 30 : 15
          persistHighScore()
          state.flash = 0.12
          addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.rank === 'elite' ? PALETTE.magenta : PALETTE.amber, 20, 380, 70)
          addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, PALETTE.white, 8, 220, 30)
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
      const enemyRect = rectFromCenter({
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        width: enemy.width,
        height: enemy.height
      })
      if (intersects(enemyRect, playerRect) || enemy.y + enemy.height > state.player.y + 16) {
        state.player.lives = 1
        hitPlayer()
        break
      }
    }

    state.enemies = state.enemies.filter((enemy) => enemy.alive)
    if (state.enemies.length === 0) {
      state.message = 'WAVE CLEAR'
      state.overlayTimer = 0.8
      triggerShake(1.8, 0.08)
      spawnWave(state.wave + 1)
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
    renderScene(context, canvas, state, state.elapsed, desktopMode)
  }

  function tick(timestamp) {
    const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000 || 0)
    state.lastTime = timestamp
    state.elapsed += dt
    const desktopMode = update(dt)
    render(desktopMode)
    requestAnimationFrame(tick)
  }

  function clearPointer() {
    state.pointer.left = false
    state.pointer.right = false
    state.pointer.fire = false
  }

  function setZone(zone, active) {
    state.pointer[zone] = active
  }

  function bindHold(button, key) {
    const down = async (event) => {
      event.preventDefault()
      await audio.unlock()
      setZone(key, true)
      if (!state.started && key === 'fire') resetGame()
    }
    const up = (event) => {
      event.preventDefault()
      setZone(key, false)
    }
    button.addEventListener('pointerdown', down)
    button.addEventListener('pointerup', up)
    button.addEventListener('pointerleave', up)
    button.addEventListener('pointercancel', up)
  }

  bindHold(touchControls.left, 'left')
  bindHold(touchControls.right, 'right')
  bindHold(touchControls.fire, 'fire')

  window.addEventListener('keydown', async (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'KeyA', 'KeyD', 'KeyM', 'KeyP'].includes(event.code)) {
      event.preventDefault()
    }
    if (event.repeat && ['KeyM', 'KeyP'].includes(event.code)) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'KeyA', 'KeyD'].includes(event.code)) {
      await audio.unlock()
      state.keys.add(event.code)
      if (!state.started && (event.code === 'Space' || event.code === 'Enter' || event.code === 'ArrowUp')) {
        resetGame()
      }
    }
    if (event.code === 'KeyM') setMuted(!state.muted)
    if (event.code === 'KeyP') setPaused(!state.paused)
  })

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.code)
  })

  window.addEventListener('blur', () => {
    clearPointer()
    state.keys.clear()
  })

  muteButton.addEventListener('click', async () => {
    await audio.unlock()
    setMuted(!state.muted)
  })

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
  pauseButton.textContent = 'Pause'
  render(window.matchMedia('(pointer:fine)').matches)
  requestAnimationFrame(tick)

  return {
    resize,
    clearPointer,
    restart() {
      resetGame()
    },
    startAtWave(wave) {
      resetGameToWave(clamp(Math.floor(wave) || 1, 1, 99))
    },
    setPaused,
    getWave() {
      return state.wave
    }
  }
}
