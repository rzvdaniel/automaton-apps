import { PALETTE, WORLD } from './config.js'
import { getSettingsMenuLayout } from './overlay-layout.js'

export class SettingsMenuRenderer {
  render(context, settingsMenu, desktopMode) {
    const view = settingsMenu?.view ?? 'main'
    const { panel, dividerY, rows, closeButton, footerY } = getSettingsMenuLayout(desktopMode, settingsMenu?.items?.length ?? 4, view)
    const isMainView = view === 'main'
    const categoryTitleFont = desktopMode ? 38 : 48
    const categorySummaryFont = desktopMode ? 20 : 26
    const detailLabelFont = desktopMode ? 16 : 22
    const detailValueFont = desktopMode ? 30 : 40
    const detailHintFont = desktopMode ? 12 : 16
    const footerLabel = settingsMenu?.footerLabel ?? (isMainView
      ? (desktopMode ? 'UP/DOWN SELECT   ENTER OPEN   ESC CLOSE' : 'TAP TO SELECT')
      : (desktopMode ? 'LEFT/RIGHT CHANGE   ESC BACK' : 'TAP TO CHANGE'))

    context.fillStyle = 'rgba(1, 4, 12, 0.42)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const panelGradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height)
    panelGradient.addColorStop(0, 'rgba(20, 60, 90, 0.88)')
    panelGradient.addColorStop(1, 'rgba(6, 18, 34, 0.82)')
    context.fillStyle = panelGradient
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.24,
      40,
      WORLD.width / 2,
      panel.y + panel.height * 0.24,
      panel.width * 0.6
    )
    panelGlow.addColorStop(0, 'rgba(140, 247, 255, 0.12)')
    panelGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.save()
    context.strokeStyle = 'rgba(70, 220, 255, 0.22)'
    context.shadowColor = 'rgba(70, 220, 255, 0.24)'
    context.shadowBlur = 24
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(150, 248, 255, 0.82)'
    context.shadowColor = 'rgba(140, 247, 255, 0.2)'
    context.shadowBlur = 10
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(panel.x + 18, panel.y + corner)
    context.lineTo(panel.x + 18, panel.y + 18)
    context.lineTo(panel.x + corner, panel.y + 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + corner)
    context.moveTo(panel.x + 18, panel.y + panel.height - corner)
    context.lineTo(panel.x + 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + corner, panel.y + panel.height - 18)
    context.moveTo(panel.x + panel.width - corner, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - 18)
    context.lineTo(panel.x + panel.width - 18, panel.y + panel.height - corner)
    context.stroke()
    context.shadowBlur = 0

    context.textAlign = 'center'
    const titleGlowCenterY = panel.y + (isMainView ? 182 : 122)
    const titleGlow = context.createRadialGradient(WORLD.width / 2, titleGlowCenterY, 24, WORLD.width / 2, titleGlowCenterY, 180)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.shadowBlur = 0
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panel.x + 54, dividerY)
    context.lineTo(panel.x + panel.width - 54, dividerY)
    context.stroke()

    if (isMainView) {
      context.fillStyle = PALETTE.white
      context.shadowColor = PALETTE.cyan
      context.shadowBlur = 18
      context.font = desktopMode ? '900 72px "Arial Black", Impact, sans-serif' : '900 94px "Arial Black", Impact, sans-serif'
      context.fillText((settingsMenu?.title ?? 'Settings').toUpperCase(), WORLD.width / 2, panel.y + (desktopMode ? 218 : 258))
      context.shadowBlur = 0
    } else {
      context.fillStyle = PALETTE.white
      context.font = desktopMode ? '700 48px monospace' : '700 64px monospace'
      context.fillText((settingsMenu?.title ?? 'Settings').toUpperCase(), WORLD.width / 2, panel.y + (desktopMode ? 254 : 300))
    }

    if (!isMainView) {
      context.fillStyle = 'rgba(196, 240, 255, 0.42)'
      context.font = desktopMode ? '600 16px monospace' : '600 20px monospace'
      context.fillText((settingsMenu?.subtitle ?? 'System Menu').toUpperCase(), WORLD.width / 2, panel.y + (desktopMode ? 300 : 354))
    }

    const footerFont = isMainView
      ? (desktopMode ? 20 : 30)
      : (desktopMode ? 18 : 24)
    const closeSelected = settingsMenu?.selectedIndex === settingsMenu?.items?.length

    context.textAlign = isMainView ? 'center' : 'left'
    settingsMenu?.items?.forEach((item, index) => {
      const row = rows[index]
      const selected = settingsMenu.selectedIndex === index
      context.save()
      context.beginPath()
      context.roundRect(row.x, row.y, row.width, row.height, desktopMode ? 18 : 22)
      const rowGradient = context.createLinearGradient(row.x, row.y, row.x, row.y + row.height)
      rowGradient.addColorStop(0, selected ? 'rgba(28, 72, 118, 0.94)' : 'rgba(10, 24, 44, 0.82)')
      rowGradient.addColorStop(1, selected ? 'rgba(10, 32, 58, 0.96)' : 'rgba(6, 16, 30, 0.8)')
      context.fillStyle = rowGradient
      context.fill()
      context.lineWidth = selected ? 3 : 2
      context.strokeStyle = selected ? 'rgba(150, 250, 255, 0.94)' : 'rgba(140, 247, 255, 0.18)'
      context.shadowColor = selected ? 'rgba(140, 247, 255, 0.34)' : 'transparent'
      context.shadowBlur = selected ? 28 : 0
      context.stroke()
      if (selected) {
        context.fillStyle = 'rgba(140, 247, 255, 0.06)'
        context.fill()
      }
      context.restore()

      if (isMainView) {
        context.fillStyle = selected ? PALETTE.white : 'rgba(238, 252, 255, 0.86)'
        context.font = `700 ${categoryTitleFont}px monospace`
        context.fillText(item.label.toUpperCase(), row.x + row.width / 2, row.y + row.height * 0.46)

        context.fillStyle = selected ? PALETTE.cyan : 'rgba(196, 240, 255, 0.78)'
        context.font = `600 ${categorySummaryFont}px monospace`
        context.fillText(item.valueLabel, row.x + row.width / 2, row.y + row.height * 0.72)
        return
      }

      context.fillStyle = selected ? 'rgba(140, 247, 255, 0.62)' : 'rgba(140, 247, 255, 0.38)'
      context.font = `700 ${detailLabelFont}px monospace`
      context.fillText(item.label.toUpperCase(), row.x + (desktopMode ? 26 : 30), row.y + row.height * 0.31)

      context.fillStyle = selected ? PALETTE.white : 'rgba(238, 252, 255, 0.9)'
      context.font = `700 ${detailValueFont}px monospace`
      context.fillText(item.valueLabel, row.x + (desktopMode ? 26 : 30), row.y + row.height * 0.73)

      context.textAlign = 'right'
      context.fillStyle = selected ? 'rgba(140, 247, 255, 0.46)' : 'rgba(196, 240, 255, 0.28)'
      context.font = `600 ${detailHintFont}px monospace`
      context.fillText('TAP TO CYCLE', row.x + row.width - (desktopMode ? 24 : 28), row.y + row.height * 0.55)
      context.textAlign = 'left'
    })

    context.save()
    context.beginPath()
    context.roundRect(closeButton.x, closeButton.y, closeButton.width, closeButton.height, desktopMode ? 18 : 22)
    context.fillStyle = closeSelected ? 'rgba(255, 112, 122, 0.2)' : 'rgba(7, 18, 34, 0.68)'
    context.fill()
    context.lineWidth = closeSelected ? 3 : 2
    context.strokeStyle = closeSelected ? 'rgba(255, 130, 142, 0.8)' : 'rgba(255, 130, 142, 0.24)'
    context.stroke()
    context.restore()

    context.textAlign = 'center'
    context.fillStyle = closeSelected ? 'rgba(255, 214, 220, 0.98)' : 'rgba(255, 214, 220, 0.86)'
    context.font = `700 ${desktopMode ? 24 : 30}px monospace`
    context.fillText(settingsMenu?.closeLabel ?? 'Back', closeButton.x + closeButton.width / 2, closeButton.y + closeButton.height * 0.63)

    context.fillStyle = 'rgba(196, 240, 255, 0.58)'
    context.font = `700 ${footerFont}px monospace`
    context.fillText(footerLabel, WORLD.width / 2, footerY)
    context.textAlign = 'left'
  }
}