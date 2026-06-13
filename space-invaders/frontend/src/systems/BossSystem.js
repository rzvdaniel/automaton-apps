import { WORLD } from '../config.js'

function fireBossEnergyBurstShot(shootEnemy, origin, velocity, index) {
  shootEnemy({
    originX: origin.x,
    originY: origin.y,
    projectileWidth: 66,
    projectileHeight: 66,
    projectileSpeed: velocity.speed ?? 320,
    projectileVx: velocity.x,
    projectileVy: velocity.y,
    projectileKind: 'boss-energy-burst',
    projectileGlowColor: 'rgba(220, 92, 255, 0.9)',
    projectileCoreColor: '#ffd6ff',
    projectileTailColor: '#c47cff',
    ignoreEnemyBulletLimit: true,
    phase: index * 1.7 + Math.random() * 0.4
  })
}

function fireBossSupportShot(shootEnemy, origin, velocity, index) {
  const projectileKind = velocity.kind ?? 'boss-beam-charge'
  shootEnemy({
    originX: origin.x,
    originY: origin.y,
    projectileWidth: velocity.size ?? 30,
    projectileHeight: velocity.size ?? 30,
    projectileSpeed: velocity.speed ?? 340,
    projectileVx: velocity.x,
    projectileVy: velocity.y,
    projectileKind,
    projectileGlowColor: velocity.glowColor ?? 'rgba(255, 84, 188, 0.9)',
    ignoreEnemyBulletLimit: true,
    phase: index * 0.8 + Math.random() * 0.25
  })
}

export function createBoss(config = {}) {
  const targetWidth = WORLD.width * 0.72
  return {
    active: true,
    x: WORLD.width / 2,
    y: -240,
    targetY: 560,
    width: targetWidth,
    height: targetWidth * 0.32,
    hp: config.hp ?? 50,
    maxHp: config.hp ?? 50,
    speed: config.speed ?? 82,
    direction: 1,
    attackSequence: config.attackSequence ?? ['burst', 'beam', 'tripleShot', 'burst', 'beam'],
    attackIndex: 0,
    attackTimer: config.attackInitialDelay ?? 1.8,
    beamCooldown: config.beamCooldown ?? 2.4,
    beamWarningDuration: config.beamWarningDuration ?? 1.45,
    beamFireDuration: config.beamFireDuration ?? 0.72,
    beamWarning: 0,
    beamActive: 0,
    beamX: WORLD.width / 2,
    beamStartY: 0,
    beamHitArmed: true,
    beamSupportShotsFired: false,
    energyBurstDuration: config.energyBurstDuration ?? 0.54,
    energyBurstCooldown: config.spreadCooldown ?? 1.35,
    energyBurstActive: 0,
    energyBurstShotsFired: false,
    tripleShotActive: 0,
    tripleShotDuration: config.tripleShotDuration ?? 0.56,
    tripleShotDelay: config.tripleShotDelay ?? 0.42,
    tripleShotCooldown: config.tripleShotCooldown ?? 1.15,
    tripleShotWave: 0,
    tripleShotTimer: 0,
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
    coreFlash: 0,
    defeated: false,
    defeatElapsed: 0,
    defeatNextSparkAt: 0.15
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
  boss.beamSupportShotsFired = false
  boss.coreCharge = 1
  boss.coreFlash = 1
}

function beginEnergyBurst(boss) {
  syncBeamToReactor(boss)
  boss.energyBurstActive = boss.energyBurstDuration
  boss.energyBurstShotsFired = false
  boss.coreCharge = 0.9
  boss.coreFlash = 1
}

function beginNextAttack(boss, shootEnemy) {
  const attack = boss.attackSequence[boss.attackIndex % boss.attackSequence.length]
  boss.attackIndex += 1

  if (attack === 'beam') {
    beginChargingBeam(boss)
    return
  }

  if (attack === 'tripleShot') {
    beginTripleShot(boss)
    return
  }

  beginEnergyBurst(boss)
}

function beginTripleShot(boss) {
  syncBeamToReactor(boss)
  boss.tripleShotActive = boss.tripleShotDuration
  boss.tripleShotWave = 0
  boss.tripleShotTimer = 0
  boss.coreCharge = 0.4
}

function fireEnergyBurst(boss, shootEnemy) {
  const { leftPod, rightPod, core } = getBossHardpoints(boss)
  const shots = [
    { origin: leftPod, velocity: { x: -120, y: 360, speed: 340 } },
    { origin: core, velocity: { x: 0, y: 430, speed: 380 } },
    { origin: rightPod, velocity: { x: 120, y: 360, speed: 340 } }
  ]

  shots.forEach((shot, index) => {
    fireBossEnergyBurstShot(
      shootEnemy,
      { x: shot.origin.x, y: shot.origin.y + 10 },
      shot.velocity,
      index
    )
  })

  boss.leftPodFlash = 1
  boss.rightPodFlash = 1
  boss.coreFlash = 1
}

function fireTripleShot(boss, shootEnemy) {
  if (!shootEnemy) return
  const { leftPod, core, rightPod } = getBossHardpoints(boss)
  const shots = [
    { origin: leftPod, velocity: { x: 0, y: 388, speed: 350, size: 38, kind: 'boss-triple-shot', glowColor: 'rgba(255, 82, 82, 0.9)' } },
    { origin: core, velocity: { x: 0, y: 418, speed: 365, size: 42, kind: 'boss-triple-shot', glowColor: 'rgba(255, 82, 82, 0.9)' } },
    { origin: rightPod, velocity: { x: 0, y: 388, speed: 350, size: 38, kind: 'boss-triple-shot', glowColor: 'rgba(255, 82, 82, 0.9)' } }
  ]

  shots.forEach((shot, index) => {
    fireBossSupportShot(
      shootEnemy,
      { x: shot.origin.x, y: shot.origin.y + 10 },
      shot.velocity,
      index
    )
  })

  boss.leftPodFlash = 1
  boss.rightPodFlash = 1
  boss.coreFlash = 0.7
  boss.coreCharge = 0.4
}

function fireBeamSupportShots(boss, shootEnemy) {
  const { leftPod, rightPod } = getBossHardpoints(boss)
  const shots = [
    { origin: leftPod, velocity: { x: -88, y: 365, speed: 340 } },
    { origin: rightPod, velocity: { x: 88, y: 365, speed: 340 } }
  ]

  shots.forEach((shot, index) => {
    fireBossSupportShot(
      shootEnemy,
      { x: shot.origin.x, y: shot.origin.y + 10 },
      shot.velocity,
      index
    )
  })

  boss.leftPodFlash = 1
  boss.rightPodFlash = 1
}

export function updateBoss(state, dt, { shootEnemy, hitPlayer, audio }) {
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

  const tripleShotHolding = boss.tripleShotActive > 0
  if (!tripleShotHolding) {
    boss.x += boss.direction * boss.speed * dt

    const horizontalMargin = -36
    const leftBound = horizontalMargin + boss.width / 2
    const rightBound = WORLD.width - horizontalMargin - boss.width / 2
    if (boss.x <= leftBound || boss.x >= rightBound) {
      boss.x = Math.max(leftBound, Math.min(rightBound, boss.x))
      boss.direction *= -1
    }
  }

  if (boss.beamWarning > 0 || boss.beamActive > 0 || boss.energyBurstActive > 0 || boss.tripleShotActive > 0) {
    syncBeamToReactor(boss)
  }

  boss.descentTimer = Math.max(0, boss.descentTimer - dt)
  if (boss.descentTimer === 0) {
    boss.y += boss.descentStep
    boss.descentTimer = boss.descentInterval
    if (boss.beamWarning > 0 || boss.beamActive > 0 || boss.energyBurstActive > 0 || boss.tripleShotActive > 0) {
      syncBeamToReactor(boss)
    }
  }

  if (boss.y + boss.height / 2 >= state.player.y - 24) {
    hitPlayer()
    return
  }

  if (boss.energyBurstActive > 0) {
    boss.energyBurstActive = Math.max(0, boss.energyBurstActive - dt)
    boss.coreCharge = 0.9

    if (!boss.energyBurstShotsFired && boss.energyBurstActive <= boss.energyBurstDuration * 0.45) {
      boss.energyBurstShotsFired = true
      fireEnergyBurst(boss, shootEnemy)
    }

    if (boss.energyBurstActive === 0) {
      boss.coreCharge = 0
      boss.attackTimer = boss.energyBurstCooldown
    }
    return
  }

  if (boss.beamWarning > 0) {
    boss.beamWarning = Math.max(0, boss.beamWarning - dt)
    boss.coreCharge = Math.min(1.35, 0.65 + (1 - boss.beamWarning / boss.beamWarningDuration) * 0.7)

    if (!boss.beamSupportShotsFired && boss.beamWarning <= boss.beamWarningDuration * 0.45) {
      boss.beamSupportShotsFired = true
      fireBeamSupportShots(boss, shootEnemy)
    }

    if (boss.beamWarning === 0) {
      boss.beamActive = boss.beamFireDuration
      boss.attackTimer = boss.beamCooldown
      boss.coreFlash = 1
      syncBeamToReactor(boss)
      audio?.bossBeamFire()
    }
    return
  }

  if (boss.tripleShotActive > 0) {
    boss.tripleShotActive = Math.max(0, boss.tripleShotActive - dt)
    boss.tripleShotTimer = Math.max(0, boss.tripleShotTimer - dt)
    boss.coreCharge = 0.4

    if (boss.tripleShotWave < 2 && boss.tripleShotTimer === 0) {
      fireTripleShot(boss, shootEnemy)
      boss.tripleShotWave += 1
      boss.tripleShotTimer = boss.tripleShotWave < 2 ? boss.tripleShotDelay : boss.tripleShotActive
    }

    if (boss.tripleShotActive === 0) {
      boss.coreCharge = 0
      boss.attackTimer = boss.tripleShotCooldown
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
  boss.attackTimer = Math.max(0, boss.attackTimer - dt)
  if (boss.attackTimer === 0) {
    if (audio && boss.attackSequence[boss.attackIndex % boss.attackSequence.length] === 'beam') {
      audio.bossBeamCharge()
    }
    beginNextAttack(boss, shootEnemy)
  }
}

export function tryHitBoss(boss, bulletRect) {
  if (!boss?.active || boss.defeated) return null

  const hitbox = getBossHitbox(boss)

  if (!(bulletRect.left < hitbox.right && bulletRect.right > hitbox.left && bulletRect.top < hitbox.bottom && bulletRect.bottom > hitbox.top)) {
    return null
  }

  boss.hp -= 1
  boss.damageFlash = 1
  if (boss.hp <= 0) {
    boss.active = false
    boss.defeated = true
    boss.defeatElapsed = 0
    boss.defeatNextSparkAt = 0.15
    boss.beamWarning = 0
    boss.beamActive = 0
    boss.energyBurstActive = 0
    boss.tripleShotActive = 0
    boss.coreCharge = 0
    return { defeated: true, x: boss.x, y: boss.y }
  }

  return { defeated: false, x: boss.x, y: boss.y }
}
