import { PALETTE, WORLD } from '../config.js'
import { getPauseMenuLayout } from '../overlay-layout.js'
import { SettingsMenuRenderer } from '../settings-menu-renderer.js'

const settingsMenuRenderer = new SettingsMenuRenderer()

export function drawOverlay(context, state, desktopMode) {
  const settingsOpen = state.settingsOpen
  const formationLockOverlay = !settingsOpen && state.started && state.running && !state.paused && state.waveLockTimer > 0
  if (state.started && state.running && state.overlayTimer <= 0 && !state.paused && !formationLockOverlay) return
  const pausedMenu = !settingsOpen && state.paused && state.running
  const mobilePauseMenu = !desktopMode && pausedMenu
  const gameOverOverlay = !settingsOpen && state.started && !state.running && !state.paused
  const titleOverlay = !settingsOpen && !state.started
  const intermissionOverlay = !settingsOpen && state.started && state.running && !state.paused && state.overlayTimer > 0

  if (settingsOpen) {
    settingsMenuRenderer.render(context, state.settingsMenu, desktopMode)
    return
  }

  if (pausedMenu) {
    context.fillStyle = 'rgba(1, 4, 12, 0.44)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)

    const pauseFocus = context.createRadialGradient(WORLD.width / 2, 820, 140, WORLD.width / 2, 820, 760)
    pauseFocus.addColorStop(0, 'rgba(4, 12, 24, 0.04)')
    pauseFocus.addColorStop(0.4, 'rgba(4, 12, 24, 0.16)')
    pauseFocus.addColorStop(1, 'rgba(1, 4, 12, 0.32)')
    context.fillStyle = pauseFocus
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (gameOverOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.42)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  } else if (!titleOverlay && !intermissionOverlay) {
    context.fillStyle = 'rgba(1, 4, 12, 0.28)'
    context.fillRect(0, 0, WORLD.width, WORLD.height)
  }

  if (pausedMenu) {
    const layout = getPauseMenuLayout(desktopMode, state.composition.pauseShiftWorld)
    const { panel, labelY, actions } = layout
    context.fillStyle = 'rgba(3, 10, 20, 0.36)'
    context.fillRect(panel.x - 30, panel.y - 34, panel.width + 60, panel.height + 68)

    const panelGradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height)
    panelGradient.addColorStop(0, 'rgba(18, 42, 62, 0.34)')
    panelGradient.addColorStop(1, 'rgba(6, 16, 30, 0.28)')
    context.fillStyle = panelGradient
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.45,
      panel.width * 0.08,
      WORLD.width / 2,
      panel.y + panel.height * 0.45,
      panel.width * 0.72
    )
    panelGlow.addColorStop(0, 'rgba(120, 220, 255, 0.06)')
    panelGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    const glow = context.createRadialGradient(
      WORLD.width / 2,
      panel.y + panel.height * 0.35,
      40,
      WORLD.width / 2,
      panel.y + panel.height * 0.35,
      panel.width * 0.62
    )
    glow.addColorStop(0, 'rgba(140, 247, 255, 0.08)')
    glow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = glow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.save()
    context.strokeStyle = 'rgba(120, 220, 255, 0.18)'
    context.shadowColor = 'rgba(120, 220, 255, 0.18)'
    context.shadowBlur = 18
    context.lineWidth = 1
    context.strokeRect(panel.x + 10, panel.y + 10, panel.width - 20, panel.height - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.68)'
    context.lineWidth = 2
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
    const titleGlow = context.createRadialGradient(WORLD.width / 2, labelY - (desktopMode ? 18 : 24), 24, WORLD.width / 2, labelY - (desktopMode ? 18 : 24), 140)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panel.x, panel.y, panel.width, panel.height)

    context.fillStyle = 'rgba(232, 248, 255, 0.96)'
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 14
    context.font = desktopMode ? '900 72px "Arial Black", Impact, sans-serif' : '900 86px "Arial Black", Impact, sans-serif'
    context.letterSpacing = '0.08em'
    context.fillText('PAUSED', WORLD.width / 2, labelY)
    context.letterSpacing = '0'

    context.shadowBlur = 0
    context.font = desktopMode ? '700 32px monospace' : '700 38px monospace'
    for (const action of actions) {
      const buttonGradient = context.createLinearGradient(action.x, action.y, action.x, action.y + action.height)
      buttonGradient.addColorStop(0, 'rgba(18, 40, 62, 0.78)')
      buttonGradient.addColorStop(0.18, 'rgba(32, 76, 114, 0.34)')
      buttonGradient.addColorStop(1, 'rgba(5, 10, 20, 0.58)')
      context.fillStyle = buttonGradient
      context.fillRect(action.x, action.y, action.width, action.height)
      context.strokeStyle = 'rgba(214, 248, 255, 0.18)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(action.x + 12, action.y + 10)
      context.lineTo(action.x + action.width - 12, action.y + 10)
      context.stroke()
      context.strokeStyle = 'rgba(140, 247, 255, 0.3)'
      context.lineWidth = 1.5
      context.strokeRect(action.x, action.y, action.width, action.height)
      context.shadowColor = 'rgba(120, 220, 255, 0.12)'
      context.shadowBlur = 10
      context.fillStyle = 'rgba(238,252,255,0.92)'
      context.fillText(action.label, WORLD.width / 2, action.y + action.height / 2 + (desktopMode ? 8 : 10))
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(4, 10, 22, 0.42)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(action.x + 12, action.y + action.height - 9)
      context.lineTo(action.x + action.width - 12, action.y + action.height - 9)
      context.stroke()
    }
    context.textAlign = 'left'
    return
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
    context.fillText(`WAVE ${String(incomingWave).padStart(2, '0')}`, WORLD.width / 2, desktopMode ? 728 : 794)
    context.shadowBlur = 0

    context.fillStyle = 'rgba(238,252,255,0.82)'
    context.font = desktopMode ? '600 20px monospace' : '600 30px monospace'
    context.fillText(clearedWave ? `WAVE ${String(clearedWave).padStart(2, '0')} COMPLETE` : 'TACTICAL SYSTEMS ONLINE', WORLD.width / 2, desktopMode ? 780 : 854)

    context.fillStyle = 'rgba(255, 196, 144, 0.86)'
    context.font = desktopMode ? '600 18px monospace' : '600 28px monospace'
    context.fillText('INCOMING HOSTILE FLEET', WORLD.width / 2, desktopMode ? 822 : 902)
    context.textAlign = 'left'
    context.restore()
    return
  }

  if (formationLockOverlay) {
    const lockProgress = state.waveLockDuration > 0 ? state.waveLockTimer / state.waveLockDuration : 0
    const lockAlpha = Math.min(1, 0.45 + lockProgress * 0.55)

    context.save()
    context.globalAlpha = lockAlpha
    context.textAlign = 'center'

    const lockGlow = context.createRadialGradient(WORLD.width / 2, desktopMode ? 742 : 812, 16, WORLD.width / 2, desktopMode ? 742 : 812, desktopMode ? 180 : 220)
    lockGlow.addColorStop(0, 'rgba(140, 247, 255, 0.12)')
    lockGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = lockGlow
    context.fillRect(220, desktopMode ? 660 : 724, WORLD.width - 440, 180)

    context.strokeStyle = `rgba(140, 247, 255, ${0.18 + lockProgress * 0.12})`
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(300, desktopMode ? 706 : 772)
    context.lineTo(WORLD.width - 300, desktopMode ? 706 : 772)
    context.stroke()

    context.fillStyle = `rgba(238,252,255,${0.82 + lockProgress * 0.1})`
    context.shadowColor = PALETTE.cyan
    context.shadowBlur = 12
    context.font = desktopMode ? '700 20px monospace' : '700 28px monospace'
    context.fillText('FORMATION LOCKED', WORLD.width / 2, desktopMode ? 748 : 818)
    context.shadowBlur = 0
    context.textAlign = 'left'
    context.restore()
    return
  }

  const titleShiftY = titleOverlay ? state.composition.overlayShiftWorld : 0
  const panelWidth = titleOverlay ? (desktopMode ? WORLD.width - 260 : WORLD.width - 260) : WORLD.width - 160
  const panelX = (WORLD.width - panelWidth) / 2
  const panelY = titleOverlay ? (desktopMode ? 318 : 350) + titleShiftY : 276
  const panelHeight = titleOverlay ? (desktopMode ? 500 : 488) : desktopMode ? 660 : 710
  const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
  panelGradient.addColorStop(0, titleOverlay ? 'rgba(28, 78, 108, 0.2)' : 'rgba(4, 10, 22, 0.82)')
  panelGradient.addColorStop(1, titleOverlay ? 'rgba(10, 30, 50, 0.12)' : 'rgba(2, 6, 16, 0.72)')
  context.fillStyle = panelGradient
  context.fillRect(panelX, panelY, panelWidth, panelHeight)

  if (titleOverlay) {
    const panelGlow = context.createRadialGradient(
      WORLD.width / 2,
      panelY + panelHeight * 0.45,
      panelWidth * 0.08,
      WORLD.width / 2,
      panelY + panelHeight * 0.45,
      panelWidth * 0.72
    )
    panelGlow.addColorStop(0, 'rgba(120, 220, 255, 0.08)')
    panelGlow.addColorStop(1, 'rgba(120, 220, 255, 0)')
    context.fillStyle = panelGlow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    const glow = context.createRadialGradient(
      WORLD.width / 2,
      panelY + panelHeight * 0.35,
      40,
      WORLD.width / 2,
      panelY + panelHeight * 0.35,
      panelWidth * 0.62
    )
    glow.addColorStop(0, 'rgba(140, 247, 255, 0.1)')
    glow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = glow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)

    context.save()
    context.strokeStyle = 'rgba(0, 200, 255, 0.16)'
    context.shadowColor = 'rgba(0, 200, 255, 0.18)'
    context.shadowBlur = 22
    context.lineWidth = 1
    context.strokeRect(panelX + 10, panelY + 10, panelWidth - 20, panelHeight - 20)
    context.restore()

    const corner = 34
    context.strokeStyle = 'rgba(140, 247, 255, 0.72)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(panelX + 18, panelY + corner)
    context.lineTo(panelX + 18, panelY + 18)
    context.lineTo(panelX + corner, panelY + 18)
    context.moveTo(panelX + panelWidth - corner, panelY + 18)
    context.lineTo(panelX + panelWidth - 18, panelY + 18)
    context.lineTo(panelX + panelWidth - 18, panelY + corner)
    context.moveTo(panelX + 18, panelY + panelHeight - corner)
    context.lineTo(panelX + 18, panelY + panelHeight - 18)
    context.lineTo(panelX + corner, panelY + panelHeight - 18)
    context.moveTo(panelX + panelWidth - corner, panelY + panelHeight - 18)
    context.lineTo(panelX + panelWidth - 18, panelY + panelHeight - 18)
    context.lineTo(panelX + panelWidth - 18, panelY + panelHeight - corner)
    context.stroke()
  } else {
    context.strokeStyle = 'rgba(140, 247, 255, 0.1)'
    context.lineWidth = 2
    context.strokeRect(panelX, panelY, panelWidth, panelHeight)
  }

  context.textAlign = 'center'
  context.shadowColor = PALETTE.cyan
  context.shadowBlur = mobilePauseMenu ? 8 : 18
  context.fillStyle = mobilePauseMenu ? 'rgba(238,252,255,0.28)' : PALETTE.white
  if (titleOverlay) {
    const titleGlowY = (desktopMode ? 428 : 452) + titleShiftY
    const titleGlow = context.createRadialGradient(WORLD.width / 2, titleGlowY, 24, WORLD.width / 2, titleGlowY, 140)
    titleGlow.addColorStop(0, 'rgba(120, 220, 255, 0.1)')
    titleGlow.addColorStop(1, 'rgba(140, 247, 255, 0)')
    context.fillStyle = titleGlow
    context.fillRect(panelX, panelY, panelWidth, panelHeight)
    context.fillStyle = mobilePauseMenu ? 'rgba(238,252,255,0.28)' : PALETTE.white
  }
  context.font = desktopMode ? '900 76px "Arial Black", Impact, sans-serif' : '900 88px "Arial Black", Impact, sans-serif'
  context.fillText('SPACE', WORLD.width / 2, (desktopMode ? 446 : 472) + titleShiftY)
  context.fillText('INVADERS', WORLD.width / 2, (desktopMode ? 528 : 554) + titleShiftY)
  if (titleOverlay) {
    context.strokeStyle = 'rgba(140, 247, 255, 0.18)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(panelX + 54, (desktopMode ? 582 : 608) + titleShiftY)
    context.lineTo(panelX + panelWidth - 54, (desktopMode ? 582 : 608) + titleShiftY)
    context.stroke()
  }
  context.shadowBlur = 0
  context.fillStyle = PALETTE.cyan
  if (!mobilePauseMenu) {
    const insertCoinPulse = titleOverlay ? 0.72 + ((Math.sin(state.elapsed * 4.6) + 1) / 2) * 0.28 : 1
    context.fillStyle = titleOverlay ? `rgba(140,247,255,${insertCoinPulse})` : PALETTE.cyan
    context.font = desktopMode ? '600 32px monospace' : '600 42px monospace'
    const headline = state.paused ? 'PAUSED' : state.message
    context.fillText(headline, WORLD.width / 2, titleOverlay ? (desktopMode ? 642 : 678) + titleShiftY : desktopMode ? 690 : 700)
  }
  if (!mobilePauseMenu && (!desktopMode || state.settings.keyboardHint)) {
    context.fillStyle = 'rgba(238,252,255,0.82)'
    if (desktopMode) {
      context.font = '500 24px monospace'
      context.fillText('ARROWS / A D MOVE   SPACE / ENTER FIRE   P PAUSE   M MUTE', WORLD.width / 2, 770 + titleShiftY)
    } else {
      context.font = titleOverlay ? '700 40px monospace' : '700 34px monospace'
      context.fillText('◀  ▶ MOVE', WORLD.width / 2, titleOverlay ? 760 + titleShiftY : 760)
      context.fillText('TAP FIRE', WORLD.width / 2, titleOverlay ? 812 + titleShiftY : 804)
    }
  }
  if (!mobilePauseMenu && !state.running) {
    context.font = desktopMode ? '500 24px monospace' : '700 28px monospace'
    context.fillText('PRESS FIRE TO RESTART', WORLD.width / 2, (desktopMode ? 822 : 856) + Math.round(state.composition.overlayShiftWorld * 0.45))
  }
  context.textAlign = 'left'
}
