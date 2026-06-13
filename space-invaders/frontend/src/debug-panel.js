export function setupDebugPanel({ game, root }) {
  const debugDialog = root.querySelector('.debug-dialog')
  const debugForm = root.querySelector('.debug-form')
  const debugLevelInput = root.querySelector('#debug-level')
  const debugWaveInput = root.querySelector('#debug-wave')
  const debugLivesInput = root.querySelector('#debug-lives')
  const debugPerformanceInput = root.querySelector('#debug-performance')
  const debugCancel = root.querySelector('.debug-cancel')
  const canvas = root.querySelector('.game')
  let mobileDebugTapCount = 0
  let mobileDebugTapTimer = 0

  function populateLevelOptions() {
    const levels = game.getAvailableLevels()
    debugLevelInput.innerHTML = levels
      .map((level) => `<option value="${level.id}">Level ${level.id} - ${level.name}</option>`)
      .join('')
  }

  function populateWaveOptions() {
    debugWaveInput.innerHTML = Array.from({ length: 5 }, (_, index) => {
      const wave = index + 1
      return `<option value="${wave}">Wave ${wave}</option>`
    }).join('')
  }

  function populateLivesOptions() {
    debugLivesInput.innerHTML = [
      { value: '1', label: '1 life' },
      { value: '2', label: '2 lives' },
      { value: '3', label: '3 lives' },
      { value: 'infinite', label: 'Infinite lives' }
    ]
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join('')
  }

  function closeDebugDialog(resumeGame = true) {
    if (!debugDialog.open) return
    debugDialog.close()
    if (resumeGame) game.setPaused(false)
  }

  function openDebugDialog() {
    game.setPaused(true)
    debugPerformanceInput.checked = game.isDebugOverlayEnabled()
    debugLevelInput.focus()
    debugDialog.showModal()
  }

  debugForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const level = Number(debugLevelInput.value || 1)
    const waveInLevel = Number(debugWaveInput.value || 1)
    const lives = debugLivesInput.value === 'infinite' ? 'infinite' : Number(debugLivesInput.value || 3)
    game.setDebugOverlayEnabled(debugPerformanceInput.checked)
    closeDebugDialog(false)
    game.startAtLevel(level, waveInLevel, lives)
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
        debugLivesInput.value = game.getLives() === Infinity ? 'infinite' : String(Math.max(1, game.getLives()))
        openDebugDialog()
      }
    }
  })

  canvas.addEventListener('pointerdown', (event) => {
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (!isCoarsePointer) return

    const rect = canvas.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const withinSecretZone = localX <= 72 && localY <= 72
    if (!withinSecretZone) {
      mobileDebugTapCount = 0
      if (mobileDebugTapTimer) window.clearTimeout(mobileDebugTapTimer)
      mobileDebugTapTimer = 0
      return
    }

    mobileDebugTapCount += 1
    if (mobileDebugTapTimer) window.clearTimeout(mobileDebugTapTimer)
    mobileDebugTapTimer = window.setTimeout(() => {
      mobileDebugTapCount = 0
      mobileDebugTapTimer = 0
    }, 1400)

    if (mobileDebugTapCount >= 5) {
      mobileDebugTapCount = 0
      window.clearTimeout(mobileDebugTapTimer)
      mobileDebugTapTimer = 0
      const progression = game.getProgression()
      debugLevelInput.value = String(Math.max(1, progression.level))
      debugWaveInput.value = String(Math.max(1, progression.waveInLevel))
      debugLivesInput.value = game.getLives() === Infinity ? 'infinite' : String(Math.max(1, game.getLives()))
      openDebugDialog()
    }
  })

  populateLevelOptions()
  populateWaveOptions()
  populateLivesOptions()
}
