import { PALETTE, WORLD } from '../config.js'
import { SettingsMenuRenderer } from '../settings-menu-renderer.js'

const settingsMenuRenderer = new SettingsMenuRenderer()

export function drawOverlay(context, state, desktopMode) {
  const settingsOpen = state.settingsOpen
  const formationLockOverlay = !settingsOpen && state.started && state.running && !state.paused && state.waveLockTimer > 0
  if (state.started && state.running && state.overlayTimer <= 0 && !state.paused && !formationLockOverlay) return
  const pausedMenu = !settingsOpen && state.paused && state.running
  const gameOverOverlay = !settingsOpen && state.started && !state.running && !state.paused
  const titleOverlay = !settingsOpen && !state.started
  const intermissionOverlay = !settingsOpen && state.started && state.running && !state.paused && state.overlayTimer > 0

  if (settingsOpen) {
    settingsMenuRenderer.render(context, state.settingsMenu, desktopMode)
    return
  }

  if (titleOverlay || pausedMenu) return

  if (gameOverOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.42)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (!intermissionOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.28)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  if (gameOverOverlay) {
    const panelWidth = desktopMode ? WORLD.width - 420 : WORLD.width - 300
    const panelHeight = desktopMode ? 348 : 404
    const panelX = (WORLD.width - panelWidth) / 2
    const panelY = (desktopMode ? 604 : 706) + Math.round(state.composition.overlayShiftWorld * 0.55)
    const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
    panelGradient.addColorStop(0, 'rgba(8, 16, 30, 0.82)')
    panelGradient.addColorStop(1, 'rgba(4, 8, 18, 0.92)')
    context.fillStyle = panelGradient
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    context.strokeStyle = 'rgba(255, 106, 122, 0.24)'
    context.lineWidth = 2
    context.strokeRect(panelX, panelY, panelWidth, panelHeight)

    context.textAlign = 'center'
    context.fillStyle = 'rgba(255, 160, 174, 0.92)'
    context.font = desktopMode ? '700 22px monospace' : '700 28px monospace'
    context.fillText('SIGNAL LOST', WORLD.width / 2, panelY + (desktopMode ? 56 : 68))

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.red
    context.shadowBlur = 18
    context.font = desktopMode ? '900 58px "Arial Black", Impact, sans-serif' : '900 72px "Arial Black", Impact, sans-serif'
    context.fillText('GAME OVER', WORLD.width / 2, panelY + (desktopMode ? 132 : 156))
    context.shadowBlur = 0

    context.strokeStyle = 'rgba(255, 130, 142, 0.2)'
    context.beginPath()
    context.moveTo(panelX + 62, panelY + (desktopMode ? 172 : 196))
    context.lineTo(panelX + panelWidth - 62, panelY + (desktopMode ? 172 : 196))
    context.stroke()

    context.fillStyle = 'rgba(238,252,255,0.78)'
    context.font = desktopMode ? '600 22px monospace' : '600 28px monospace'
    context.fillText(`WAVE ${String(state.wave).padStart(2, '0')}   SCORE ${String(state.score).padStart(6, '0')}`, WORLD.width / 2, panelY + (desktopMode ? 224 : 258))
    context.fillStyle = 'rgba(255, 180, 190, 0.86)'
    context.font = desktopMode ? '600 18px monospace' : '600 24px monospace'
    context.fillText('PILOT OFFLINE   SHIP DESTROYED', WORLD.width / 2, panelY + (desktopMode ? 266 : 306))

    context.fillStyle = 'rgba(255,255,255,0.9)'
    context.font = desktopMode ? '700 22px monospace' : '700 28px monospace'
    context.fillText(desktopMode ? 'PRESS FIRE TO RETRY' : 'TAP FIRE TO RETRY', WORLD.width / 2, panelY + (desktopMode ? 304 : 352))
    context.textAlign = 'left'
    return
  }

  if (intermissionOverlay) {
    const transitionPulse = 0.68 + ((Math.sin(state.elapsed * 4.2) + 1) / 2) * 0.22
    const incomingWave = state.intermission?.toWave ?? state.wave
    const clearedWave = state.intermission?.fromWave
    const fadeWindow = 0.22
    const fadeProgress = Math.min(1, state.overlayTimer / fadeWindow)
    const fadeAlpha = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)

    context.save()
    context.globalAlpha = fadeAlpha
    context.textAlign = 'center'

    const softGlow = context.createRadialGradient(WORLD.width / 2, 720, 40, WORLD.width / 2, 720, desktopMode ? 260 : 320)
    softGlow.addColorStop(0, `rgba(120, 220, 255, ${transitionPulse * 0.14})`)
    softGlow.addColorStop(1, 'rgba(120, 220, 255, 0)')
    context.fillStyle = softGlow
    context.fillRect(120, 470, WORLD.width - 240, 480)

    context.fillStyle = `rgba(140,247,255,${transitionPulse})`
    context.font = desktopMode ? '700 22px monospace' : '700 34px monospace'
    context.fillText(clearedWave ? 'SECTOR CLEARED' : 'HOSTILE FLEET DETECTED', WORLD.width / 2, desktopMode ? 618 : 670)

    context.strokeStyle = `rgba(140, 247, 255, ${0.12 + transitionPulse * 0.18})`
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(184, desktopMode ? 648 : 704)
    context.lineTo(WORLD.width - 184, desktopMode ? 648 : 704)
    context.stroke()

    context.fillStyle = PALETTE.white
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 18
    context.font = desktopMode ? '900 60px "Arial Black", Impact, sans-serif' : '900 84px "Arial Black", Impact, sans-serif'
    context.fillText(`WAVE ${String(incomingWave).padStart(2, '0')}`, WORLD.width / 2, desktopMode ? 720 : 790)
    context.shadowBlur = 0

    context.fillStyle = 'rgba(238,252,255,0.76)'
    context.font = desktopMode ? '600 20px monospace' : '600 30px monospace'
    context.fillText(`LEVEL ${state.level}   ${state.levelDefinition?.name ?? 'UNKNOWN SECTOR'}`, WORLD.width / 2, desktopMode ? 766 : 850)
    context.restore()
    context.textAlign = 'left'
  }
}
