import { STORAGE_KEYS, WORLD } from '../config.js'
import { getBackgroundDefinition, getLevelDefinition } from '../content/levels.js'

export function createInitialState({ settings, backgroundImage = null, backgroundEffects = null } = {}) {
  const levelDefinition = getLevelDefinition(1)
  const backgroundDefinition = getBackgroundDefinition(levelDefinition.backgroundId)
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    elapsed: 0,
    running: true,
    started: false,
    paused: false,
    score: 0,
    wave: 1,
    waveInLevel: 1,
    level: 1,
    levelDefinition,
    backgroundDefinition,
    highScore: Number((typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEYS.highScore)) || 0),
    muted: typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEYS.muted) === '1',
    overlayTimer: 999,
    message: 'INSERT COIN',
    intermission: null,
    waveArrivalTimer: 0,
    waveArrivalDuration: 0,
    waveArrivalCuePending: false,
    waveLockTimer: 0,
    waveLockDuration: 0,
    divingAttackCooldown: 0,
    divingAttackTimer: 0,
    ufo: null,
    particles: [],
    bullets: [],
    enemyBullets: [],
    enemies: [],
    pendingInstallPrompt: null,
    flash: 0,
    shake: { x: 0, y: 0, power: 0, duration: 0, cooldown: 0 },
    backgroundImage,
    backgroundEffects,
    composition: {
      progress: 0,
      enemyShiftWorld: 0,
      playerLiftWorld: 0,
      overlayShiftWorld: 0,
      pauseShiftWorld: 0,
      settingsShiftWorld: 0,
      controlsLiftPx: 0,
      controlsMaxWidthPx: 420
    },
    desktopMode: false,
    settingsOpen: false,
    settingsMenu: null,
    settings: settings ?? {},
    player: {
      x: WORLD.width / 2,
      y: WORLD.height - 236,
      width: 98,
      height: 64,
      speed: 760,
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
}
