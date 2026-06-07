import { PALETTE, WORLD } from '../config.js'

export function drawHud(context, state, desktopMode) {
  const compactHud = window.matchMedia('(max-width: 380px)').matches
  const hudAlpha = !state.running ? 0.72 : 1
  const labelColor = !state.running ? 'rgba(196, 216, 234, 0.78)' : PALETTE.white
  const valueColor = !state.running ? 'rgba(226, 236, 246, 0.82)' : PALETTE.white

  context.save()
  context.globalAlpha = hudAlpha
  context.fillStyle = 'rgba(6, 10, 24, 0.28)'
  context.fillRect(24, 32, WORLD.width - 48, 124)

  const columns = [
    { label: 'SCORE', value: String(state.score).padStart(6, '0'), x: 44 },
    { label: 'WAVE', value: String(state.wave).padStart(2, '0'), x: compactHud ? 270 : 266 },
    { label: 'LIVES', value: String(state.player.lives), x: compactHud ? 500 : 506 }
  ]

  context.textAlign = 'left'
  context.font = compactHud ? '700 28px monospace' : '700 30px monospace'
  for (const column of columns) {
    context.fillStyle = labelColor
    context.fillText(column.label, column.x, 70)
  }

  context.font = compactHud ? '700 38px monospace' : '700 42px monospace'
  for (const column of columns) {
    context.fillStyle = column.label === 'LIVES' && !state.running ? 'rgba(255,106,122,0.96)' : valueColor
    context.fillText(column.value, column.x, 118)
  }
  context.restore()
}
