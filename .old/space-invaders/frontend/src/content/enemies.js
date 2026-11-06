export const ENEMY_DEFINITIONS = [
  {
    id: 'elite',
    displayName: 'Elite Invader',
    spriteId: 'elite',
    health: 1,
    points: 50,
    movementPattern: 'formation',
    fireRate: 1.0,
    projectileType: 'standard',
    specialBehavior: null
  },
  {
    id: 'mid',
    displayName: 'Mid Invader',
    spriteId: 'mid',
    health: 1,
    points: 30,
    movementPattern: 'formation',
    fireRate: 1.0,
    projectileType: 'standard',
    specialBehavior: null
  },
  {
    id: 'grunt',
    displayName: 'Grunt Invader',
    spriteId: 'grunt',
    health: 1,
    points: 15,
    movementPattern: 'formation',
    fireRate: 1.0,
    projectileType: 'standard',
    specialBehavior: null
  },
  {
    id: 'ufo',
    displayName: 'Mystery UFO',
    spriteId: 'ufo',
    health: 1,
    points: 'random',
    movementPattern: 'horizontal-pass',
    fireRate: 0,
    projectileType: null,
    specialBehavior: 'ufo-pass'
  }
]
