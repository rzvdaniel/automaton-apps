import { WORLD } from '../config.js'

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

export function createBoss(config = {}) {
  const targetWidth = WORLD.width * 0.72
  return {
    active: true,
    x: WORLD.width / 2,
    y: -240,
    targetY: 640,
    width: targetWidth,
    height: targetWidth * 0.32,
    hp: config.hp ?? 30,
    maxHp: config.hp ?? 30,
    speed: config.speed ?? 125,
    direction: 1,
    beamCooldown: config.beamCooldown ?? 4.8,
    beamTimer: config.beamInitialDelay ?? 2.2,
    beamWarningDuration: config.beamWarningDuration ?? 1.15,
    beamFireDuration: config.beamFireDuration ?? 0.62,
    beamWarning: 0,
    beamActive: 0,
    beamX: WORLD.width / 2,
    beamStartY: 0,
    beamHitArmed: true,
    damageFlash: 0,
    reactorPulse: 0,
    hoverPhase: Math.random() * Math.PI * 2,
    descentInterval: config.descentInterval ?? 12,
    descentTimer: config.descentInterval ?? 12,
    descentStep: config.descentStep ?? 12,
    entered: false,
    coreCharge: 0,
    leftPodFlash: 0,
    rightPodFlash: 0,
    coreFlash: 0
  }
}

export function getBossHitbox(boss) {
  const hitboxWidth = boss.width * 0.62
  const hitboxHeight = boss.height * 0.5
  const hitboxCenterY = boss.y + boss.height * 0.01
  return {
    left: boss.x - hitboxWidth / 2,
    right: boss.x + hitboxWidth / 2,
    top: hitboxCenterY - hitboxHeight / 2,
    bottom: hitboxCenterY + hitboxHeight / 2
  }
}

export function getBossWeaponMuzzles(boss) {
  return getBossHardpoints(boss)
}

export function getBossHardpoints(boss) {
  return {
    leftPod: { x: boss.x - boss.width * 0.32, y: boss.y + boss.height * 0.22 },
    rightPod: { x: boss.x + boss.width * 0.32, y: boss.y + boss.height * 0.22 },
    core: { x: boss.x, y: boss.y + boss.height * 0.18 }
  }
}

function beginChargingBeam(state, boss) {
  const { core } = getBossHardpoints(boss)
  boss.beamX = Math.max(84, Math.min(WORLD.width - 84, state.player.x + randomBetween(-42, 42)))
  boss.beamStartY = core.y + boss.height * 0.08
  boss.beamWarning = boss.beamWarningDuration
  boss.beamActive = 0
  boss.beamHitArmed = true
  boss.coreCharge = 1
  boss.coreFlash = 1
}

export function updateBoss(state, dt, { shootEnemy: _shootEnemy, hitPlayer }) {
  const boss = state.boss
  if (!boss?.active) return

  boss.damageFlash = Math.max(0, boss.damageFlash - dt * 2.2)
  boss.leftPodFlash = Math.max(0, boss.leftPodFlash - dt * 4)
  boss.rightPodFlash = Math.max(0, boss.rightPodFlash - dt * 4)
  boss.coreFlash = Math.max(0, boss.coreFlash - dt * 3.2)
  boss.reactorPulse += dt

  if (!boss.entered) {
    boss.y += 240 * dt
    if (boss.y >= boss.targetY) {
      boss.y = boss.targetY
      boss.entered = true
    }
    return
  }

  boss.x += boss.direction * boss.speed * dt

  const horizontalMargin = 12
  const leftBound = horizontalMargin + boss.width / 2
  const rightBound = WORLD.width - horizontalMargin - boss.width / 2
  if (boss.x <= leftBound || boss.x >= rightBound) {
    boss.x = Math.max(leftBound, Math.min(rightBound, boss.x))
    boss.direction *= -1
  }

  boss.descentTimer = Math.max(0, boss.descentTimer - dt)
  if (boss.descentTimer === 0) {
    boss.y += boss.descentStep
    boss.descentTimer = boss.descentInterval
  }

  if (boss.y + boss.height / 2 >= state.player.y - 24) {
    hitPlayer()
    return
  }

  if (boss.beamWarning > 0) {
    boss.beamWarning = Math.max(0, boss.beamWarning - dt)
    boss.coreCharge = Math.min(1.35, 0.65 + (1 - boss.beamWarning / boss.beamWarningDuration) * 0.7)
    if (boss.beamWarning === 0) {
      boss.beamActive = boss.beamFireDuration
      boss.beamTimer = boss.beamCooldown
      boss.coreFlash = 1
    }
    return
  }

  if (boss.beamActive > 0) {
    boss.beamActive = Math.max(0, boss.beamActive - dt)
    boss.coreCharge = 1.25
    if (boss.beamHitArmed && Math.abs(state.player.x - boss.beamX) < 24) {
      boss.beamHitArmed = false
      hitPlayer()
    }
    if (boss.beamActive === 0) {
      boss.coreCharge = 0
    }
    return
  }

  boss.coreCharge = Math.max(0, boss.coreCharge - dt * 2.4)
  boss.beamTimer = Math.max(0, boss.beamTimer - dt)
  if (boss.beamTimer === 0) {
    beginChargingBeam(state, boss)
  }
}

export function tryHitBoss(boss, bulletRect) {
  if (!boss?.active) return null

  const hitbox = getBossHitbox(boss)

  if (!(bulletRect.left < hitbox.right && bulletRect.right > hitbox.left && bulletRect.top < hitbox.bottom && bulletRect.bottom > hitbox.top)) {
    return null
  }

  boss.hp -= 1
  boss.damageFlash = 1
  if (boss.hp <= 0) {
    boss.active = false
    return { defeated: true, x: boss.x, y: boss.y }
  }

  return { defeated: false, x: boss.x, y: boss.y }
}
