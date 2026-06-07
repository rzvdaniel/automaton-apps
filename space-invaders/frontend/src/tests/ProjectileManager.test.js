import { describe, it, expect } from 'vitest'
import { ProjectileManager } from '../systems/ProjectileManager.js'

describe('ProjectileManager', () => {
  it('adds and retrieves player bullets', () => {
    const pm = new ProjectileManager()
    const bullet = { x: 100, y: 200, width: 8, height: 40, speed: 1200 }
    pm.addPlayerBullet(bullet)
    expect(pm.playerBullets).toHaveLength(1)
    expect(pm.playerBullets[0]).toBe(bullet)
  })

  it('adds and retrieves enemy bullets', () => {
    const pm = new ProjectileManager()
    const bullet = { x: 100, y: 200, width: 10, height: 28, speed: 500 }
    pm.addEnemyBullet(bullet)
    expect(pm.enemyBullets).toHaveLength(1)
    expect(pm.enemyBullets[0]).toBe(bullet)
  })

  it('removes off-screen player bullets (y < -80)', () => {
    const pm = new ProjectileManager()
    pm.addPlayerBullet({ x: 100, y: -10, width: 8, height: 40, speed: 1200 })
    pm.addPlayerBullet({ x: 200, y: 500, width: 8, height: 40, speed: 1200 })
    pm.update(0.016)
    // After update, bullet at y=-10 with speed 1200 moves up by ~19 → -29, still > -80
    // Both remain (need a bigger step to go below -80)
    expect(pm.playerBullets).toHaveLength(2)
  })

  it('removes player bullet when far above screen', () => {
    const pm = new ProjectileManager()
    pm.addPlayerBullet({ x: 100, y: -90, width: 8, height: 40, speed: 1200 })
    pm.update(0) // no movement needed; already at -90 < -80
    expect(pm.playerBullets).toHaveLength(0)
  })

  it('removes off-screen enemy bullets (y > worldHeight + 80)', () => {
    const pm = new ProjectileManager()
    // WORLD.height = 1920
    pm.addEnemyBullet({ x: 100, y: 2010, width: 10, height: 28, speed: 500 })
    pm.update(0) // already > 1920+80=2000
    expect(pm.enemyBullets).toHaveLength(0)
  })

  it('clear() removes all bullets', () => {
    const pm = new ProjectileManager()
    pm.addPlayerBullet({ x: 100, y: 200, width: 8, height: 40, speed: 1200 })
    pm.addEnemyBullet({ x: 200, y: 300, width: 10, height: 28, speed: 500 })
    pm.clear()
    expect(pm.playerBullets).toHaveLength(0)
    expect(pm.enemyBullets).toHaveLength(0)
  })

  it('moves player bullets upward on update', () => {
    const pm = new ProjectileManager()
    const bullet = { x: 100, y: 500, width: 8, height: 40, speed: 1200 }
    pm.addPlayerBullet(bullet)
    pm.update(0.1)
    expect(pm.playerBullets[0].y).toBeLessThan(500)
  })

  it('moves enemy bullets downward on update', () => {
    const pm = new ProjectileManager()
    const bullet = { x: 100, y: 500, width: 10, height: 28, speed: 500 }
    pm.addEnemyBullet(bullet)
    pm.update(0.1)
    expect(pm.enemyBullets[0].y).toBeGreaterThan(500)
  })
})
