import { BACKGROUND_DEFINITIONS } from './backgrounds.js'

export const WAVES_PER_LEVEL = 5
export const LAST_LEVEL = 3

export const LEVEL_DEFINITIONS = [
  {
    id: 1,
    name: 'Red Planet',
    subtitle: 'Classic Invasion',
    backgroundId: 'planet-cinematic',
    enemyPalette: {
      elite: { color: '#ff7fda', glow: 'rgba(255, 88, 216, 0.38)' },
      mid: { color: '#ffd36b', glow: 'rgba(255, 211, 107, 0.34)' },
      grunt: { color: '#75ffd2', glow: 'rgba(64, 247, 196, 0.34)' }
    },
    enemyFormation: {
      enemyTypes: ['grunt', 'mid', 'elite'],
      rowAssignment(row) {
        if (row === 0) return 'elite'
        if (row < 3) return 'mid'
        return 'grunt'
      }
    },
    waveRules: {
      type: 'campaign',
      startWave: 1,
      wavesPerLevel: WAVES_PER_LEVEL
    },
    musicTheme: null,
    difficultyModifiers: {},
    mechanics: {}
  },
  {
    id: 2,
    name: 'Asteroid Belt',
    subtitle: 'Broken Orbit',
    backgroundId: 'broken-orbit',
    enemyPalette: {
      elite: { color: '#dca3ff', glow: 'rgba(210, 132, 255, 0.38)' },
      mid: { color: '#9ae6ff', glow: 'rgba(126, 220, 255, 0.34)' },
      grunt: { color: '#f2f6ff', glow: 'rgba(220, 232, 255, 0.32)' }
    },
    enemyFormation: {
      enemyTypes: ['grunt', 'mid', 'elite'],
      rowAssignment(row) {
        if (row === 0) return 'elite'
        if (row < 2) return 'mid'
        return 'grunt'
      }
    },
    waveRules: {
      type: 'campaign',
      startWave: 1,
      wavesPerLevel: WAVES_PER_LEVEL
    },
    musicTheme: null,
    difficultyModifiers: {
      enemyFireRateMultiplier: 1.08
    },
    mechanics: {
      divingAliens: {
        enabled: true,
        maxActive: 1,
        minInterval: 2.8,
        chancePerSecond: 0.45,
        warningDuration: 0.35,
        speed: 430,
        horizontalTracking: 0.65
      }
    }
  },
  {
    id: 3,
    name: 'Mothership',
    subtitle: 'Deep Space Siege',
    backgroundId: 'mothership-depths',
    enemyPalette: {
      elite: { color: '#ff7ad3', glow: 'rgba(255, 92, 196, 0.4)' },
      mid: { color: '#a1ff91', glow: 'rgba(122, 255, 146, 0.36)' },
      grunt: { color: '#f0fff4', glow: 'rgba(184, 255, 214, 0.3)' },
      commander: { color: '#ffe6ff', glow: 'rgba(255, 96, 216, 0.58)' }
    },
    enemyFormation: {
      enemyTypes: ['grunt', 'mid', 'elite'],
      rowAssignment(row) {
        if (row < 2) return 'elite'
        if (row < 4) return 'mid'
        return 'grunt'
      }
    },
    waveRules: {
      type: 'campaign',
      startWave: 1,
      wavesPerLevel: WAVES_PER_LEVEL
    },
    musicTheme: null,
    difficultyModifiers: {
      enemyFireRateMultiplier: 1.14,
      enemyBulletSpeedBonus: 20
    },
    mechanics: {
      aggressiveUfo: {
        spawnDelayMultiplier: 0.7,
        speedBonus: 80
      },
      commanders: {
        enabled: true,
        baseCount: 1,
        extraPerWave: 1,
        maxCount: 5,
        hp: 2
      },
      divingAliens: {
        enabled: true,
        maxActive: 2,
        minInterval: 2.4,
        chancePerSecond: 0.55,
        warningDuration: 0.3,
        speed: 470,
        horizontalTracking: 0.75
      },
      finalBoss: {
        waveInLevel: 5,
        hp: 40,
        speed: 210,
        spreadCooldown: 1.35,
        beamCooldown: 4.6,
        beamWarningDuration: 0.85,
        descentInterval: 12,
        descentStep: 12
      }
    }
  }
]

const LEVELS_BY_ID = new Map(LEVEL_DEFINITIONS.map((level) => [level.id, level]))
const BACKGROUNDS_BY_ID = new Map(BACKGROUND_DEFINITIONS.map((background) => [background.id, background]))

export function getLevelProgression(absoluteWave) {
  const safeWave = Math.max(1, Math.floor(absoluteWave) || 1)
  const level = Math.floor((safeWave - 1) / WAVES_PER_LEVEL) + 1
  const waveInLevel = ((safeWave - 1) % WAVES_PER_LEVEL) + 1
  return { wave: safeWave, level, waveInLevel }
}

export function getAbsoluteWave(levelNumber, waveInLevel) {
  const safeLevel = Math.max(1, Math.floor(levelNumber) || 1)
  const safeWaveInLevel = Math.max(1, Math.floor(waveInLevel) || 1)
  return ((safeLevel - 1) * WAVES_PER_LEVEL) + safeWaveInLevel
}

export function getLevelDefinition(levelNumber) {
  const clampedLevel = Math.max(1, Math.floor(levelNumber) || 1)
  return LEVELS_BY_ID.get(Math.min(clampedLevel, LEVEL_DEFINITIONS.length)) ?? LEVEL_DEFINITIONS[0]
}

export function getBackgroundDefinition(backgroundId) {
  return BACKGROUNDS_BY_ID.get(backgroundId) ?? BACKGROUND_DEFINITIONS[0]
}
