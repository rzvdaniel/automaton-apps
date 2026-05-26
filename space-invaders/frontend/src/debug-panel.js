export function setupDebugPanel({ game, root }) {
  const debugDialog = root.querySelector('.debug-dialog')
  const debugForm = root.querySelector('.debug-form')
  const debugWaveInput = root.querySelector('#debug-wave')
  const debugCancel = root.querySelector('.debug-cancel')

  function closeDebugDialog(resumeGame = true) {
    if (!debugDialog.open) return
    debugDialog.close()
    if (resumeGame) game.setPaused(false)
  }

  function openDebugDialog() {
    game.setPaused(true)
    debugWaveInput.focus()
    debugDialog.showModal()
  }

  debugForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const wave = Number(debugWaveInput.value || 1)
    closeDebugDialog(false)
    game.startAtWave(wave)
  })

  debugCancel.addEventListener('click', () => {
    closeDebugDialog(true)
  })

  debugDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeDebugDialog(true)
  })

  window.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.code === 'KeyD') {
      event.preventDefault()
      if (debugDialog.open) {
        closeDebugDialog(true)
      } else {
        debugWaveInput.value = String(Math.max(1, game.getWave()))
        openDebugDialog()
      }
    }
  })
}
