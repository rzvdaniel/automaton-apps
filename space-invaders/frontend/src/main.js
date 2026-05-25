import './styles.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <button class="install hidden" type="button">Install</button>
    <div class="touch-controls" aria-hidden="true">
      <button class="touch touch-left" type="button">◀</button>
      <button class="touch touch-fire" type="button">FIRE</button>
      <button class="touch touch-right" type="button">▶</button>
    </div>
  </div>
`

const canvas = document.querySelector('.game')
const context = canvas.getContext('2d', { alpha: false })
const installButton = document.querySelector('.install')
const touchControls = {
  left: document.querySelector('.touch-left'),
  right: document.querySelector('.touch-right'),
  fire: document.querySelector('.touch-fire')
}

const storageKey = 'space-invaders-high-score'
const DPR_LIMIT = 2
const WORLD = { width: 1080, height: 1920 }
const STAR_COUNT = 72
const PLAYER_COOLDOWN = 0.18

const state = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  lastTime: 0,
  running: true,
  started: false,
  wave: 1,
  score: 0,
  highScore: Number(localStorage.getItem(storageKey) || 0),
  overlayTimer: 0,
  message: 'TAP TO START',
  stars: [],
  particles: [],
  bullets: [],
  enemyBullets: [],
  enemies: [],
  keys: new Set(),
  pointer: { left: false, right: false, fire: false },
  audioReady: false,
  pendingInstallPrompt: null,
  player: {
    x: WORLD.width / 2,
    y: WORLD.height - 180,
    width: 84,
    height: 52,
    speed: 700,
    cooldown: 0,
    lives: 3,
    hitFlash: 0
  }
}

function random(min, max) {
  return min + Math.random() * (max - min)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function initStars() {
  state.stars = Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * WORLD.width,
    y: Math.random() * WORLD.height,
    size: random(1, 4),
    speed: random(30, 150),
    alpha: random(0.2, 0.9)
  }))
}

function spawnWave(wave) {
  state.wave = wave
  state.message = `WAVE ${wave}`
  state.overlayTimer = 1.25
  const columns = clamp(5 + Math.floor(wave / 2), 5, 8)
  const rows = clamp(3 + Math.floor(wave / 2), 3, 6)
  const gapX = 24
  const gapY = 28
  const enemyWidth = 74
  const enemyHeight = 44
  const formationWidth = columns * enemyWidth + (columns - 1) * gapX
  const startX = (WORLD.width - formationWidth) / 2

  state.enemies = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const rank = row === 0 ? 'elite' : row < 3 ? 'mid' : 'grunt'
      state.enemies.push({
        x: startX + col * (enemyWidth + gapX),
        y: 160 + row * (enemyHeight + gapY),
        width: enemyWidth,
        height: enemyHeight,
        rank,
        alive: true,
        wobble: Math.random() * Math.PI * 2
      })
    }
  }

  state.enemyDirection = 1
  state.enemyFormationSpeed = 70 + wave * 10
}

function resetGame() {
  state.started = true
  state.running = true
  state.score = 0
  state.wave = 1
  state.bullets = []
  state.enemyBullets = []
  state.particles = []
  state.player.x = WORLD.width / 2
  state.player.cooldown = 0
  state.player.lives = 3
  state.player.hitFlash = 0
  spawnWave(1)
}

function persistHighScore() {
  if (state.score > state.highScore) {
    state.highScore = state.score
    localStorage.setItem(storageKey, String(state.highScore))
  }
}

function createAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || state.audio) return
  state.audio = new AudioCtx()
}

function beep(type, frequency, duration, volume, slide = 0) {
  if (!state.audioReady || !state.audio) return
  const now = state.audio.currentTime
  const oscillator = state.audio.createOscillator()
  const gain = state.audio.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  if (slide !== 0) {
    oscillator.frequency.linearRampToValueAtTime(frequency + slide, now + duration)
  }
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  oscillator.connect(gain)
  gain.connect(state.audio.destination)
  oscillator.start(now)
  oscillator.stop(now + duration + 0.02)
}

const playShoot = () => beep('square', 740, 0.09, 0.05, -180)
const playExplosion = () => beep('sawtooth', 180, 0.18, 0.08, -120)
const playHit = () => beep('triangle', 220, 0.2, 0.06, -90)

function unlockAudio() {
  createAudio()
  if (!state.audio) return
  state.audio.resume()
  state.audioReady = true
}

function resize() {
  const shell = document.querySelector('.shell')
  const rect = shell.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
  canvas.width = Math.floor(rect.width * dpr)
  canvas.height = Math.floor(rect.height * dpr)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.scale(dpr, dpr)
  state.scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height)
  state.offsetX = (rect.width - WORLD.width * state.scale) / 2
  state.offsetY = (rect.height - WORLD.height * state.scale) / 2
}

function worldX(screenX) {
  return (screenX - state.offsetX) / state.scale
}

function spawnParticles(x, y, color, count, force) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = random(force * 0.4, force)
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.25, 0.6),
      maxLife: 0,
      size: random(3, 9),
      color
    })
  }
  for (const particle of state.particles.slice(-count)) {
    particle.maxLife = particle.life
  }
}

function shootPlayer() {
  if (!state.running || state.player.cooldown > 0) return
  state.player.cooldown = PLAYER_COOLDOWN
  state.bullets.push({
    x: state.player.x,
    y: state.player.y - 42,
    width: 8,
    height: 24,
    speed: 1100
  })
  spawnParticles(state.player.x, state.player.y - 42, '#ffe082', 6, 180)
  playShoot()
}

function shootEnemy(enemy) {
  state.enemyBullets.push({
    x: enemy.x + enemy.width / 2,
    y: enemy.y + enemy.height,
    width: 10,
    height: 24,
    speed: 540 + state.wave * 18
  })
}

function loseLife() {
  state.player.lives -= 1
  state.player.hitFlash = 0.35
  spawnParticles(state.player.x, state.player.y, '#8be9fd', 26, 340)
  playHit()
  if (state.player.lives <= 0) {
    state.running = false
    state.message = 'GAME OVER'
    state.overlayTimer = 999
    persistHighScore()
  }
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

function update(dt) {
  const moveLeft = state.keys.has('ArrowLeft') || state.keys.has('KeyA') || state.pointer.left
  const moveRight = state.keys.has('ArrowRight') || state.keys.has('KeyD') || state.pointer.right
  const firing = state.keys.has('Space') || state.keys.has('ArrowUp') || state.pointer.fire

  for (const star of state.stars) {
    star.y += star.speed * dt
    if (star.y > WORLD.height) {
      star.y = -star.size
      star.x = Math.random() * WORLD.width
    }
  }

  if (!state.started) {
    if (moveLeft || moveRight || firing) resetGame()
    return
  }

  if (!state.running) {
    if (firing) resetGame()
    return
  }

  state.overlayTimer = Math.max(0, state.overlayTimer - dt)
  state.player.cooldown = Math.max(0, state.player.cooldown - dt)
  state.player.hitFlash = Math.max(0, state.player.hitFlash - dt)

  let movement = 0
  if (moveLeft) movement -= 1
  if (moveRight) movement += 1
  state.player.x += movement * state.player.speed * dt
  state.player.x = clamp(state.player.x, 72, WORLD.width - 72)

  if (firing) shootPlayer()

  for (const bullet of state.bullets) bullet.y -= bullet.speed * dt
  state.bullets = state.bullets.filter((bullet) => bullet.y > -40)

  for (const bullet of state.enemyBullets) bullet.y += bullet.speed * dt
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < WORLD.height + 40)

  const aliveEnemies = state.enemies.filter((enemy) => enemy.alive)
  let leftEdge = Infinity
  let rightEdge = -Infinity

  for (const enemy of aliveEnemies) {
    enemy.x += state.enemyDirection * state.enemyFormationSpeed * dt
    enemy.wobble += dt * 3
    leftEdge = Math.min(leftEdge, enemy.x)
    rightEdge = Math.max(rightEdge, enemy.x + enemy.width)
  }

  if (leftEdge < 60 || rightEdge > WORLD.width - 60) {
    state.enemyDirection *= -1
    for (const enemy of aliveEnemies) enemy.y += 36
  }

  if (aliveEnemies.length > 0 && Math.random() < dt * (0.5 + state.wave * 0.08)) {
    const columns = new Map()
    for (const enemy of aliveEnemies) {
      const key = Math.round(enemy.x / 10)
      const current = columns.get(key)
      if (!current || enemy.y > current.y) columns.set(key, enemy)
    }
    const shooters = [...columns.values()]
    if (shooters.length > 0) shootEnemy(shooters[Math.floor(Math.random() * shooters.length)])
  }

  for (const bullet of state.bullets) {
    for (const enemy of aliveEnemies) {
      if (!enemy.alive) continue
      const bulletRect = rectFromCenter(bullet)
      const enemyRect = rectFromTopLeft(enemy)
      if (intersects(bulletRect, enemyRect)) {
        enemy.alive = false
        bullet.y = -100
        state.score += enemy.rank === 'elite' ? 40 : enemy.rank === 'mid' ? 25 : 10
        persistHighScore()
        spawnParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffb86c', 20, 420)
        playExplosion()
        break
      }
    }
  }

  const playerHitbox = rectFromCenter({
    x: state.player.x,
    y: state.player.y,
    width: state.player.width,
    height: state.player.height
  })

  for (const bullet of state.enemyBullets) {
    if (intersects(rectFromCenter(bullet), playerHitbox)) {
      bullet.y = WORLD.height + 100
      loseLife()
      break
    }
  }

  for (const enemy of aliveEnemies) {
    const enemyHitbox = rectFromCenter({
      x: enemy.x + enemy.width / 2,
      y: enemy.y + enemy.height / 2,
      width: enemy.width,
      height: enemy.height
    })
    if (intersects(enemyHitbox, playerHitbox) || enemy.y + enemy.height > state.player.y + 12) {
      state.player.lives = 1
      loseLife()
      break
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.alive)
  if (state.enemies.length === 0) spawnWave(state.wave + 1)

  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vx *= 0.99
    particle.vy *= 0.99
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
}

function drawShip(x, y, width, height, color, accent) {
  context.fillStyle = color
  context.beginPath()
  context.moveTo(x, y - height / 2)
  context.lineTo(x + width / 2, y + height / 2)
  context.lineTo(x - width / 2, y + height / 2)
  context.closePath()
  context.fill()
  context.fillStyle = accent
  context.fillRect(x - width * 0.14, y - height * 0.08, width * 0.28, height * 0.46)
  context.fillRect(x - width * 0.38, y + height * 0.18, width * 0.18, height * 0.12)
  context.fillRect(x + width * 0.2, y + height * 0.18, width * 0.18, height * 0.12)
}

function drawEnemy(enemy) {
  const x = enemy.x
  const y = enemy.y + Math.sin(enemy.wobble) * 3
  const color = enemy.rank === 'elite' ? '#ff7b72' : enemy.rank === 'mid' ? '#ffd866' : '#72f1b8'
  context.fillStyle = color
  context.fillRect(x, y, enemy.width, enemy.height)
  context.clearRect(x + 14, y + 12, 10, 10)
  context.clearRect(x + enemy.width - 24, y + 12, 10, 10)
  context.fillRect(x + 8, y + enemy.height - 12, 14, 12)
  context.fillRect(x + enemy.width - 22, y + enemy.height - 12, 14, 12)
  context.fillRect(x + 30, y + enemy.height - 8, 14, 8)
}

function renderHud() {
  context.fillStyle = 'rgba(6, 11, 27, 0.72)'
  context.fillRect(34, 26, WORLD.width - 68, 110)
  context.strokeStyle = 'rgba(98, 225, 255, 0.35)'
  context.lineWidth = 4
  context.strokeRect(34, 26, WORLD.width - 68, 110)
  context.fillStyle = '#f8f8f2'
  context.font = '700 42px system-ui, sans-serif'
  context.fillText(`SCORE ${state.score}`, 64, 76)
  context.fillText(`HI ${state.highScore}`, WORLD.width - 320, 76)
  context.fillStyle = '#8be9fd'
  context.font = '600 28px system-ui, sans-serif'
  context.fillText(`WAVE ${state.wave}`, 64, 114)
  context.fillText(`LIVES ${state.player.lives}`, WORLD.width - 210, 114)
}

function renderOverlay() {
  if (!state.started || !state.running || state.overlayTimer > 0) {
    context.fillStyle = 'rgba(4, 7, 16, 0.52)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
    context.textAlign = 'center'
    context.fillStyle = '#f8f8f2'
    context.font = '700 78px system-ui, sans-serif'
    context.fillText('SPACE', WORLD.width / 2, WORLD.height * 0.26)
    context.fillText('INVADERS', WORLD.width / 2, WORLD.height * 0.315)
    context.fillStyle = '#8be9fd'
    context.font = '600 40px system-ui, sans-serif'
    context.fillText(state.message, WORLD.width / 2, WORLD.height * 0.44)
    context.fillStyle = '#f8f8f2'
    context.font = '500 28px system-ui, sans-serif'
    context.fillText('Touch arrows or A/D to move', WORLD.width / 2, WORLD.height * 0.54)
    context.fillText('Touch FIRE or Space to shoot', WORLD.width / 2, WORLD.height * 0.575)
    if (!state.running) context.fillText('Press fire to restart', WORLD.width / 2, WORLD.height * 0.635)
    context.textAlign = 'left'
  }
}

function render() {
  const rect = canvas.getBoundingClientRect()
  context.fillStyle = '#050816'
  context.fillRect(0, 0, rect.width, rect.height)
  context.save()
  context.translate(state.offsetX, state.offsetY)
  context.scale(state.scale, state.scale)

  const gradient = context.createLinearGradient(0, 0, 0, WORLD.height)
  gradient.addColorStop(0, '#091122')
  gradient.addColorStop(0.55, '#070b18')
  gradient.addColorStop(1, '#02040b')
  context.fillStyle = gradient
  context.fillRect(0, 0, WORLD.width, WORLD.height)

  for (const star of state.stars) {
    context.fillStyle = `rgba(255,255,255,${star.alpha})`
    context.fillRect(star.x, star.y, star.size, star.size)
  }

  context.strokeStyle = 'rgba(255, 60, 100, 0.18)'
  context.lineWidth = 2
  for (let y = 0; y < WORLD.height; y += 120) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(WORLD.width, y)
    context.stroke()
  }

  for (const particle of state.particles) {
    const alpha = particle.life / particle.maxLife
    context.fillStyle = `${particle.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
    context.fillRect(particle.x, particle.y, particle.size, particle.size)
  }

  for (const enemy of state.enemies) drawEnemy(enemy)

  for (const bullet of state.bullets) {
    context.fillStyle = '#f8f8f2'
    context.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height)
  }

  for (const bullet of state.enemyBullets) {
    context.fillStyle = '#ff7b72'
    context.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height)
  }

  if (state.player.hitFlash > 0) {
    context.globalAlpha = 0.45 + Math.sin(performance.now() * 0.03) * 0.25
  }
  drawShip(state.player.x, state.player.y, state.player.width, state.player.height, '#8be9fd', '#f8f8f2')
  context.globalAlpha = 1

  renderHud()
  renderOverlay()
  context.restore()
}

function tick(timestamp) {
  const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000 || 0)
  state.lastTime = timestamp
  update(dt)
  render()
  requestAnimationFrame(tick)
}

function setPointerState(key, value) {
  state.pointer[key] = value
}

function bindHold(button, key) {
  const down = (event) => {
    event.preventDefault()
    unlockAudio()
    setPointerState(key, true)
    if (!state.started && key === 'fire') resetGame()
  }
  const up = (event) => {
    event.preventDefault()
    setPointerState(key, false)
  }
  button.addEventListener('pointerdown', down)
  button.addEventListener('pointerup', up)
  button.addEventListener('pointercancel', up)
  button.addEventListener('pointerleave', up)
}

bindHold(touchControls.left, 'left')
bindHold(touchControls.right, 'right')
bindHold(touchControls.fire, 'fire')

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD'].includes(event.code)) {
    event.preventDefault()
    unlockAudio()
    state.keys.add(event.code)
    if (!state.started && (event.code === 'Space' || event.code === 'ArrowUp')) resetGame()
  }
})

window.addEventListener('keyup', (event) => {
  state.keys.delete(event.code)
})

canvas.addEventListener('pointerdown', (event) => {
  unlockAudio()
  const x = worldX(event.clientX)
  if (x < WORLD.width * 0.32) state.pointer.left = true
  else if (x > WORLD.width * 0.68) state.pointer.right = true
  else {
    state.pointer.fire = true
    if (!state.started) resetGame()
  }
})

canvas.addEventListener('pointerup', () => {
  state.pointer.left = false
  state.pointer.right = false
  state.pointer.fire = false
})

canvas.addEventListener('pointercancel', () => {
  state.pointer.left = false
  state.pointer.right = false
  state.pointer.fire = false
})

window.addEventListener('pointerup', () => {
  state.pointer.left = false
  state.pointer.right = false
  state.pointer.fire = false
})

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
  })
}

initStars()
resize()
render()
requestAnimationFrame(tick)
