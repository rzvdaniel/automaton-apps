import { createBoss } from './BossSystem.js'
import { getBackgroundDefinition, getLevelDefinition, getLevelProgression } from '../content/levels.js'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function getWaveConfig(wave) {
  const { level, waveInLevel } = getLevelProgression(wave)
  const waveIntensity = waveInLevel - 1
  const levelIntensity = level - 1
  const levelDefinition = getLevelDefinition(level)
  const difficulty = levelDefinition.difficultyModifiers ?? {}

  return {
    columns: clamp(6 + Math.floor(waveIntensity / 2), 6, 8),
    rows: clamp(4 + Math.floor((waveIntensity + levelIntensity * 0.45) / 2), 4, 6),
    gapX: clamp(30 - waveIntensity * 1.5 - levelIntensity * 0.45, 18, 30),
    gapY: clamp(40 - waveIntensity * 1.25 - levelIntensity * 0.35, 26, 40),
    enemyWidth: clamp(72 - waveIntensity * 2 - levelIntensity * 0.6, 58, 72),
    enemyHeight: clamp(72 - waveIntensity * 2 - levelIntensity * 0.6, 58, 72),
    startY: clamp(224 + waveIntensity * 18 + levelIntensity * 10, 224, 340),
    stepInterval: Math.max(0.18, 0.54 - waveIntensity * 0.055 - levelIntensity * 0.025),
    horizontalStep: clamp(26 + waveIntensity * 2.5 + levelIntensity * 1.5, 26, 38),
    drop: clamp(30 + waveIntensity * 5 + levelIntensity * 2, 30, 55),
    enemyFireRate: Math.min(1.3, (0.34 + waveIntensity * 0.16 + levelIntensity * 0.08) * (difficulty.enemyFireRateMultiplier ?? 1)),
    enemyBulletSpeed: Math.min(760, 500 + waveIntensity * 45 + levelIntensity * 30 + (difficulty.enemyBulletSpeedBonus ?? 0)),
    maxEnemyBullets: clamp(2 + waveIntensity + Math.floor(levelIntensity / 2), 2, 6),
    killSpeedBoost: Math.min(4.6, 3.2 + waveIntensity * 0.18 + levelIntensity * 0.12)
  }
}

export class WaveManager {
  constructor({ audio, ufoEncounter }) {
    this.audio = audio
    this.ufoEncounter = ufoEncounter
  }

  spawnWave(wave, state, { fromWave = null, isShortViewport = false } = {}) {
    const config = getWaveConfig(wave)
    const progression = getLevelProgression(wave)
    const levelDefinition = getLevelDefinition(progression.level)
    const backgroundDefinition = getBackgroundDefinition(levelDefinition.backgroundId)
    const { columns, rows, gapX, gapY, enemyWidth, enemyHeight } = config
    const formationWidth = columns * enemyWidth + (columns - 1) * gapX
    const startX = (1080 - formationWidth) / 2
    const formationYOffset = (isShortViewport ? 16 : 0) + state.composition.enemyShiftWorld
    const immediateStart = wave === 1 && !state.started
    const isIntermissionWave = wave > 1 || fromWave !== null
    const fromProgression = fromWave === null ? null : getLevelProgression(fromWave)
    const isLevelTransition = !fromProgression || fromProgression.level !== progression.level
    const baseOverlayDuration = wave === 1 ? 1.05 : Math.max(1.8, 2.2 - wave * 0.05)
    const baseArrivalDuration = isIntermissionWave ? Math.max(0.45, 0.72 - wave * 0.015) : 0

    state.wave = wave
    state.waveInLevel = progression.waveInLevel
    state.level = progression.level
    state.levelDefinition = levelDefinition
    state.backgroundDefinition = backgroundDefinition
    state.message = wave === 1 ? 'READY' : `LEVEL ${progression.level}  WAVE ${progression.waveInLevel}`
    state.overlayTimer = immediateStart ? 0 : isLevelTransition ? 4.25 : baseOverlayDuration
    state.intermission = immediateStart
      ? null
      : {
          fromWave,
          toWave: wave,
          completedLevel: fromProgression?.level ?? null,
          level: progression.level,
          waveInLevel: progression.waveInLevel,
          levelName: levelDefinition.name,
          levelSubtitle: levelDefinition.subtitle,
          isLevelTransition
        }
    state.waveArrivalDuration = isLevelTransition ? 1.15 : baseArrivalDuration
    state.waveArrivalTimer = state.waveArrivalDuration
    state.waveArrivalCuePending = isIntermissionWave
    state.waveLockDuration = isLevelTransition ? 0.36 : (isIntermissionWave ? Math.max(0.18, 0.28 - wave * 0.008) : 0)
    state.waveLockTimer = 0
    state.divingAttackCooldown = 0
    state.divingAttackTimer = 0
    state.boss = null
    state.bullets = []
    state.enemies = []
    state.enemyBullets = []
    this.ufoEncounter.reset(wave, levelDefinition.mechanics?.aggressiveUfo ?? null)
    state.ufo = null

    const bossWaveInLevel = levelDefinition.mechanics?.finalBoss?.waveInLevel
    const isBossWave = bossWaveInLevel && progression.waveInLevel === bossWaveInLevel

    if (isBossWave) {
      state.message = 'FINAL BOSS'
      state.overlayTimer = immediateStart ? 0 : 1.25
      state.waveArrivalDuration = immediateStart ? 0 : 1.45
      state.waveArrivalTimer = state.waveArrivalDuration
      state.waveLockDuration = immediateStart ? 0 : 0.35
      state.intermission = immediateStart
        ? null
        : {
            ...state.intermission,
            isBossWave: true,
            levelSubtitle: 'Command Ship Detected'
          }
      state.boss = createBoss(levelDefinition.mechanics.finalBoss)
    } else {
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const rank = levelDefinition.enemyFormation.rowAssignment(row, rows, progression)
          state.enemies.push({
            x: startX + col * (enemyWidth + gapX),
            y: config.startY + formationYOffset + row * (enemyHeight + gapY),
            width: enemyWidth,
            height: enemyHeight,
            rank,
            palette: levelDefinition.enemyPalette?.[rank] ?? null,
            alive: true,
            diving: false,
            diveWarning: 0,
            diveVx: 0,
            diveVy: 0,
            phase: Math.random() * Math.PI * 2,
            arrivalDelay: row * 0.06 + col * 0.012
          })
        }
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
