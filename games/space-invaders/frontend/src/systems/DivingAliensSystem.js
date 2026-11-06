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

function selectGroupedDivingEnemies(candidates, count) {
  const leader = selectDivingEnemyCandidate(candidates)
  if (!leader || count <= 1) return leader ? [leader] : []

  const leaderCenterX = leader.x + leader.width / 2
  const nearby = candidates
    .filter((enemy) => enemy !== leader)
    .sort((a, b) => {
      const aDistance = Math.abs((a.x + a.width / 2) - leaderCenterX) + Math.abs(a.y - leader.y) * 0.55
      const bDistance = Math.abs((b.x + b.width / 2) - leaderCenterX) + Math.abs(b.y - leader.y) * 0.55
      return aDistance - bDistance
    })
    .slice(0, count - 1)

  return [leader, ...nearby]
}

function getDivingGroupSize(state, divingConfig, activeDivers) {
  const waveInLevel = state.waveInLevel ?? 1
  const groupWaveStart = divingConfig.squadWaveStart ?? 3
  if (waveInLevel < groupWaveStart) return 1
  if (activeDivers.length > 0) return 1
  if (Math.random() >= (divingConfig.squadChance ?? 0)) return 1

  const maxAllowed = Math.max(1, Math.min(divingConfig.maxSquadSize ?? 3, divingConfig.maxActive ?? 1))
  const wavePressure = Math.max(0, waveInLevel - groupWaveStart)
  return Math.min(maxAllowed, 2 + Math.floor(wavePressure / 2))
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
      const availableSlots = Math.max(1, divingConfig.maxActive - activeDivers.length)
      const groupSize = Math.min(availableSlots, getDivingGroupSize(state, divingConfig, activeDivers))
      const selectedEnemies = selectGroupedDivingEnemies(candidates, groupSize)
      if (selectedEnemies.length) {
        selectedEnemies.forEach((enemy, index) => {
          enemy.diving = true
          enemy.diveWarning = divingConfig.warningDuration + index * 0.08
          enemy.diveVx = 0
          enemy.diveVy = 0
        })
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
