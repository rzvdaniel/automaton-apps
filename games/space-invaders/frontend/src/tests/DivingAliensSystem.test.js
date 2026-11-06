import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLevelDefinition } from '../content/levels.js'
import { updateDivingAliens, getFormationEnemies } from '../systems/DivingAliensSystem.js'

function createEnemy(overrides = {}) {
  return {
    x: 120,
    y: 220,
    width: 64,
    height: 64,
    alive: true,
    diving: false,
    diveWarning: 0,
    diveVx: 0,
    diveVy: 0,
    ...overrides
  }
}

function createState(level = 2, enemies = [createEnemy()]) {
  return {
    levelDefinition: getLevelDefinition(level),
    divingAttackCooldown: 0,
    divingAttackTimer: 0,
    enemies,
    player: { x: 540 }
  }
}

describe('DivingAliensSystem', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  it('does nothing when the level mechanic is disabled', () => {
    const enemy = createEnemy()
    const state = createState(1, [enemy])
    updateDivingAliens(state, 0.16)
    expect(enemy.diving).toBe(false)
  })

  it('starts a warning phase before a dive', () => {
    const enemy = createEnemy({ y: 360 })
    const state = createState(2, [enemy])
    updateDivingAliens(state, 0.1)
    expect(enemy.diving).toBe(true)
    expect(enemy.diveWarning).toBeGreaterThan(0)
    expect(state.divingAttackCooldown).toBeGreaterThan(0)
  })

  it('moves a diver downward after warning expires', () => {
    const enemy = createEnemy({ diving: true, diveWarning: 0, y: 300 })
    const state = createState(2, [enemy])
    updateDivingAliens(state, 0.2)
    expect(enemy.y).toBeGreaterThan(300)
  })

  it('excludes diving enemies from formation movement inputs', () => {
    const enemies = [createEnemy(), createEnemy({ diving: true }), createEnemy({ alive: false })]
    expect(getFormationEnemies(enemies)).toHaveLength(1)
  })
})
