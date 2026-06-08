import { WORLD } from '../config.js'

export function selectDivingEnemyCandidate(candidates) {
  if (!candidates.length) return null

  const weightedCandidates = candidates
    .map((enemy) => ({
      enemy,
      weight: Math.max(1, enemy.y / 80)
    }))
    .sort((a, b) => b.weight - a.weight)

  const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * totalWeight

  for (const entry of weightedCandidates) {
    roll -= entry.weight
    if (roll <= 0) return entry.enemy
  }

  return weightedCandidates[0].enemy
}

export function updateDivingAliens(state, dt) {
  const divingConfig = state.levelDefinition?.mechanics?.divingAliens
  if (!divingConfig?.enabled) return

  state.divingAttackCooldown = Math.max(0, state.divingAttackCooldown - dt)
  state.divingAttackTimer = Math.max(0, state.divingAttackTimer - dt)

  const livingEnemies = state.enemies.filter((enemy) => enemy.alive)
  const activeDivers = livingEnemies.filter((enemy) => enemy.diving)

  if (activeDivers.length < divingConfig.maxActive && state.divingAttackCooldown === 0 && state.divingAttackTimer === 0) {
    state.divingAttackTimer = divingConfig.minInterval
    if (Math.random() < divingConfig.chancePerSecond) {
      const candidates = livingEnemies.filter((enemy) => !enemy.diving && enemy.diveWarning <= 0)
      const candidate = selectDivingEnemyCandidate(candidates)
      if (candidate) {
        candidate.diving = true
        candidate.diveWarning = divingConfig.warningDuration
        candidate.diveVx = 0
        candidate.diveVy = 0
        state.divingAttackCooldown = divingConfig.minInterval
        state.divingAttackTimer = 0
      }
    }
  }

  for (const enemy of activeDivers) {
    if (enemy.diveWarning > 0) {
      enemy.diveWarning = Math.max(0, enemy.diveWarning - dt)
      continue
    }

    const enemyCenterX = enemy.x + enemy.width / 2
    const horizontalDelta = state.player.x - enemyCenterX
    const targetVx = horizontalDelta * divingConfig.horizontalTracking
    enemy.diveVx += (targetVx - enemy.diveVx) * Math.min(1, dt * 3.6)
    enemy.diveVy = divingConfig.speed
    enemy.x += enemy.diveVx * dt
    enemy.y += enemy.diveVy * dt

    if (enemy.y >= WORLD.height) {
      enemy.alive = false
    }
  }
}

export function getFormationEnemies(enemies) {
  return enemies.filter((enemy) => enemy.alive && !enemy.diving)
}
