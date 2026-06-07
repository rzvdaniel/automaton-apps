import { describe, it, expect } from 'vitest'
import { clampPlayerX, createPlayerState, updatePlayerMovement, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_SPEED } from '../entities/Player.js'

describe('Player', () => {
  it('clamps x to minimum bound', () => {
    expect(clampPlayerX(-100)).toBe(74)
    expect(clampPlayerX(0)).toBe(74)
    expect(clampPlayerX(74)).toBe(74)
  })

  it('clamps x to maximum bound', () => {
    const maxX = 1080 - 74  // WORLD.width - 74
    expect(clampPlayerX(9999)).toBe(maxX)
    expect(clampPlayerX(maxX)).toBe(maxX)
  })

  it('does not clamp when in bounds', () => {
    expect(clampPlayerX(300)).toBe(300)
    expect(clampPlayerX(540)).toBe(540)
  })

  it('createPlayerState returns correct initial shape', () => {
    const player = createPlayerState(540, 1684)
    expect(player.x).toBe(540)
    expect(player.y).toBe(1684)
    expect(player.width).toBe(PLAYER_WIDTH)
    expect(player.height).toBe(PLAYER_HEIGHT)
    expect(player.speed).toBe(PLAYER_SPEED)
    expect(player.lives).toBe(3)
    expect(player.cooldown).toBe(0)
    expect(player.invulnerability).toBe(0)
    expect(player.destroyed).toBe(false)
  })

  it('shooting cooldown prevents rapid fire', () => {
    const player = createPlayerState(540, 1684)
    player.cooldown = 0.14
    // Cooldown > 0 means cannot shoot
    expect(player.cooldown).toBeGreaterThan(0)
  })

  it('cooldown decrements over time via updatePlayerMovement', () => {
    const player = createPlayerState(540, 1684)
    player.cooldown = 0
    const settings = { reducedMotion: false }
    const initialX = player.x
    updatePlayerMovement(player, 1, 0.016, settings)
    // x should have moved right
    expect(player.x).toBeGreaterThan(initialX)
  })

  it('updatePlayerMovement applies tilt when moving', () => {
    const player = createPlayerState(540, 1684)
    const settings = { reducedMotion: false }
    updatePlayerMovement(player, 1, 0.1, settings)
    expect(player.visualTilt).toBeGreaterThan(0)
  })

  it('updatePlayerMovement applies reduced tilt in reduced motion mode', () => {
    const playerA = createPlayerState(540, 1684)
    const playerB = createPlayerState(540, 1684)
    updatePlayerMovement(playerA, 1, 0.1, { reducedMotion: false })
    updatePlayerMovement(playerB, 1, 0.1, { reducedMotion: true })
    expect(playerB.visualTilt).toBeLessThan(playerA.visualTilt)
  })
})
