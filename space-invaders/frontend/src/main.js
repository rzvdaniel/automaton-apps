import './styles.css'
import { ChevronLeft, ChevronRight, createIcons, Pause, Play, Settings } from 'lucide'
import { createGame } from './game/GameApp.js'
import { setupDebugPanel } from './debug-panel.js'
import { getPauseMenuLayout } from './overlay-layout.js'
import { setupSettingsPanel } from './settings-panel.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <div class="cabinet-glow"></div>
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <div class="start-menu" aria-hidden="false">
      <div class="start-menu-panel">
        <div class="start-menu-kicker">DEFEND EARTH</div>
        <h1 class="start-menu-title">
          <span>SPACE</span>
          <span>INVADERS</span>
        </h1>
        <div class="start-menu-divider"></div>
        <p class="start-menu-copy">Survive 3 levels, 15 waves, and the mothership assault.</p>
        <div class="start-menu-actions">
          <button class="start-menu-button start-play" type="button">Start Game</button>
          <button class="start-menu-button start-settings" type="button">Settings</button>
        </div>
        <p class="start-menu-hint">Desktop: arrows / A D move · Space / Enter fire</p>
      </div>
    </div>
    <div class="top-actions">
      <button class="overlay-button overlay-button-icon pause-button" type="button" aria-label="Pause" title="Pause" data-state="pause">
        <i class="toolbar-svg toolbar-svg-pause" data-lucide="pause" aria-hidden="true"></i>
        <i class="toolbar-svg toolbar-svg-play" data-lucide="play" aria-hidden="true"></i>
      </button>
      <button class="overlay-button overlay-button-icon settings-button" type="button" aria-label="Settings" title="Settings">
        <i class="toolbar-svg toolbar-svg-settings" data-lucide="settings" aria-hidden="true"></i>
      </button>
      <button class="overlay-button install hidden" type="button">Install</button>
    </div>
    <div class="pause-menu" aria-hidden="true">
      <div class="pause-menu-panel">
        <div class="pause-menu-title">Paused</div>
        <div class="pause-menu-actions">
          <button class="pause-menu-button pause-resume" type="button">Resume</button>
          <button class="pause-menu-button pause-restart" type="button">Restart</button>
        </div>
      </div>
    </div>
    <dialog class="debug-dialog">
      <form class="debug-form" method="dialog">
        <div class="debug-title">Debug Start</div>
        <label class="debug-label" for="debug-level">Start from level</label>
        <select class="debug-input" id="debug-level" name="level"></select>
        <label class="debug-label" for="debug-wave">Wave in level</label>
        <input class="debug-input" id="debug-wave" name="wave" type="number" min="1" max="5" step="1" value="1" />
        <label class="debug-label" for="debug-lives">Starting lives</label>
        <input class="debug-input" id="debug-lives" name="lives" type="number" min="1" max="9" step="1" value="3" />
        <div class="debug-actions">
          <button class="overlay-button debug-cancel" type="button">Cancel</button>
          <button class="overlay-button debug-start" type="submit">Start</button>
        </div>
      </form>
    </dialog>
    <div class="touch-controls" aria-hidden="true">
      <button class="touch-zone touch-left" type="button" aria-label="Move left">
        <i class="touch-icon" data-lucide="chevron-left" aria-hidden="true"></i>
      </button>
      <button class="touch-zone touch-fire" type="button"><span class="touch-fire-label">FIRE</span></button>
      <button class="touch-zone touch-right" type="button" aria-label="Move right">
        <i class="touch-icon" data-lucide="chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
`

createIcons({
  icons: { ChevronLeft, ChevronRight, Pause, Play, Settings },
  attrs: {
    'stroke-width': 1.9
  }
})

const shell = document.querySelector('.shell')
const startMenu = document.querySelector('.start-menu')
const startPlayButton = document.querySelector('.start-play')
const startSettingsButton = document.querySelector('.start-settings')
const pauseMenu = document.querySelector('.pause-menu')
const settingsButton = document.querySelector('.settings-button')
const pauseButton = document.querySelector('.pause-button')
const touchFireButton = document.querySelector('.touch-fire')
const touchFireLabel = document.querySelector('.touch-fire-label')
const game = createGame({
  canvas: document.querySelector('.game'),
  shell,
  installButton: document.querySelector('.install'),
  pauseButton,
  touchControls: {
    left: document.querySelector('.touch-left'),
    fire: document.querySelector('.touch-fire'),
    right: document.querySelector('.touch-right')
  }
})
const settingsPanel = setupSettingsPanel({ game, root: shell, shell })
setupDebugPanel({ game, root: shell })

const pauseResumeButton = document.querySelector('.pause-resume')
const pauseRestartButton = document.querySelector('.pause-restart')

function syncPauseMenu() {
  const isStarted = shell.dataset.gameStarted === 'true'
  const isPaused = shell.dataset.gamePaused === 'true'
  const isRunning = shell.dataset.gameRunning === 'true'
  const isSettingsOpen = shell.dataset.settingsOpen === 'true'
  const isGameOver = isStarted && !isRunning
  startMenu.setAttribute('aria-hidden', !isStarted && !isSettingsOpen ? 'false' : 'true')
  pauseMenu.setAttribute('aria-hidden', isPaused && !isSettingsOpen ? 'false' : 'true')
  pauseButton.classList.toggle('hidden', !isStarted)
  pauseButton.disabled = !isStarted || !isRunning
  pauseButton.dataset.state = isPaused ? 'play' : 'pause'
  touchFireLabel.textContent = isGameOver ? 'RETRY' : 'FIRE'
  touchFireButton.setAttribute('aria-label', isGameOver ? 'Retry game' : 'Fire')

  pauseButton.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause')
  pauseButton.setAttribute('title', isPaused ? 'Resume' : 'Pause')
  positionPauseMenu()
}

function positionPauseMenu() {
  const { scale, offsetX, offsetY, desktopMode, composition } = game.getViewport()
  const { panel, actions } = getPauseMenuLayout(desktopMode, composition.pauseShiftWorld)
  pauseMenu.style.setProperty('--pause-panel-left', `${offsetX + panel.x * scale}px`)
  pauseMenu.style.setProperty('--pause-panel-top', `${offsetY + panel.y * scale}px`)
  pauseMenu.style.setProperty('--pause-panel-width', `${panel.width * scale}px`)
  pauseMenu.style.setProperty('--pause-panel-height', `${panel.height * scale}px`)
  actions.forEach((action) => {
    pauseMenu.style.setProperty(`--pause-${action.id}-left`, `${offsetX + action.x * scale}px`)
    pauseMenu.style.setProperty(`--pause-${action.id}-top`, `${offsetY + action.y * scale}px`)
    pauseMenu.style.setProperty(`--pause-${action.id}-width`, `${action.width * scale}px`)
    pauseMenu.style.setProperty(`--pause-${action.id}-height`, `${action.height * scale}px`)
  })
}

window.addEventListener('resize', game.resize)
window.addEventListener('resize', positionPauseMenu)
window.addEventListener('orientationchange', game.resize)
window.addEventListener('orientationchange', positionPauseMenu)
startPlayButton.addEventListener('click', () => {
  game.restart()
  syncPauseMenu()
})
startSettingsButton.addEventListener('click', () => {
  settingsButton.click()
})
pauseResumeButton.addEventListener('click', () => {
  game.setPaused(false)
  syncPauseMenu()
})
pauseRestartButton.addEventListener('click', () => {
  game.restart()
  syncPauseMenu()
})
shell.addEventListener('game-state-change', syncPauseMenu)
shell.addEventListener('settings-menu-change', syncPauseMenu)
positionPauseMenu()
syncPauseMenu()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isLocalDev =
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '::1'

    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })

      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key))
        })
      }

      return
    }

    navigator.serviceWorker.register('./sw.js')
  })
}
