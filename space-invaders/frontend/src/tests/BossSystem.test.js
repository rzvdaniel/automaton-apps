import { describe, expect, it } from 'vitest'
import { createBoss, getBossHardpoints, tryHitBoss } from '../systems/BossSystem.js'
import { getLevelDefinition } from '../content/levels.js'

describe('BossSystem', () => {
  it('creates a boss from level 3 config', () => {
    const config = getLevelDefinition(3).mechanics.finalBoss
    const boss = createBoss(config)
    expect(boss.hp).toBe(40)
    expect(boss.maxHp).toBe(40)
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
  })

  it('defines left pod, core, and right pod hardpoints', () => {
    const boss = createBoss()
    const hardpoints = getBossHardpoints(boss)
    expect(hardpoints.leftPod.x).toBeLessThan(hardpoints.core.x)
    expect(hardpoints.rightPod.x).toBeGreaterThan(hardpoints.core.x)
    expect(hardpoints.leftPod.y).toBeGreaterThan(boss.y)
  })
})
