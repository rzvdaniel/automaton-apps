export function createPlayerBullet(x, y) {
  return { x, y, width: 8, height: 40, speed: 1200 }
}

export function createEnemyBullet(x, y, speed) {
  return { x, y, width: 10, height: 28, speed }
}
