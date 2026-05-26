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

export function getSettingsMenuLayout(desktopMode) {
  const panelWidth = desktopMode ? 640 : 760
  const panelHeight = desktopMode ? 860 : 1020
  const panelX = (1080 - panelWidth) / 2
  const panelY = desktopMode ? 180 : 170
  const dividerY = panelY + (desktopMode ? 232 : 260)
  const rowX = panelX + (desktopMode ? 62 : 58)
  const rowWidth = panelWidth - (desktopMode ? 124 : 116)
  const rowGap = desktopMode ? 10 : 12
  const rowCount = arguments[1] ?? 7
  const footerHeight = desktopMode ? 36 : 48
  const closeHeight = desktopMode ? 56 : 68
  const closeWidth = desktopMode ? 250 : 320
  const listTop = dividerY + (desktopMode ? 34 : 42)
  const listBottom = panelY + panelHeight - (desktopMode ? 54 : 64)
  const availableHeight = listBottom - listTop - closeHeight - footerHeight - (desktopMode ? 24 : 30) - rowGap * Math.max(0, rowCount - 1)
  const rowHeight = Math.max(desktopMode ? 40 : 54, Math.floor(availableHeight / Math.max(1, rowCount)))
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    x: rowX,
    y: listTop + index * (rowHeight + rowGap),
    width: rowWidth,
    height: rowHeight
  }))
  const closeButton = {
    x: panelX + (panelWidth - closeWidth) / 2,
    y: rows.length ? rows.at(-1).y + rowHeight + (desktopMode ? 18 : 24) : listTop,
    width: closeWidth,
    height: closeHeight
  }
  const footerY = closeButton.y + closeButton.height + (desktopMode ? 24 : 30)

  return {
    panel: { x: panelX, y: panelY, width: panelWidth, height: panelHeight },
    dividerY,
    rows,
    closeButton,
    footerY
  }
}
