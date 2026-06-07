export const LEVEL_DEFINITIONS = [
  {
    id: 1,
    name: 'Space Invaders',
    backgroundId: 'planet-cinematic',
    enemyFormation: {
      enemyTypes: ['grunt', 'mid', 'elite'],
      rowAssignment(row) {
        if (row === 0) return 'elite'
        if (row < 3) return 'mid'
        return 'grunt'
      }
    },
    waveRules: {
      type: 'endless',
      startWave: 1
    },
    musicTheme: null,
    difficultyModifiers: {}
  }
]
