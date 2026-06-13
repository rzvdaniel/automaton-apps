import { describe, expect, it, vi } from 'vitest'
import { createBoss, getBossHardpoints, tryHitBoss, updateBoss } from '../systems/BossSystem.js'
import { getLevelDefinition } from '../content/levels.js'

describe('BossSystem', () => {
  it('creates a boss from level 3 config', () => {
    const config = getLevelDefinition(3).mechanics.finalBoss
    const boss = createBoss(config)
    expect(boss.hp).toBe(config.hp)
    expect(boss.maxHp).toBe(config.hp)
    expect(boss.active).toBe(true)
    expect(boss.y).toBeLessThan(0)
  })

  it('takes damage from core hits and can be defeated', () => {
    const boss = createBoss({ hp: 1 })
    const hit = tryHitBoss(boss, {
      left: boss.x - 10,
      right: boss.x + 10,
      top: boss.y - 10,
      bottom: boss.y + 10
    })

    expect(hit?.defeated).toBe(true)
    expect(boss.active).toBe(false)
    expect(boss.defeated).toBe(true)
    expect(boss.defeatElapsed).toBe(0)
  })

  it('defines left pod, core, and right pod hardpoints', () => {
    const boss = createBoss()
    const hardpoints = getBossHardpoints(boss)
    expect(hardpoints.leftPod.x).toBeLessThan(hardpoints.core.x)
    expect(hardpoints.rightPod.x).toBeGreaterThan(hardpoints.core.x)
    expect(hardpoints.leftPod.y).toBeGreaterThan(boss.y)
  })

  it('fires a double-wave vertical triple shot', () => {
    const boss = createBoss({
      attackSequence: ['tripleShot'],
      attackInitialDelay: 0,
      tripleShotDelay: 0.2,
      tripleShotDuration: 0.5
    })
    boss.entered = true
    boss.y = boss.targetY

    const shots = []
    const shootEnemy = vi.fn((shot) => shots.push(shot))
    const state = { boss, player: { x: boss.x, y: 1200 } }

    updateBoss(state, 0.01, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    updateBoss(state, 0.01, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    expect(shots).toHaveLength(3)

    const hardpoints = getBossHardpoints(boss)
    expect(shots.map((shot) => shot.originX)).toEqual([
      hardpoints.leftPod.x,
      hardpoints.core.x,
      hardpoints.rightPod.x
    ])
    expect(shots.map((shot) => shot.projectileKind)).toEqual([
      'boss-triple-shot',
      'boss-triple-shot',
      'boss-triple-shot'
    ])
    expect(shots.map((shot) => shot.projectileVx)).toEqual([0, 0, 0])

    updateBoss(state, 0.21, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    expect(shots).toHaveLength(6)
    const secondWaveHardpoints = getBossHardpoints(boss)
    expect(shots.slice(3).map((shot) => shot.originX)).toEqual([
      secondWaveHardpoints.leftPod.x,
      secondWaveHardpoints.core.x,
      secondWaveHardpoints.rightPod.x
    ])
    expect(shots.slice(3).map((shot) => shot.projectileVx)).toEqual([0, 0, 0])
  })

  it('sets cooldown after both triple-shot waves fire', () => {
    const boss = createBoss({
      attackSequence: ['tripleShot'],
      attackInitialDelay: 0,
      tripleShotDelay: 0.1,
      tripleShotDuration: 0.24,
      tripleShotCooldown: 1.4
    })
    boss.entered = true
    boss.y = boss.targetY

    updateBoss(
      { boss, player: { x: boss.x, y: 1200 } },
      0.01,
      { shootEnemy: vi.fn(), hitPlayer: vi.fn(), audio: null }
    )
    updateBoss(
      { boss, player: { x: boss.x, y: 1200 } },
      0.3,
      { shootEnemy: vi.fn(), hitPlayer: vi.fn(), audio: null }
    )

    expect(boss.attackTimer).toBe(1.4)
  })

  it('fires two support shots during beam charge before the beam activates', () => {
    const boss = createBoss({
      attackSequence: ['beam'],
      attackInitialDelay: 0,
      beamWarningDuration: 0.2
    })
    boss.entered = true
    boss.y = boss.targetY

    const shots = []
    const shootEnemy = vi.fn((shot) => shots.push(shot))
    const state = { boss, player: { x: boss.x, y: 1200 } }

    updateBoss(state, 0.01, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    expect(shots).toHaveLength(0)

    updateBoss(state, 0.11, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    expect(shots).toHaveLength(2)
    expect(shots.every((shot) => shot.projectileKind === 'boss-beam-charge')).toBe(true)

    const hardpoints = getBossHardpoints(boss)
    expect(shots[0].originX).toBe(hardpoints.leftPod.x)
    expect(shots[1].originX).toBe(hardpoints.rightPod.x)
    expect(boss.beamWarning).toBeGreaterThan(0)

    updateBoss(state, 0.1, { shootEnemy, hitPlayer: vi.fn(), audio: null })
    expect(boss.beamActive).toBeGreaterThan(0)
  })
})
