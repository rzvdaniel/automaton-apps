import { WORLD } from '../config.js'

export const PLAYER_WIDTH = 98
export const PLAYER_HEIGHT = 64
export const PLAYER_SPEED = 760

export function createPlayerState(x, y) {
  return {
    x,
    y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    speed: PLAYER_SPEED,
    cooldown: 0,
    lives: 3,
    invulnerability: 0,
    visualTilt: 0,
    thrust: 0,
    fireFlash: 0,
    destroyed: false,
    destroyedAt: 0
  }
}

export function clampPlayerX(x) {
  return Math.max(74, Math.min(WORLD.width - 74, x))
}

export function updatePlayerMovement(player, movement, dt, settings) {
  const motionScale = settings.reducedMotion ? 0.45 : 1
  const targetTilt = movement * 0.18 * motionScale
  player.visualTilt += (targetTilt - player.visualTilt) * Math.min(1, dt * 14)
  const thrustTarget = movement === 0 ? 0.45 : 1
  player.thrust += (thrustTarget - player.thrust) * Math.min(1, dt * 8)
  player.x = clampPlayerX(player.x + movement * player.speed * dt)
}
