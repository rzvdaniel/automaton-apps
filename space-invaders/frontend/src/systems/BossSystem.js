import { WORLD } from '../config.js'

const BOSS_PATTERNS = {
  POD_ALTERNATE: 'pod-alternate',
  POD_SPREAD: 'pod-spread',
  CORE_PULSE: 'core-pulse',
  CORE_BEAM: 'core-beam'
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function getNormalizedVector(dx, dy) {
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
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
    spreadCooldown: config.spreadCooldown ?? 1.35,
    beamCooldown: Math.max(6.8, config.beamCooldown ?? 6.8),
    beamTimer: Math.max(4.8, config.beamCooldown ?? 6.8),
    beamWarningDuration: config.beamWarningDuration ?? 0.85,
    beamWarning: 0,
    beamActive: 0,
    beamX: WORLD.width / 2,
    beamStartY: 0,
    damageFlash: 0,
    reactorPulse: 0,
    hoverPhase: Math.random() * Math.PI * 2,
    descentInterval: config.descentInterval ?? 12,
    descentTimer: config.descentInterval ?? 12,
    descentStep: config.descentStep ?? 12,
    entered: false,
    attackTimer: 0.85,
    attackPattern: null,
    attackStep: 0,
    attackStepTimer: 0,
    attackRepeatCount: 0,
    attackSide: Math.random() > 0.5 ? 'left' : 'right',
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

function fireBossProjectile(shootEnemy, origin, velocity, {
  width = 12,
  height = 30,
  speed = 760,
  kind = 'boss-pod',
  glowColor = 'rgba(255, 92, 140, 0.9)',
  coreColor = '#ff5c8c',
  tailColor = '#ffd37b'
} = {}) {
  shootEnemy({
    originX: origin.x,
    originY: origin.y,
    projectileWidth: width,
    projectileHeight: height,
    projectileSpeed: speed,
    projectileVx: velocity.x,
    projectileVy: velocity.y,
    projectileKind: kind,
    projectileGlowColor: glowColor,
    projectileCoreColor: coreColor,
    projectileTailColor: tailColor
  })
}

function firePodBurst(boss, shootEnemy, state, side, aimPlayer = false) {
  const hardpoints = getBossHardpoints(boss)
  const origin = side === 'left' ? hardpoints.leftPod : hardpoints.rightPod
  const playerDx = state.player.x - origin.x
  for (let index = 0; index < 2; index += 1) {
    const spread = index === 0 ? -0.06 : 0.06
    const playerBias = aimPlayer && index === 1 ? playerDx / 6.5 : 0
    fireBossProjectile(
      shootEnemy,
      { x: origin.x + randomBetween(-5, 5), y: origin.y + randomBetween(-2, 4) },
      {
        x: playerBias + randomBetween(-26, 26) + spread * 240,
        y: 760 + randomBetween(-25, 55)
      }
    )
  }
  if (side === 'left') {
    boss.leftPodFlash = 1
  } else {
    boss.rightPodFlash = 1
  }
}

function fireWideSpread(boss, shootEnemy) {
  const { leftPod, rightPod } = getBossHardpoints(boss)
  const inwardSpeed = 110
  const outwardSpeed = 150
  const straightSpeed = 790
  const podOrigins = [
    { point: leftPod, inward: inwardSpeed, outward: -outwardSpeed, side: 'left' },
    { point: rightPod, inward: -inwardSpeed, outward: outwardSpeed, side: 'right' }
  ]

  for (const origin of podOrigins) {
    fireBossProjectile(shootEnemy, origin.point, { x: randomBetween(-18, 18), y: straightSpeed + randomBetween(-20, 35) })
    fireBossProjectile(shootEnemy, origin.point, { x: origin.inward + randomBetween(-14, 14), y: 740 + randomBetween(-20, 35) })
    fireBossProjectile(shootEnemy, origin.point, { x: origin.outward + randomBetween(-14, 14), y: 740 + randomBetween(-20, 35) })
    if (origin.side === 'left') boss.leftPodFlash = 1
    if (origin.side === 'right') boss.rightPodFlash = 1
  }
}

function fireCorePulse(boss, shootEnemy, state) {
  const { core } = getBossHardpoints(boss)
  const targetVector = getNormalizedVector(state.player.x - core.x, Math.max(360, state.player.y - core.y))
  const baseAngles = [-0.42, -0.2, 0, 0.2, 0.42]

  for (const angleOffset of baseAngles) {
    const angle = Math.atan2(targetVector.y, targetVector.x) + angleOffset + randomBetween(-0.025, 0.025)
    fireBossProjectile(
      shootEnemy,
      { x: core.x + randomBetween(-4, 4), y: core.y + randomBetween(-3, 3) },
      {
        x: Math.cos(angle) * 520,
        y: Math.sin(angle) * 520
      },
      {
        width: 16,
        height: 34,
        speed: 520,
        kind: 'boss-core',
        glowColor: 'rgba(255, 164, 236, 0.95)',
        coreColor: '#ffd4ff',
        tailColor: '#ff7ad3'
      }
    )
  }
  boss.coreFlash = 1
}

function chooseAttackPattern(boss) {
  const hpRatio = boss.hp / Math.max(1, boss.maxHp)
  const roll = Math.random()

  if (boss.beamTimer === 0 && hpRatio <= 0.42 && roll > 0.78) {
    return BOSS_PATTERNS.CORE_BEAM
  }

  if (hpRatio > 0.72) {
    return roll > 0.82 ? BOSS_PATTERNS.POD_SPREAD : BOSS_PATTERNS.POD_ALTERNATE
  }

  if (hpRatio > 0.38) {
    if (roll > 0.78) return BOSS_PATTERNS.CORE_PULSE
    if (roll > 0.48) return BOSS_PATTERNS.POD_SPREAD
    return BOSS_PATTERNS.POD_ALTERNATE
  }

  if (roll > 0.78) return BOSS_PATTERNS.CORE_BEAM
  if (roll > 0.52) return BOSS_PATTERNS.CORE_PULSE
  if (roll > 0.24) return BOSS_PATTERNS.POD_SPREAD
  return BOSS_PATTERNS.POD_ALTERNATE
}

function beginAttackPattern(boss) {
  boss.attackPattern = chooseAttackPattern(boss)
  boss.attackStep = 0
  boss.attackStepTimer = 0
  boss.attackRepeatCount = 2 + Math.floor(Math.random() * 2)
  boss.attackSide = Math.random() > 0.5 ? 'left' : 'right'
  boss.coreCharge = 0
}

function updateAttackPattern(state, boss, dt, shootEnemy) {
  if (!boss.attackPattern) {
    boss.attackTimer = Math.max(0, boss.attackTimer - dt)
    if (boss.attackTimer === 0) {
      beginAttackPattern(boss)
    }
    return
  }

  boss.attackStepTimer = Math.max(0, boss.attackStepTimer - dt)
  if (boss.attackPattern === BOSS_PATTERNS.POD_ALTERNATE) {
    if (boss.attackStepTimer > 0) return
    const side = boss.attackSide
    firePodBurst(boss, shootEnemy, state, side, Math.random() > 0.55)
    boss.attackSide = side === 'left' ? 'right' : 'left'
    boss.attackStep += 1
    if (boss.attackStep >= boss.attackRepeatCount * 2) {
      boss.attackPattern = null
      boss.attackTimer = 1 + Math.random() * 0.65
      return
    }
    boss.attackStepTimer = 0.25
    return
  }

  if (boss.attackPattern === BOSS_PATTERNS.POD_SPREAD) {
    if (boss.attackStepTimer > 0) return
    fireWideSpread(boss, shootEnemy)
    boss.attackPattern = null
    boss.attackTimer = 1.15 + Math.random() * 0.75
    return
  }

  if (boss.attackPattern === BOSS_PATTERNS.CORE_PULSE) {
    if (boss.attackStep === 0) {
      boss.coreCharge = Math.min(1, boss.coreCharge + dt / 0.35)
      if (boss.coreCharge >= 1) {
        fireCorePulse(boss, shootEnemy, state)
        boss.attackStep = 1
        boss.attackStepTimer = 0.18
      }
      return
    }
    if (boss.attackStepTimer > 0) return
    boss.coreCharge = 0
    boss.attackPattern = null
    boss.attackTimer = 1.3 + Math.random() * 0.7
    return
  }

  if (boss.attackPattern === BOSS_PATTERNS.CORE_BEAM) {
    if (boss.beamWarning === 0 && boss.beamActive === 0) {
      const { core } = getBossHardpoints(boss)
      boss.beamX = Math.max(70, Math.min(WORLD.width - 70, state.player.x + randomBetween(-18, 18)))
      boss.beamStartY = core.y
      boss.beamWarning = 0.7
      boss.coreCharge = 1
      boss.attackPattern = null
      boss.attackTimer = 1.45 + Math.random() * 0.8
    }
  }
}

export function updateBoss(state, dt, { shootEnemy, hitPlayer }) {
  const boss = state.boss
  if (!boss?.active) return

  boss.damageFlash = Math.max(0, boss.damageFlash - dt * 2.2)
  boss.leftPodFlash = Math.max(0, boss.leftPodFlash - dt * 4)
  boss.rightPodFlash = Math.max(0, boss.rightPodFlash - dt * 4)
  boss.coreFlash = Math.max(0, boss.coreFlash - dt * 3.2)
  if (boss.attackPattern !== BOSS_PATTERNS.CORE_PULSE && boss.beamWarning === 0) {
    boss.coreCharge = Math.max(0, boss.coreCharge - dt * 2.4)
  }
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

  const horizontalMargin = 36
  const leftBound = horizontalMargin + boss.width / 2
  const rightBound = WORLD.width - horizontalMargin - boss.width / 2
  if (boss.x <= leftBound || boss.x >= rightBound) {
    boss.x = Math.max(leftBound, Math.min(rightBound, boss.x))
    boss.direction *= -1
  }

  boss.beamTimer = Math.max(0, boss.beamTimer - dt)
  boss.beamActive = Math.max(0, boss.beamActive - dt)
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
    if (boss.beamWarning === 0) {
      boss.beamActive = 0.45
      if (Math.abs(state.player.x - boss.beamX) < 18) {
        hitPlayer()
      }
      boss.beamTimer = boss.beamCooldown
      boss.coreFlash = 1
    }
    return
  }

  if (boss.beamActive > 0) {
    if (Math.abs(state.player.x - boss.beamX) < 18) {
      hitPlayer()
    }
    return
  }

  updateAttackPattern(state, boss, dt, shootEnemy)
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
