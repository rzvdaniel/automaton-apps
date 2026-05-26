export function getPauseMenuLayout(desktopMode, muted) {
  const panelWidth = desktopMode ? 540 : 700
  const panelHeight = desktopMode ? 540 : 660
  const panelX = (1080 - panelWidth) / 2
  const panelY = desktopMode ? 300 : 292
  const buttonWidth = panelWidth - (desktopMode ? 132 : 112)
  const buttonHeight = desktopMode ? 62 : 78
  const buttonX = panelX + (panelWidth - buttonWidth) / 2
  const firstButtonY = panelY + (desktopMode ? 236 : 302)
  const buttonGap = desktopMode ? 26 : 30
  const actions = [
    { id: 'resume', label: 'RESUME' },
    { id: 'restart', label: 'RESTART' },
    { id: 'sound', label: muted ? 'SOUND OFF' : 'SOUND ON' },
    { id: 'settings', label: 'SETTINGS' }
  ].map((action, index) => ({
    ...action,
    x: buttonX,
    y: firstButtonY + index * (buttonHeight + buttonGap),
    width: buttonWidth,
    height: buttonHeight
  }))

  return {
    panel: { x: panelX, y: panelY, width: panelWidth, height: panelHeight },
    actions
  }
}
