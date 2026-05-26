import './styles.css'
import { createGame } from './game.js'
import { setupDebugPanel } from './debug-panel.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <div class="cabinet-glow"></div>
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <div class="top-actions">
      <button class="overlay-button restart-button" type="button">Restart</button>
      <button class="overlay-button pause-button" type="button">Pause</button>
      <button class="overlay-button mute-button" type="button">Mute</button>
      <button class="overlay-button install hidden" type="button">Install</button>
    </div>
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
setupDebugPanel({ game, root: shell })

window.addEventListener('resize', game.resize)
window.addEventListener('orientationchange', game.resize)
restartButton.addEventListener('click', () => {
  game.restart()
})

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
