import './styles.css'
import { createGame } from './game.js'
import { setupDebugPanel } from './debug-panel.js'
import { setupSettingsPanel } from './settings-panel.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <div class="cabinet-glow"></div>
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <div class="top-actions">
      <button class="overlay-button overlay-button-icon settings-button" type="button" aria-label="Settings" title="Settings">⚙</button>
      <button class="overlay-button overlay-button-desktop restart-button" type="button" aria-label="Restart" title="Restart">↻</button>
      <button class="overlay-button overlay-button-icon pause-button" type="button" aria-label="Pause" title="Pause">⏸</button>
      <button class="overlay-button overlay-button-icon mute-button" type="button" aria-label="Sound on" title="Sound on">🔊</button>
      <button class="overlay-button install hidden" type="button">Install</button>
    </div>
    <div class="pause-menu" aria-hidden="true">
      <div class="pause-menu-panel">
        <div class="pause-menu-kicker">Command Link</div>
        <div class="pause-menu-title">Paused</div>
        <div class="pause-menu-status">Command Link Active</div>
        <div class="pause-menu-actions">
          <button class="pause-menu-button pause-resume" type="button">Resume</button>
          <button class="pause-menu-button pause-restart" type="button">Restart</button>
          <button class="pause-menu-button pause-sound" type="button">Sound On</button>
          <button class="pause-menu-button pause-settings" type="button">Settings</button>
        </div>
      </div>
    </div>
    <dialog class="settings-dialog">
      <div class="settings-form">
        <div class="debug-title">Settings</div>
        <label class="settings-row" for="settings-sprite-style">
          <span>Sprite style</span>
          <select class="debug-input settings-select" id="settings-sprite-style">
            <option value="pixel-gaps">Pixel gaps</option>
            <option value="smooth">Smooth</option>
          </select>
        </label>
        <label class="settings-row" for="settings-screen-shake">
          <span>Screen shake</span>
          <select class="debug-input settings-select" id="settings-screen-shake">
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label class="settings-row" for="settings-background-blur">
          <span>Background blur</span>
          <select class="debug-input settings-select" id="settings-background-blur">
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label class="settings-row" for="settings-controls">
          <span>Controls</span>
          <select class="debug-input settings-select" id="settings-controls">
            <option value="buttons">Buttons</option>
            <option value="zones">Touch zones</option>
          </select>
        </label>
        <label class="settings-toggle"><span>Sound</span><input id="settings-sound" type="checkbox" checked /></label>
        <label class="settings-toggle"><span>Reduced motion</span><input id="settings-reduced-motion" type="checkbox" /></label>
        <label class="settings-toggle"><span>Keyboard hint</span><input id="settings-keyboard-hint" type="checkbox" checked /></label>
        <div class="debug-actions">
          <button class="overlay-button settings-restart" type="button">Restart</button>
          <button class="overlay-button settings-close" type="button">Close</button>
        </div>
      </div>
    </dialog>
    <dialog class="debug-dialog">
      <form class="debug-form" method="dialog">
        <div class="debug-title">Debug Wave</div>
        <label class="debug-label" for="debug-wave">Start from wave</label>
        <input class="debug-input" id="debug-wave" name="wave" type="number" min="1" max="99" step="1" value="1" />
        <div class="debug-actions">
          <button class="overlay-button debug-cancel" type="button">Cancel</button>
          <button class="overlay-button debug-start" type="submit">Start</button>
        </div>
      </form>
    </dialog>
    <div class="touch-controls" aria-hidden="true">
      <button class="touch-zone touch-left" type="button"><span>◀</span></button>
      <button class="touch-zone touch-fire" type="button"><span>FIRE</span></button>
      <button class="touch-zone touch-right" type="button"><span>▶</span></button>
    </div>
  </div>
`

const shell = document.querySelector('.shell')
const restartButton = document.querySelector('.restart-button')
const pauseMenu = document.querySelector('.pause-menu')
const game = createGame({
  canvas: document.querySelector('.game'),
  shell,
  installButton: document.querySelector('.install'),
  muteButton: document.querySelector('.mute-button'),
  pauseButton: document.querySelector('.pause-button'),
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
const pauseSoundButton = document.querySelector('.pause-sound')
const pauseSettingsButton = document.querySelector('.pause-settings')

function syncPauseMenu() {
  pauseMenu.setAttribute('aria-hidden', shell.dataset.gamePaused === 'true' ? 'false' : 'true')
  pauseSoundButton.textContent = game.isMuted() ? 'Sound Off' : 'Sound On'
}

window.addEventListener('resize', game.resize)
window.addEventListener('orientationchange', game.resize)
restartButton.addEventListener('click', () => {
  game.restart()
})
pauseResumeButton.addEventListener('click', () => {
  game.setPaused(false)
  syncPauseMenu()
})
pauseRestartButton.addEventListener('click', () => {
  game.restart()
  syncPauseMenu()
})
pauseSoundButton.addEventListener('click', () => {
  game.setMuted(!game.isMuted())
  syncPauseMenu()
})
pauseSettingsButton.addEventListener('click', () => {
  settingsPanel.open()
  syncPauseMenu()
})
shell.addEventListener('game-state-change', syncPauseMenu)
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
