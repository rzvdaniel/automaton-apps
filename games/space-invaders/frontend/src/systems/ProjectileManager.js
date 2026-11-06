import { WORLD } from '../config.js'

export class ProjectileManager {
  constructor() {
    this.playerBullets = []
    this.enemyBullets = []
  }

  addPlayerBullet(bullet) {
    this.playerBullets.push(bullet)
  }

  addEnemyBullet(bullet) {
    this.enemyBullets.push(bullet)
  }

  update(dt) {
    for (const bullet of this.playerBullets) bullet.y -= bullet.speed * dt
    this.playerBullets = this.playerBullets.filter((b) => b.y > -80)

    for (const bullet of this.enemyBullets) {
      if (typeof bullet.vx === 'number' || typeof bullet.vy === 'number') {
        bullet.x += (bullet.vx ?? 0) * dt
        bullet.y += (bullet.vy ?? bullet.speed) * dt
      } else {
        bullet.y += bullet.speed * dt
      }
    }
    this.enemyBullets = this.enemyBullets.filter((b) => (
      b.y < WORLD.height + 80 &&
      b.y > -120 &&
      b.x > -120 &&
      b.x < WORLD.width + 120
    ))
  }

  clear() {
    this.playerBullets = []
    this.enemyBullets = []
  }
}
