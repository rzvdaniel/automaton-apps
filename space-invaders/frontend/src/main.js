import './styles.css'
import { ChevronLeft, ChevronRight, createIcons, Pause, Play, Settings } from 'lucide'
import { createGame } from './game/GameApp.js'
import { setupDebugPanel } from './debug-panel.js'
import { setupSettingsPanel } from './settings-panel.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <div class="cabinet-glow"></div>
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <div class="game-dialog-layer start-menu" aria-hidden="false">
      <section class="game-dialog game-dialog-start" aria-labelledby="start-menu-title">
        <div class="game-dialog-kicker">DEFEND EARTH</div>
        <h1 class="game-dialog-title game-dialog-title-xl" id="start-menu-title">
          <span>SPACE</span>
          <span>INVADERS</span>
        </h1>
        <div class="game-dialog-divider"></div>
        <p class="game-dialog-copy">Survive 3 levels, 15 waves, and the mothership assault.</p>
        <div class="game-dialog-actions">
          <button class="game-dialog-button game-dialog-button-primary start-play" type="button">Start Game</button>
          <button class="game-dialog-button start-settings" type="button">Settings</button>
        </div>
        <p class="game-dialog-hint">Desktop: arrows / A D move · Space / Enter fire</p>
      </section>
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
    <div class="game-dialog-layer pause-menu" aria-hidden="true">
      <section class="game-dialog game-dialog-pause" aria-labelledby="pause-menu-title">
        <div class="game-dialog-kicker">SYSTEM HOLD</div>
        <h2 class="game-dialog-title" id="pause-menu-title">Paused</h2>
        <div class="game-dialog-divider"></div>
        <p class="game-dialog-copy">The invasion is waiting. Resume when you are ready.</p>
        <div class="game-dialog-actions">
          <button class="game-dialog-button game-dialog-button-primary pause-resume" type="button">Resume</button>
          <button class="game-dialog-button pause-restart" type="button">Restart</button>
        </div>
      </section>
    </div>
    <div class="game-dialog-layer game-over-menu" aria-hidden="true">
      <section class="game-dialog game-dialog-danger" aria-labelledby="game-over-title">
        <div class="game-dialog-kicker">SIGNAL LOST</div>
        <h2 class="game-dialog-title" id="game-over-title">Game Over</h2>
        <div class="game-dialog-divider"></div>
        <p class="game-dialog-copy">Your ship was destroyed.</p>
        <div class="game-dialog-stats" aria-label="Final progress">
          <span>Level <strong class="game-over-level">1</strong></span>
          <span>Wave <strong class="game-over-wave">1</strong></span>
          <span>Score <strong class="game-over-score">000000</strong></span>
        </div>
        <div class="game-dialog-actions">
          <button class="game-dialog-button game-dialog-button-primary game-over-retry" type="button">Try Again</button>
        </div>
      </section>
    </div>
    <div class="game-dialog-layer victory-menu" aria-hidden="true">
      <section class="game-dialog game-dialog-success" aria-labelledby="victory-title">
        <div class="game-dialog-kicker">INVASION STOPPED</div>
        <h2 class="game-dialog-title" id="victory-title">Victory</h2>
        <div class="game-dialog-divider"></div>
        <p class="game-dialog-copy">You destroyed the mothership and saved Earth.</p>
        <div class="game-dialog-stats" aria-label="Final score">
          <span>Level <strong class="victory-level">1</strong></span>
          <span>Wave <strong class="victory-wave">1</strong></span>
          <span>Score <strong class="victory-score">000000</strong></span>
        </div>
        <div class="game-dialog-actions">
          <button class="game-dialog-button game-dialog-button-primary victory-replay" type="button">Play Again</button>
          <button class="game-dialog-button victory-main-menu" type="button">Main Menu</button>
        </div>
      </section>
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
const gameOverMenu = document.querySelector('.game-over-menu')
const gameOverLevel = document.querySelector('.game-over-level')
const gameOverWave = document.querySelector('.game-over-wave')
const gameOverScore = document.querySelector('.game-over-score')
const gameOverRetryButton = document.querySelector('.game-over-retry')
const victoryMenu = document.querySelector('.victory-menu')
const victoryLevel = document.querySelector('.victory-level')
const victoryWave = document.querySelector('.victory-wave')
const victoryScore = document.querySelector('.victory-score')
const victoryReplayButton = document.querySelector('.victory-replay')
const victoryMainMenuButton = document.querySelector('.victory-main-menu')
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
  const isVictory = game.hasVictory()
  const isGameOver = isStarted && !isRunning && !isVictory
  const isGameFinished = isStarted && !isRunning
  const progression = game.getProgression()
  startMenu.setAttribute('aria-hidden', !isStarted && !isSettingsOpen ? 'false' : 'true')
  pauseMenu.setAttribute('aria-hidden', isPaused && !isSettingsOpen ? 'false' : 'true')
  gameOverMenu.setAttribute('aria-hidden', isGameOver && !isSettingsOpen ? 'false' : 'true')
  victoryMenu.setAttribute('aria-hidden', isVictory && !isSettingsOpen ? 'false' : 'true')
  gameOverLevel.textContent = String(progression.level)
  gameOverWave.textContent = String(progression.waveInLevel)
  gameOverScore.textContent = String(game.getScore()).padStart(6, '0')
  victoryLevel.textContent = String(progression.level)
  victoryWave.textContent = String(progression.waveInLevel)
  victoryScore.textContent = String(game.getScore()).padStart(6, '0')
  pauseButton.classList.toggle('hidden', !isStarted)
  pauseButton.disabled = !isStarted || !isRunning
  pauseButton.dataset.state = isPaused ? 'play' : 'pause'
  touchFireLabel.textContent = isGameFinished ? 'RETRY' : 'FIRE'
  touchFireButton.setAttribute('aria-label', isGameFinished ? 'Retry game' : 'Fire')

  pauseButton.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause')
  pauseButton.setAttribute('title', isPaused ? 'Resume' : 'Pause')
}

window.addEventListener('resize', game.resize)
window.addEventListener('orientationchange', game.resize)
startPlayButton.addEventListener('click', () => {
  game.startAtLevel(1, 1, 3)
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
gameOverRetryButton.addEventListener('click', () => {
  game.startAtLevel(1, 1, 3)
  syncPauseMenu()
})
victoryReplayButton.addEventListener('click', () => {
  game.startAtLevel(1, 1, 3)
  syncPauseMenu()
})
victoryMainMenuButton.addEventListener('click', () => {
  game.restart()
  syncPauseMenu()
})
shell.addEventListener('game-state-change', syncPauseMenu)
shell.addEventListener('settings-menu-change', syncPauseMenu)
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
