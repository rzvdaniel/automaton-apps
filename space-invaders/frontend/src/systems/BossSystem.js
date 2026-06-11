import { WORLD } from '../config.js'
function fireBossChargeShot(shootEnemy, origin, velocity, index) {
  shootEnemy({
    originX: origin.x,
    originY: origin.y,
    projectileWidth: 12,
    projectileHeight: 30,
    projectileSpeed: 580,
    projectileVx: velocity.x,
    projectileVy: velocity.y,
    projectileKind: 'boss-beam-charge',
    projectileGlowColor: 'rgba(255, 84, 188, 0.9)',
    projectileCoreColor: '#ffd6ff',
    projectileTailColor: index % 2 === 0 ? '#ff5ccc' : '#ff8ae8',
    ignoreEnemyBulletLimit: true
  })
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
    beamWarningDuration: config.beamWarningDuration ?? 1.45,
    beamFireDuration: config.beamFireDuration ?? 0.72,
    beamWarning: 0,
    beamActive: 0,
    beamX: WORLD.width / 2,
    beamStartY: 0,
    beamHitArmed: true,
    beamSupportWave: 0,
    beamSupportTimer: 0,
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

function syncBeamToReactor(boss) {
  const { core } = getBossHardpoints(boss)
  boss.beamX = core.x
  boss.beamStartY = core.y - boss.height * 0.02
}

function beginChargingBeam(boss) {
  syncBeamToReactor(boss)
  boss.beamWarning = boss.beamWarningDuration
  boss.beamActive = 0
  boss.beamHitArmed = true
  boss.beamSupportWave = 0
  boss.beamSupportTimer = 0.2
  boss.coreCharge = 1
  boss.coreFlash = 1
}

function fireBeamSupportWave(boss, shootEnemy) {
  const { leftPod, rightPod } = getBossHardpoints(boss)
  const waveIndex = boss.beamSupportWave
  const waveSpread = waveIndex === 0
    ? { outer: 230, inner: 120, yOuter: 650, yInner: 710 }
    : { outer: 185, inner: 68, yOuter: 700, yInner: 760 }

  const lanes = [
    { origin: leftPod, offset: -16, velocity: { x: -waveSpread.outer, y: waveSpread.yOuter } },
    { origin: leftPod, offset: 16, velocity: { x: -waveSpread.inner, y: waveSpread.yInner } },
    { origin: rightPod, offset: -16, velocity: { x: waveSpread.inner, y: waveSpread.yInner } },
    { origin: rightPod, offset: 16, velocity: { x: waveSpread.outer, y: waveSpread.yOuter } }
  ]

  lanes.forEach((lane, index) => {
    fireBossChargeShot(
      shootEnemy,
      { x: lane.origin.x + lane.offset, y: lane.origin.y + 4 },
      lane.velocity,
      waveIndex * 4 + index
    )
  })

  boss.leftPodFlash = 1
  boss.rightPodFlash = 1
  boss.beamSupportWave += 1
  boss.beamSupportTimer = 0.5
}

export function updateBoss(state, dt, { shootEnemy, hitPlayer }) {
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

  if (boss.beamWarning > 0 || boss.beamActive > 0) {
    syncBeamToReactor(boss)
  }

  boss.descentTimer = Math.max(0, boss.descentTimer - dt)
  if (boss.descentTimer === 0) {
    boss.y += boss.descentStep
    boss.descentTimer = boss.descentInterval
    if (boss.beamWarning > 0 || boss.beamActive > 0) {
      syncBeamToReactor(boss)
    }
  }

  if (boss.y + boss.height / 2 >= state.player.y - 24) {
    hitPlayer()
    return
  }

  if (boss.beamWarning > 0) {
    boss.beamWarning = Math.max(0, boss.beamWarning - dt)
    boss.coreCharge = Math.min(1.35, 0.65 + (1 - boss.beamWarning / boss.beamWarningDuration) * 0.7)
    boss.beamSupportTimer = Math.max(0, boss.beamSupportTimer - dt)

    if (boss.beamSupportWave < 2 && boss.beamSupportTimer === 0) {
      fireBeamSupportWave(boss, shootEnemy)
    }

    if (boss.beamWarning === 0) {
      boss.beamActive = boss.beamFireDuration
      boss.beamTimer = boss.beamCooldown
      boss.coreFlash = 1
      syncBeamToReactor(boss)
    }
    return
  }

  if (boss.beamActive > 0) {
    boss.beamActive = Math.max(0, boss.beamActive - dt)
    boss.coreCharge = 1.25
    if (boss.beamHitArmed && Math.abs(state.player.x - boss.beamX) < 34) {
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
    beginChargingBeam(boss)
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
