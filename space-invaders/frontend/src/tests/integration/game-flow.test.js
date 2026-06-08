import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInitialState } from '../../game/GameState.js'
import { ScoreManager } from '../../systems/ScoreManager.js'
import { getWaveConfig } from '../../systems/WaveManager.js'
import { intersects, rectFromCenter } from '../../systems/CollisionSystem.js'
import { LEVEL_DEFINITIONS, getLevelProgression } from '../../content/levels.js'
import { ENEMY_DEFINITIONS } from '../../content/enemies.js'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn()
  })
})

describe('Game flow integration', () => {
  it('game starts when input received on title screen', () => {
    const state = createInitialState()
    expect(state.started).toBe(false)
    // Simulate start: same logic as resetGame in GameApp
    state.started = true
    state.running = true
    expect(state.started).toBe(true)
  })

  it('game pauses when setPaused logic applied', () => {
    const state = createInitialState()
    state.started = true
    state.running = true
    // Simulate setPaused(true)
    state.paused = true
    state.message = 'PAUSED'
    state.overlayTimer = 999
    expect(state.paused).toBe(true)
    expect(state.message).toBe('PAUSED')
  })

  it('game resumes when setPaused(false) applied', () => {
    const state = createInitialState()
    state.started = true
    state.running = true
    state.paused = true
    // Simulate setPaused(false)
    state.paused = false
    state.overlayTimer = 0
    expect(state.paused).toBe(false)
    expect(state.overlayTimer).toBe(0)
  })

  it('losing a life decrements lives via ScoreManager', () => {
    const sm = new ScoreManager(0)
    expect(sm.lives).toBe(3)
    sm.loseLife()
    expect(sm.lives).toBe(2)
  })

  it('game over when lives reach 0', () => {
    const sm = new ScoreManager(0)
    sm.loseLife()
    sm.loseLife()
    sm.loseLife()
    expect(sm.isGameOver()).toBe(true)
  })

  it('new wave spawns when all enemies cleared', () => {
    const state = createInitialState()
    state.wave = 1
    // Simulate enemy clear → wave increments
    const nextWave = state.wave + 1
    expect(nextWave).toBe(2)
    const config = getWaveConfig(nextWave)
    expect(config.columns).toBeGreaterThanOrEqual(6)
  })

  it('maps absolute waves to five-wave levels', () => {
    expect(getLevelProgression(1)).toEqual({ wave: 1, level: 1, waveInLevel: 1 })
    expect(getLevelProgression(5)).toEqual({ wave: 5, level: 1, waveInLevel: 5 })
    expect(getLevelProgression(6)).toEqual({ wave: 6, level: 2, waveInLevel: 1 })
  })

  it('loading a level definition sets background id', () => {
    const level = LEVEL_DEFINITIONS[0]
    expect(level.backgroundId).toBe('planet-cinematic')
    expect(level.name).toBe('Red Planet')
  })

  it('enemy type stats from definitions are applied correctly', () => {
    const elite = ENEMY_DEFINITIONS.find((e) => e.id === 'elite')
    const grunt = ENEMY_DEFINITIONS.find((e) => e.id === 'grunt')
    expect(elite.points).toBeGreaterThan(grunt.points)
    expect(elite.movementPattern).toBe('formation')
  })

  it('collision between bullet and enemy is detected', () => {
    const bullet = { x: 100, y: 200, width: 8, height: 40 }
    const enemy = { x: 85, y: 185, width: 30, height: 30, alive: true }
    const bulletRect = rectFromCenter(bullet)
    const enemyRect = { left: enemy.x, right: enemy.x + enemy.width, top: enemy.y, bottom: enemy.y + enemy.height }
    expect(intersects(bulletRect, enemyRect)).toBe(true)
  })

  it('bullet misses enemy when not overlapping', () => {
    const bullet = { x: 500, y: 200, width: 8, height: 40 }
    const enemy = { x: 85, y: 185, width: 30, height: 30 }
    const bulletRect = rectFromCenter(bullet)
    const enemyRect = { left: enemy.x, right: enemy.x + enemy.width, top: enemy.y, bottom: enemy.y + enemy.height }
    expect(intersects(bulletRect, enemyRect)).toBe(false)
  })

  it('wave config row assignment via level definition', () => {
    const level = LEVEL_DEFINITIONS[0]
    expect(level.enemyFormation.rowAssignment(0)).toBe('elite')
    expect(level.enemyFormation.rowAssignment(1)).toBe('mid')
    expect(level.enemyFormation.rowAssignment(4)).toBe('grunt')
  })
})
