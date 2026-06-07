function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function getWaveConfig(wave) {
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

export class WaveManager {
  constructor({ audio, ufoEncounter }) {
    this.audio = audio
    this.ufoEncounter = ufoEncounter
  }

  spawnWave(wave, state, { fromWave = null, isShortViewport = false } = {}) {
    const config = getWaveConfig(wave)
    const { columns, rows, gapX, gapY, enemyWidth, enemyHeight } = config
    const formationWidth = columns * enemyWidth + (columns - 1) * gapX
    const startX = (1080 - formationWidth) / 2
    const formationYOffset = (isShortViewport ? 16 : 0) + state.composition.enemyShiftWorld
    const immediateStart = wave === 1 && !state.started
    const isIntermissionWave = wave > 1 || fromWave !== null

    state.wave = wave
    state.message = wave === 1 ? 'READY' : `WAVE ${wave}`
    state.overlayTimer = immediateStart ? 0 : wave === 1 ? 1.05 : Math.max(1.8, 2.2 - wave * 0.05)
    state.intermission = immediateStart ? null : { fromWave, toWave: wave }
    state.waveArrivalDuration = isIntermissionWave ? Math.max(0.45, 0.72 - wave * 0.015) : 0
    state.waveArrivalTimer = state.waveArrivalDuration
    state.waveArrivalCuePending = isIntermissionWave
    state.waveLockDuration = isIntermissionWave ? Math.max(0.18, 0.28 - wave * 0.008) : 0
    state.waveLockTimer = 0
    state.bullets = []
    state.enemies = []
    state.enemyBullets = []
    this.ufoEncounter.reset(wave)
    state.ufo = null

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const rank = row === 0 ? 'elite' : row < 3 ? 'mid' : 'grunt'
        state.enemies.push({
          x: startX + col * (enemyWidth + gapX),
          y: config.startY + formationYOffset + row * (enemyHeight + gapY),
          width: enemyWidth,
          height: enemyHeight,
          rank,
          alive: true,
          phase: Math.random() * Math.PI * 2,
          arrivalDelay: row * 0.06 + col * 0.012
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
    this.audio.wave()
  }
}
