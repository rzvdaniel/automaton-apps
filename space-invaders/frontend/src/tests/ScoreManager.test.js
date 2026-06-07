import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoreManager } from '../systems/ScoreManager.js'

describe('ScoreManager', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    })
  })

  it('starts at score 0 lives 3', () => {
    const sm = new ScoreManager(0)
    expect(sm.score).toBe(0)
    expect(sm.lives).toBe(3)
  })

  it('addScore increases score', () => {
    const sm = new ScoreManager(0)
    sm.addScore(50)
    expect(sm.score).toBe(50)
    sm.addScore(30)
    expect(sm.score).toBe(80)
  })

  it('loseLife decreases lives', () => {
    const sm = new ScoreManager(0)
    sm.loseLife()
    expect(sm.lives).toBe(2)
  })

  it('loseLife returns remaining lives', () => {
    const sm = new ScoreManager(0)
    const remaining = sm.loseLife()
    expect(remaining).toBe(2)
  })

  it('isGameOver returns true when lives <= 0', () => {
    const sm = new ScoreManager(0)
    sm.loseLife()
    sm.loseLife()
    expect(sm.isGameOver()).toBe(false)
    sm.loseLife()
    expect(sm.isGameOver()).toBe(true)
  })

  it('reset returns to initial state', () => {
    const sm = new ScoreManager(0)
    sm.addScore(1000)
    sm.loseLife()
    sm.reset()
    expect(sm.score).toBe(0)
    expect(sm.lives).toBe(3)
  })

  it('tracks high score', () => {
    const sm = new ScoreManager(100)
    expect(sm.highScore).toBe(100)
    sm.addScore(200)
    sm.persistHighScore()
    expect(sm.highScore).toBe(200)
    expect(localStorage.setItem).toHaveBeenCalledWith('space-invaders-high-score', '200')
  })

  it('does not update high score if score is lower', () => {
    const sm = new ScoreManager(500)
    sm.addScore(200)
    sm.persistHighScore()
    expect(sm.highScore).toBe(500)
  })
})
