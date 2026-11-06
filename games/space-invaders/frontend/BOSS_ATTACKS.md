# Boss Attacks

This document describes the Level 3 mothership attacks as they are currently implemented in [src/systems/BossSystem.js](/C:/Work/automaton-apps/space-invaders/frontend/src/systems/BossSystem.js).

## Rotation

Default attack sequence:

`burst -> beam -> tripleShot -> burst -> beam`

The boss keeps moving horizontally during normal play, reverses at the screen edges, and descends over time. The only attack that temporarily pauses horizontal movement is `tripleShot`.

## 1. Energy Burst

Internal name: `burst`

Behavior:

- Charges briefly through `energyBurstActive`.
- Fires one large orb from each hardpoint:
  - left pod: diagonal down-left
  - core: straight down
  - right pod: diagonal down-right
- Uses the `boss-energy-burst` projectile kind.

Current projectile layout:

- Left pod: `vx -120`, `vy 360`
- Core: `vx 0`, `vy 430`
- Right pod: `vx 120`, `vy 360`

Current timing:

- `energyBurstDuration`: `0.54s`
- `energyBurstCooldown`: `1.35s`

Visual notes:

- Large glowing orb bullets.
- Triggers left pod, right pod, and core muzzle flashes.

## 2. Beam

Internal name: `beam`

Behavior:

- Starts a warning phase tied to the reactor core position.
- During warning, the boss fires 2 support shots:
  - one from the left pod
  - one from the right pod
- After warning ends, the beam activates and remains attached to the moving core.

Current timing:

- `beamWarningDuration`: `0.85s` from level config by default
- `beamFireDuration`: `0.72s`
- `beamCooldown`: `4.6s` from level config by default

Support shots during beam charge:

- Projectile kind: `boss-beam-charge`
- Left pod: `vx -88`, `vy 365`
- Right pod: `vx 88`, `vy 365`
- Fired once when warning reaches about `45%` remaining.

Collision notes:

- Beam damage is checked against the beam x-position while active.
- The beam follows the boss during active fire.

## 3. Double Vertical Triple Shot

Internal name: `tripleShot`

Behavior:

- The boss pauses horizontal movement wherever it currently is.
- Fires a first vertical salvo from:
  - left pod
  - core
  - right pod
- Waits briefly.
- Fires a second vertical salvo from the same three lanes.
- Resumes normal horizontal movement after the attack completes.

Projectile kind:

- `boss-triple-shot`

Asset:

- [public/images/boss-triple-shot-bullet.svg](/C:/Work/automaton-apps/space-invaders/frontend/public/images/boss-triple-shot-bullet.svg)

Current projectile layout:

- Left pod: `vx 0`, `vy 388`
- Core: `vx 0`, `vy 418`
- Right pod: `vx 0`, `vy 388`

Current timing:

- `tripleShotDuration`: `0.56s`
- `tripleShotDelay`: `0.32s`
- `tripleShotCooldown`: `1.15s`

Visual notes:

- Uses a dedicated red projectile sprite instead of the pink beam-support sprite.
- Triggers left pod, right pod, and core flashes.

## Hardpoints

Current hardpoints:

- Left pod: `boss.x - boss.width * 0.32`, `boss.y + boss.height * 0.22`
- Right pod: `boss.x + boss.width * 0.32`, `boss.y + boss.height * 0.22`
- Core: `boss.x`, `boss.y + boss.height * 0.18`

## Tuning Reference

The most useful boss tuning fields currently supported by `createBoss()` are:

- `attackSequence`
- `attackInitialDelay`
- `beamCooldown`
- `beamWarningDuration`
- `beamFireDuration`
- `energyBurstDuration`
- `spreadCooldown`
- `tripleShotDuration`
- `tripleShotDelay`
- `tripleShotCooldown`
- `descentInterval`
- `descentStep`
