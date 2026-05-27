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

export function getSettingsMenuLayout(desktopMode, rowCount = 4, view = 'main') {
  const isMainView = view === 'main'
  const panelWidth = desktopMode ? (isMainView ? 720 : 720) : (isMainView ? 840 : 780)
  const panelHeight = desktopMode ? (isMainView ? 760 : 900) : (isMainView ? 900 : 1060)
  const panelX = (1080 - panelWidth) / 2
  const panelY = desktopMode ? (isMainView ? 228 : 212) : (isMainView ? 220 : 236)
  const dividerY = panelY + (desktopMode ? (isMainView ? 234 : 250) : (isMainView ? 270 : 286))
  const rowX = panelX + (desktopMode ? (isMainView ? 68 : 62) : (isMainView ? 54 : 58))
  const rowWidth = panelWidth - (desktopMode ? (isMainView ? 136 : 124) : (isMainView ? 108 : 116))
  const rowGap = desktopMode ? (isMainView ? 18 : 14) : (isMainView ? 18 : 14)
  const footerHeight = desktopMode ? 32 : 42
  const closeHeight = desktopMode ? (isMainView ? 52 : 56) : (isMainView ? 62 : 68)
  const closeWidth = desktopMode ? 250 : 320
  const listTop = dividerY + (desktopMode ? (isMainView ? 46 : 38) : (isMainView ? 52 : 46))
  const listBottom = panelY + panelHeight - (desktopMode ? 54 : 64)
  const closeGap = desktopMode ? 22 : 28
  const availableHeight = listBottom - listTop - closeHeight - footerHeight - closeGap - rowGap * Math.max(0, rowCount - 1)
  const minimumHeight = isMainView ? (desktopMode ? 88 : 112) : (desktopMode ? 56 : 76)
  const maximumHeight = isMainView ? (desktopMode ? 132 : 156) : (desktopMode ? 120 : 156)
  const rowHeight = Math.min(maximumHeight, Math.max(minimumHeight, Math.floor(availableHeight / Math.max(1, rowCount))))
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    x: rowX,
    y: listTop + index * (rowHeight + rowGap),
    width: rowWidth,
    height: rowHeight
  }))
  const closeButton = {
    x: panelX + (panelWidth - closeWidth) / 2,
    y: rows.length ? rows.at(-1).y + rowHeight + closeGap : listTop,
    width: closeWidth,
    height: closeHeight
  }
  const footerY = closeButton.y + closeButton.height + (desktopMode ? 24 : 30)

  return {
    panel: { x: panelX, y: panelY, width: panelWidth, height: panelHeight },
    view,
    dividerY,
    rows,
    closeButton,
    footerY
  }
}
