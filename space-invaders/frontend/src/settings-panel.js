export function setupSettingsPanel({ game, root, shell }) {
  const dialog = root.querySelector('.settings-dialog')
  const openButton = root.querySelector('.settings-button')
  const cancelButton = root.querySelector('.settings-close')
  const restartButton = root.querySelector('.settings-restart')
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
    game.setPaused(true)
    applySettingsToUi(game.getSettings())
    dialog.showModal()
  }

  function closeDialog(resume = true) {
    if (!dialog.open) return
    dialog.close()
    if (resume) game.setPaused(false)
  }

  openButton.addEventListener('click', openDialog)
  cancelButton.addEventListener('click', () => closeDialog(true))
  restartButton.addEventListener('click', () => {
    closeDialog(false)
    game.restart()
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeDialog(true)
  })

  ;[spriteStyle, screenShake, backgroundBlur, reducedMotion, controls, keyboardHint, sound].forEach((control) => {
    control.addEventListener('change', persistSettings)
  })

  applySettingsToUi(game.getSettings())

  return {
    open: openDialog,
    close: closeDialog
  }
}
