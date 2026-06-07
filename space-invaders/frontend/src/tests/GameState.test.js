import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInitialState } from '../game/GameState.js'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn()
  })
})

describe('GameState', () => {
  it('starts not running, not started', () => {
    const state = createInitialState()
    expect(state.started).toBe(false)
    // running starts true (shows title screen, background runs)
    expect(state.running).toBe(true)
    expect(state.paused).toBe(false)
  })

  it('loads high score from localStorage', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'space-invaders-high-score') return '5000'
      return null
    })
    const state = createInitialState()
    expect(state.highScore).toBe(5000)
  })

  it('has 3 initial lives', () => {
    const state = createInitialState()
    expect(state.player.lives).toBe(3)
  })

  it('starts on wave 1', () => {
    const state = createInitialState()
    expect(state.wave).toBe(1)
  })

  it('starts with INSERT COIN message', () => {
    const state = createInitialState()
    expect(state.message).toBe('INSERT COIN')
  })

  it('starts with muted=false when no localStorage entry', () => {
    const state = createInitialState()
    expect(state.muted).toBe(false)
  })

  it('reads muted from localStorage', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'space-invaders-muted') return '1'
      return null
    })
    const state = createInitialState()
    expect(state.muted).toBe(true)
  })

  it('initialises composition with zero shifts', () => {
    const state = createInitialState()
    expect(state.composition.enemyShiftWorld).toBe(0)
    expect(state.composition.playerLiftWorld).toBe(0)
  })

  it('accepts settings param', () => {
    const settings = { spriteStyle: 'smooth', screenShake: 'off' }
    const state = createInitialState({ settings })
    expect(state.settings.spriteStyle).toBe('smooth')
  })
})
