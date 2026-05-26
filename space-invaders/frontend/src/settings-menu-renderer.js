import { PALETTE, WORLD } from './config.js'
import { getSettingsMenuLayout } from './overlay-layout.js'

export class SettingsMenuRenderer {
  render(context, settingsMenu, desktopMode) {
    const view = settingsMenu?.view ?? 'main'
    const { panel, dividerY, rows, closeButton, footerY } = getSettingsMenuLayout(desktopMode, settingsMenu?.items?.length ?? 4, view)
    const isMainView = view === 'main'

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
    context.strokeStyle = 'rgba(0, 200, 255, 0.16)'
    context.shadowColor = 'rgba(0, 200, 255, 0.18)'
    context.shadowBlur = 22
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.72)'
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

    context.textAlign = 'center'
    const titleGlow = context.createRadialGradient(WORLD.width / 2, panel.y + 122, 24, WORLD.width / 2, panel.y + 122, 160)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 16
    context.font = desktopMode ? '900 52px "Arial Black", Impact, sans-serif' : '900 62px "Arial Black", Impact, sans-serif'
    context.fillText('SPACE', WORLD.width / 2, panel.y + (desktopMode ? 108 : 126))
    context.fillText('INVADERS', WORLD.width / 2, panel.y + (desktopMode ? 164 : 186))

    context.shadowBlur = 0
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panel.x + 54, dividerY)
    context.lineTo(panel.x + panel.width - 54, dividerY)
    context.stroke()

    context.fillStyle = PALETTE.cyan
    context.font = desktopMode ? '600 18px monospace' : '600 22px monospace'
    context.fillText(isMainView ? 'COMMAND CONSOLE' : 'CHANNEL FOCUS', WORLD.width / 2, panel.y + (desktopMode ? 248 : 282))

    context.fillStyle = PALETTE.white
    context.font = desktopMode ? '700 34px monospace' : '700 42px monospace'
    context.fillText((settingsMenu?.title ?? 'Settings').toUpperCase(), WORLD.width / 2, panel.y + (desktopMode ? 292 : 336))

    context.fillStyle = 'rgba(196, 240, 255, 0.68)'
    context.font = desktopMode ? '600 16px monospace' : '600 20px monospace'
    context.fillText((settingsMenu?.subtitle ?? 'Command Console').toUpperCase(), WORLD.width / 2, panel.y + (desktopMode ? 326 : 374))

    const titleFont = desktopMode ? (isMainView ? 34 : 18) : (isMainView ? 38 : 22)
    const valueFont = desktopMode ? (isMainView ? 22 : 30) : (isMainView ? 26 : 36)
    const footerFont = desktopMode ? 18 : 22
    const closeSelected = settingsMenu?.selectedIndex === settingsMenu?.items?.length

    context.textAlign = isMainView ? 'center' : 'left'
    settingsMenu?.items?.forEach((item, index) => {
      const row = rows[index]
      const selected = settingsMenu.selectedIndex === index
      context.save()
      context.beginPath()
      context.roundRect(row.x, row.y, row.width, row.height, desktopMode ? 18 : 22)
      const rowGradient = context.createLinearGradient(row.x, row.y, row.x, row.y + row.height)
      rowGradient.addColorStop(0, selected ? 'rgba(22, 54, 92, 0.92)' : 'rgba(10, 24, 44, 0.82)')
      rowGradient.addColorStop(1, selected ? 'rgba(10, 26, 48, 0.94)' : 'rgba(6, 16, 30, 0.8)')
      context.fillStyle = rowGradient
      context.fill()
      context.lineWidth = selected ? 3 : 2
      context.strokeStyle = selected ? 'rgba(140, 247, 255, 0.72)' : 'rgba(140, 247, 255, 0.18)'
      context.shadowColor = selected ? 'rgba(140, 247, 255, 0.24)' : 'transparent'
      context.shadowBlur = selected ? 24 : 0
      context.stroke()
      context.restore()

      if (isMainView) {
        context.fillStyle = selected ? 'rgba(140, 247, 255, 0.9)' : 'rgba(140, 247, 255, 0.62)'
        context.font = `700 ${desktopMode ? 14 : 18}px monospace`
        context.fillText((item.caption ?? 'System').toUpperCase(), row.x + row.width / 2, row.y + row.height * 0.28)

        context.fillStyle = selected ? PALETTE.white : 'rgba(238, 252, 255, 0.86)'
        context.font = `700 ${titleFont}px monospace`
        context.fillText(item.label.toUpperCase(), row.x + row.width / 2, row.y + row.height * 0.56)

        context.fillStyle = selected ? PALETTE.cyan : 'rgba(196, 240, 255, 0.78)'
        context.font = `600 ${valueFont}px monospace`
        context.fillText(item.valueLabel, row.x + row.width / 2, row.y + row.height * 0.8)
        return
      }

      context.fillStyle = selected ? 'rgba(140, 247, 255, 0.72)' : 'rgba(140, 247, 255, 0.46)'
      context.font = `700 ${titleFont}px monospace`
      context.fillText(item.label.toUpperCase(), row.x + (desktopMode ? 26 : 30), row.y + row.height * 0.34)

      context.fillStyle = selected ? PALETTE.white : 'rgba(238, 252, 255, 0.9)'
      context.font = `700 ${valueFont}px monospace`
      context.fillText(item.valueLabel, row.x + (desktopMode ? 26 : 30), row.y + row.height * 0.73)

      context.textAlign = 'right'
      context.fillStyle = selected ? 'rgba(140, 247, 255, 0.7)' : 'rgba(196, 240, 255, 0.42)'
      context.font = `600 ${desktopMode ? 14 : 18}px monospace`
      context.fillText('TAP TO CYCLE', row.x + row.width - (desktopMode ? 24 : 28), row.y + row.height * 0.57)
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

    context.fillStyle = 'rgba(196, 240, 255, 0.68)'
    context.font = `700 ${footerFont}px monospace`
    context.fillText(settingsMenu?.footerLabel ?? 'ARROWS MOVE  ENTER CHANGE  ESC CLOSE', WORLD.width / 2, footerY)
    context.textAlign = 'left'
  }
}