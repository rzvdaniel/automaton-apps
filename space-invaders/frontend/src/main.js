import './styles.css'
import { createGame } from './game.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <div class="cabinet-glow"></div>
    <canvas class="game" aria-label="Space Invaders playfield"></canvas>
    <div class="top-actions">
      <button class="overlay-button pause-button" type="button">Pause</button>
      <button class="overlay-button mute-button" type="button">Mute</button>
      <button class="overlay-button install hidden" type="button">Install</button>
    </div>
    <div class="touch-controls" aria-hidden="true">
      <button class="touch-zone touch-left" type="button"><span>◀</span></button>
      <button class="touch-zone touch-fire" type="button"><span>FIRE</span></button>
      <button class="touch-zone touch-right" type="button"><span>▶</span></button>
    </div>
  </div>
`

const shell = document.querySelector('.shell')
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

window.addEventListener('resize', game.resize)
window.addEventListener('orientationchange', game.resize)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
  })
}
