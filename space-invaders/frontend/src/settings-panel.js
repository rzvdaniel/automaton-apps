export function setupSettingsPanel({ game, root, shell }) {
  const dialog = root.querySelector('.settings-dialog')
  const openButton = root.querySelector('.settings-button')
  const cancelButton = root.querySelector('.settings-close')
  const spriteStyle = root.querySelector('#settings-sprite-style')
  const screenShake = root.querySelector('#settings-screen-shake')
  const backgroundBlur = root.querySelector('#settings-background-blur')
  const reducedMotion = root.querySelector('#settings-reduced-motion')
  const controls = root.querySelector('#settings-controls')
  const keyboardHint = root.querySelector('#settings-keyboard-hint')
  const sound = root.querySelector('#settings-sound')

  function applySettingsToUi(settings) {
    spriteStyle.value = settings.spriteStyle
    screenShake.value = settings.screenShake
    backgroundBlur.value = settings.backgroundBlur
    reducedMotion.checked = settings.reducedMotion
    controls.value = settings.controls
    keyboardHint.checked = settings.keyboardHint
    sound.checked = !game.isMuted()
    shell.dataset.controlsMode = settings.controls
  }

  function persistSettings() {
    const next = {
      spriteStyle: spriteStyle.value,
      screenShake: screenShake.value,
      backgroundBlur: backgroundBlur.value,
      reducedMotion: reducedMotion.checked,
      controls: controls.value,
      keyboardHint: keyboardHint.checked
    }
    game.updateSettings(next)
    game.setMuted(!sound.checked)
    applySettingsToUi(game.getSettings())
  }

  function openDialog() {
    shell.dataset.settingsOpen = 'true'
    if (shell.dataset.gameStarted === 'true') game.setPaused(true)
    applySettingsToUi(game.getSettings())
    dialog.showModal()
  }

  function closeDialog(resume = true) {
    if (!dialog.open) return
    shell.dataset.settingsOpen = 'false'
    dialog.close()
    if (resume && shell.dataset.gameStarted === 'true') game.setPaused(false)
  }

  openButton.addEventListener('click', openDialog)
  cancelButton.addEventListener('click', () => closeDialog(true))
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeDialog(true)
  })

  ;[spriteStyle, screenShake, backgroundBlur, reducedMotion, controls, keyboardHint, sound].forEach((control) => {
    control.addEventListener('change', persistSettings)
  })

  applySettingsToUi(game.getSettings())
  shell.dataset.settingsOpen = 'false'

  return {
    open: openDialog,
    close: closeDialog
  }
}
