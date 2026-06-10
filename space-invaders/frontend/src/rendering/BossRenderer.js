import { WORLD } from '../config.js'

export class BossRenderer {
  draw(context, boss, bossSprite, elapsed, settings) {
    if (!boss?.active) return

    const wobble = settings.reducedMotion ? 0 : Math.sin(elapsed * 2.8 + boss.hoverPhase) * 4
    const x = boss.x
    const y = boss.y + wobble
    const reactorPulse = 0.55 + ((Math.sin(boss.reactorPulse * 6.2) + 1) / 2) * 0.45 + (boss.coreCharge ?? 0) * 0.4
    const sprite = bossSprite ?? null
    const width = boss.width
    const height = width * (sprite?.naturalWidth > 0 ? sprite.naturalHeight / sprite.naturalWidth : boss.height / Math.max(1, boss.width))

    this._drawBeam(context, boss, elapsed)

    context.save()
    context.translate(x, y)

    const halo = context.createRadialGradient(0, 0, width * 0.08, 0, 0, width * 0.55)
    halo.addColorStop(0, 'rgba(0, 0, 0, 0.18)')
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = halo
    context.beginPath()
    context.ellipse(0, height * 0.05, width * 0.48, height * 0.72, 0, 0, Math.PI * 2)
    context.fill()

    if (sprite?.complete && sprite.naturalWidth > 0) {
      context.drawImage(sprite, -width / 2, -height / 2, width, height)
    } else {
      context.fillStyle = '#132336'
      context.fillRect(-width / 2, -height / 2, width, height)
    }

    context.globalCompositeOperation = 'screen'
    const coreRadius = width * (0.12 + reactorPulse * 0.04)
    const coreGlow = context.createRadialGradient(0, 0, width * 0.03, 0, 0, coreRadius)
    coreGlow.addColorStop(0, `rgba(244, 255, 230, ${0.34 + reactorPulse * 0.26})`)
    coreGlow.addColorStop(0.28, `rgba(170, 255, 120, ${0.26 + reactorPulse * 0.2})`)
    coreGlow.addColorStop(0.56, `rgba(80, 255, 130, ${0.12 + reactorPulse * 0.14})`)
    coreGlow.addColorStop(1, 'rgba(80, 255, 130, 0)')
    context.fillStyle = coreGlow
    context.beginPath()
    context.arc(0, 0, coreRadius, 0, Math.PI * 2)
    context.fill()

    if (boss.coreCharge > 0.35) {
      const chargeRadius = width * (0.08 + boss.coreCharge * 0.08)
      const chargeGlow = context.createRadialGradient(0, 0, width * 0.02, 0, 0, chargeRadius)
      chargeGlow.addColorStop(0, `rgba(255, 255, 255, ${0.2 + boss.coreCharge * 0.28})`)
      chargeGlow.addColorStop(0.34, `rgba(165, 255, 100, ${0.16 + boss.coreCharge * 0.18})`)
      chargeGlow.addColorStop(1, 'rgba(80, 255, 130, 0)')
      context.fillStyle = chargeGlow
      context.beginPath()
      context.arc(0, 0, chargeRadius, 0, Math.PI * 2)
      context.fill()
    }

    context.restore()
    this._drawHealthBar(context, boss)
  }

  _drawBeam(context, boss, elapsed) {
    const beamTop = boss.beamStartY
    const beamHeight = WORLD.height - beamTop
    if (boss.beamWarning > 0) {
      const progress = 1 - boss.beamWarning / Math.max(0.001, boss.beamWarningDuration ?? 1)
      const flicker = 0.45 + ((Math.sin(elapsed * 24) + 1) / 2) * 0.55
      const warningWidth = 8 + progress * 18

      context.save()
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = 0.22 + progress * 0.36

      const warningGlow = context.createLinearGradient(boss.beamX, beamTop, boss.beamX, WORLD.height)
      warningGlow.addColorStop(0, `rgba(180, 255, 120, ${0.18 * flicker})`)
      warningGlow.addColorStop(0.55, `rgba(80, 255, 120, ${0.3 * flicker})`)
      warningGlow.addColorStop(1, `rgba(180, 255, 120, ${0.22 * flicker})`)
      context.fillStyle = warningGlow
      context.fillRect(boss.beamX - warningWidth / 2, beamTop, warningWidth, beamHeight)

      context.globalAlpha = 0.68 + progress * 0.22
      context.fillStyle = 'rgba(236, 255, 220, 0.82)'
      context.fillRect(boss.beamX - 1.5, beamTop, 3, beamHeight)

      const targetGlow = context.createRadialGradient(boss.beamX, WORLD.height - 56, 8, boss.beamX, WORLD.height - 56, 68 + progress * 34)
      targetGlow.addColorStop(0, `rgba(240, 255, 230, ${0.35 * flicker})`)
      targetGlow.addColorStop(0.38, `rgba(140, 255, 90, ${0.26 * flicker})`)
      targetGlow.addColorStop(1, 'rgba(80, 255, 120, 0)')
      context.fillStyle = targetGlow
      context.beginPath()
      context.arc(boss.beamX, WORLD.height - 56, 68 + progress * 34, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    if (boss.beamActive > 0) {
      const progress = boss.beamActive / Math.max(0.001, boss.beamFireDuration ?? 0.62)
      const flicker = 0.78 + ((Math.sin(elapsed * 38) + 1) / 2) * 0.22
      const outerWidth = 48 + progress * 18
      const midWidth = 24 + progress * 8
      const coreWidth = 8 + progress * 4

      context.save()
      context.globalCompositeOperation = 'screen'

      const outerGradient = context.createLinearGradient(boss.beamX, beamTop, boss.beamX, WORLD.height)
      outerGradient.addColorStop(0, `rgba(118, 255, 76, ${0.3 * flicker})`)
      outerGradient.addColorStop(0.48, `rgba(50, 255, 120, ${0.42 * flicker})`)
      outerGradient.addColorStop(1, `rgba(170, 255, 95, ${0.34 * flicker})`)
      context.fillStyle = outerGradient
      context.fillRect(boss.beamX - outerWidth / 2, beamTop, outerWidth, beamHeight)

      context.fillStyle = `rgba(142, 255, 94, ${0.5 * flicker})`
      context.fillRect(boss.beamX - midWidth / 2, beamTop, midWidth, beamHeight)

      context.fillStyle = `rgba(248, 255, 238, ${0.9 * flicker})`
      context.fillRect(boss.beamX - coreWidth / 2, beamTop, coreWidth, beamHeight)

      for (let i = 0; i < 7; i += 1) {
        const offset = Math.sin(elapsed * 9 + i * 1.7) * (outerWidth * 0.34)
        context.globalAlpha = 0.16
        context.fillStyle = i % 2 === 0 ? 'rgba(210, 255, 160, 0.8)' : 'rgba(70, 255, 130, 0.8)'
        context.fillRect(boss.beamX + offset - 1, beamTop, 2, beamHeight)
      }
      context.globalAlpha = 1

      const impactGlow = context.createRadialGradient(boss.beamX, WORLD.height - 46, 10, boss.beamX, WORLD.height - 46, 120)
      impactGlow.addColorStop(0, 'rgba(255, 255, 245, 0.96)')
      impactGlow.addColorStop(0.22, 'rgba(190, 255, 92, 0.74)')
      impactGlow.addColorStop(0.52, 'rgba(80, 255, 130, 0.36)')
      impactGlow.addColorStop(1, 'rgba(80, 255, 130, 0)')
      context.fillStyle = impactGlow
      context.beginPath()
      context.arc(boss.beamX, WORLD.height - 46, 120, 0, Math.PI * 2)
      context.fill()

      context.strokeStyle = 'rgba(220, 255, 180, 0.8)'
      context.lineWidth = 2
      context.beginPath()
      context.ellipse(boss.beamX, WORLD.height - 42, 72, 16, 0, 0, Math.PI * 2)
      context.stroke()
      context.restore()
    }
  }

  _drawHealthBar(context, boss) {
    const barWidth = Math.min(440, WORLD.width * 0.44)
    const barHeight = 12
    const barX = (WORLD.width - barWidth) / 2
    const barY = 148
    const hpRatio = Math.max(0, boss.hp / Math.max(1, boss.maxHp))

    context.save()
    context.fillStyle = 'rgba(3, 10, 20, 0.62)'
    context.fillRect(barX, barY, barWidth, barHeight)
    context.strokeStyle = 'rgba(238, 252, 255, 0.2)'
    context.lineWidth = 1.5
    context.strokeRect(barX, barY, barWidth, barHeight)
    const hpGradient = context.createLinearGradient(barX, 0, barX + barWidth, 0)
    hpGradient.addColorStop(0, '#ff7ad3')
    hpGradient.addColorStop(1, '#a1ff91')
    context.fillStyle = hpGradient
    context.fillRect(barX + 2, barY + 2, (barWidth - 4) * hpRatio, barHeight - 4)
    context.fillStyle = 'rgba(238,252,255,0.92)'
    context.font = '700 18px monospace'
    context.textAlign = 'center'
    context.fillText('MOTHERSHIP', WORLD.width / 2, barY - 12)
    context.textAlign = 'left'
    context.restore()
  }
}
