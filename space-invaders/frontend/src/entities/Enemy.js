export const ENEMY_RANK_SCORES = { elite: 50, mid: 30, grunt: 15 }

export function createEnemy(x, y, rank, width, height, arrivalDelay = 0) {
  return {
    x,
    y,
    width,
    height,
    rank,
    alive: true,
    phase: Math.random() * Math.PI * 2,
    arrivalDelay
  }
}
