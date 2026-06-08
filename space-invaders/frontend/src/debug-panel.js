export function setupDebugPanel({ game, root }) {
  const debugDialog = root.querySelector('.debug-dialog')
  const debugForm = root.querySelector('.debug-form')
  const debugLevelInput = root.querySelector('#debug-level')
  const debugWaveInput = root.querySelector('#debug-wave')
  const debugCancel = root.querySelector('.debug-cancel')

  function populateLevelOptions() {
    const levels = game.getAvailableLevels()
    debugLevelInput.innerHTML = levels
      .map((level) => `<option value="${level.id}">Level ${level.id} - ${level.name}</option>`)
      .join('')
  }

  function closeDebugDialog(resumeGame = true) {
    if (!debugDialog.open) return
    debugDialog.close()
    if (resumeGame) game.setPaused(false)
  }

  function openDebugDialog() {
    game.setPaused(true)
    debugLevelInput.focus()
    debugDialog.showModal()
  }

  debugForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const level = Number(debugLevelInput.value || 1)
    const waveInLevel = Number(debugWaveInput.value || 1)
    closeDebugDialog(false)
    game.startAtLevel(level, waveInLevel)
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
        const progression = game.getProgression()
        debugLevelInput.value = String(Math.max(1, progression.level))
        debugWaveInput.value = String(Math.max(1, progression.waveInLevel))
        openDebugDialog()
      }
    }
  })

  populateLevelOptions()
}
