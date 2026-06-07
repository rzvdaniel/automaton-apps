import { WORLD } from '../config.js'

export class EnemyFormation {
  constructor(enemies, config) {
    this.enemies = enemies
    this.direction = 1
    this.stepInterval = config.stepInterval
    this.horizontalStep = config.horizontalStep
    this.drop = config.drop
    this.stepTimer = 0
    this.killSpeedBoost = config.killSpeedBoost
    this.fireRate = config.enemyFireRate
    this.bulletSpeed = config.enemyBulletSpeed
    this.maxBullets = config.maxEnemyBullets
    this.edgeLock = false
  }

  update(dt) {
    const aliveEnemies = this.enemies.filter((e) => e.alive)
    if (!aliveEnemies.length) return { hitWall: false }

    const totalEnemies = this.enemies.length || 1
    const aliveRatio = aliveEnemies.length / totalEnemies
    const speedBoost = 1 + (1 - aliveRatio) * this.killSpeedBoost
    const currentStepInterval = Math.max(0.08, this.stepInterval / speedBoost)
    this.stepTimer += dt
    let hitWall = false

    while (this.stepTimer >= currentStepInterval) {
      this.stepTimer -= currentStepInterval

      let leftEdge = Infinity
      let rightEdge = -Infinity
      for (const enemy of aliveEnemies) {
        leftEdge = Math.min(leftEdge, enemy.x)
        rightEdge = Math.max(rightEdge, enemy.x + enemy.width)
      }

      const nextLeftEdge = leftEdge + this.direction * this.horizontalStep
      const nextRightEdge = rightEdge + this.direction * this.horizontalStep
      const wall = nextLeftEdge < 50 || nextRightEdge > WORLD.width - 50

      if (wall) {
        hitWall = true
        this.direction *= -1
        for (const enemy of aliveEnemies) enemy.y += this.drop
      } else {
        for (const enemy of aliveEnemies) enemy.x += this.direction * this.horizontalStep
      }
    }

    return { hitWall }
  }

  getAliveEnemies() {
    return this.enemies.filter((e) => e.alive)
  }

  tryShoot(dt, maxBullets, bulletSpeed, onShoot) {
    const aliveEnemies = this.getAliveEnemies()
    if (!aliveEnemies.length || Math.random() >= dt * this.fireRate) return

    const columns = new Map()
    for (const enemy of aliveEnemies) {
      const key = Math.round(enemy.x / 12)
      const current = columns.get(key)
      if (!current || enemy.y > current.y) columns.set(key, enemy)
    }
    const shooters = [...columns.values()]
    onShoot(shooters[Math.floor(Math.random() * shooters.length)])
  }
}
