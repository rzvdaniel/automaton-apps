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

  _fillConicalBeam(context, x, top, bottom, topWidth, bottomWidth, fillStyle) {
    context.fillStyle = fillStyle
    context.beginPath()
    context.moveTo(x - topWidth / 2, top)
    context.lineTo(x + topWidth / 2, top)
    context.lineTo(x + bottomWidth / 2, bottom)
    context.lineTo(x - bottomWidth / 2, bottom)
    context.closePath()
    context.fill()
  }

  _drawGlowStack(context, boss, beamTop, beamBottom, layers) {
    for (const layer of layers) {
      const gradient = context.createLinearGradient(boss.beamX, beamTop, boss.beamX, beamBottom)
      gradient.addColorStop(0, layer.top)
      gradient.addColorStop(0.46, layer.mid)
      gradient.addColorStop(1, layer.bottom)
      this._fillConicalBeam(context, boss.beamX, beamTop, beamBottom, layer.topWidth, layer.bottomWidth, gradient)
    }
  }

  _drawBeam(context, boss, elapsed) {
    const beamTop = boss.beamStartY
    const beamBottom = WORLD.height
    const beamHeight = beamBottom - beamTop
    if (boss.beamWarning > 0) {
      const progress = 1 - boss.beamWarning / Math.max(0.001, boss.beamWarningDuration ?? 1)
      const flicker = 0.45 + ((Math.sin(elapsed * 24) + 1) / 2) * 0.55
      const glow = 0.55 + progress * 0.45
      const warningTopWidth = 16 + progress * 28
      const warningBottomWidth = warningTopWidth * 1.26

      context.save()
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = 0.2 + progress * 0.42
      this._drawGlowStack(context, boss, beamTop, beamBottom, [
        {
          topWidth: warningTopWidth * 2.2,
          bottomWidth: warningBottomWidth * 2.6,
          top: `rgba(120, 255, 90, ${0.07 * glow * flicker})`,
          mid: `rgba(60, 255, 120, ${0.12 * glow * flicker})`,
          bottom: `rgba(120, 255, 90, ${0.08 * glow * flicker})`
        },
        {
          topWidth: warningTopWidth * 1.35,
          bottomWidth: warningBottomWidth * 1.55,
          top: `rgba(160, 255, 105, ${0.12 * glow * flicker})`,
          mid: `rgba(92, 255, 120, ${0.18 * glow * flicker})`,
          bottom: `rgba(170, 255, 108, ${0.13 * glow * flicker})`
        },
        {
          topWidth: warningTopWidth,
          bottomWidth: warningBottomWidth,
          top: `rgba(210, 255, 170, ${0.14 * glow * flicker})`,
          mid: `rgba(132, 255, 120, ${0.24 * glow * flicker})`,
          bottom: `rgba(210, 255, 170, ${0.16 * glow * flicker})`
        }
      ])

      context.globalAlpha = 0.58 + progress * 0.25
      this._fillConicalBeam(context, boss.beamX, beamTop, beamBottom, 4, 7, 'rgba(238, 255, 226, 0.74)')
      context.restore()
    }

    if (boss.beamActive > 0) {
      const age = 1 - boss.beamActive / Math.max(0.001, boss.beamFireDuration ?? 0.72)
      const growth = Math.min(1, age / 0.42)
      const flicker = 0.78 + ((Math.sin(elapsed * 38) + 1) / 2) * 0.22
      const outerTopWidth = 70 + growth * 34
      const outerBottomWidth = outerTopWidth * 1.26
      const midTopWidth = 42 + growth * 16
      const midBottomWidth = midTopWidth * 1.24
      const innerTopWidth = 24 + growth * 10
      const innerBottomWidth = innerTopWidth * 1.22
      const coreTopWidth = 12 + growth * 6
      const coreBottomWidth = coreTopWidth * 1.2

      context.save()
      context.globalCompositeOperation = 'screen'

      this._drawGlowStack(context, boss, beamTop, beamBottom, [
        {
          topWidth: outerTopWidth * 1.45,
          bottomWidth: outerBottomWidth * 1.55,
          top: `rgba(90, 255, 74, ${0.12 * flicker})`,
          mid: `rgba(55, 255, 124, ${0.18 * flicker})`,
          bottom: `rgba(125, 255, 90, ${0.13 * flicker})`
        },
        {
          topWidth: outerTopWidth,
          bottomWidth: outerBottomWidth,
          top: `rgba(118, 255, 76, ${0.23 * flicker})`,
          mid: `rgba(50, 255, 120, ${0.34 * flicker})`,
          bottom: `rgba(170, 255, 95, ${0.25 * flicker})`
        },
        {
          topWidth: midTopWidth,
          bottomWidth: midBottomWidth,
          top: `rgba(142, 255, 94, ${0.42 * flicker})`,
          mid: `rgba(160, 255, 112, ${0.48 * flicker})`,
          bottom: `rgba(190, 255, 130, ${0.38 * flicker})`
        },
        {
          topWidth: innerTopWidth,
          bottomWidth: innerBottomWidth,
          top: `rgba(220, 255, 184, ${0.56 * flicker})`,
          mid: `rgba(224, 255, 196, ${0.62 * flicker})`,
          bottom: `rgba(232, 255, 204, ${0.54 * flicker})`
        }
      ])

      this._fillConicalBeam(context, boss.beamX, beamTop, beamBottom, coreTopWidth, coreBottomWidth, `rgba(250, 255, 240, ${0.82 * flicker})`)

      for (let i = 0; i < 9; i += 1) {
        const offset = Math.sin(elapsed * 9 + i * 1.7) * (outerTopWidth * 0.42)
        context.globalAlpha = 0.11
        context.fillStyle = i % 2 === 0 ? 'rgba(210, 255, 160, 0.8)' : 'rgba(70, 255, 130, 0.8)'
        context.fillRect(boss.beamX + offset - 1, beamTop, 2, beamHeight)
      }
      context.globalAlpha = 1
      context.restore()
    }
  }

  _drawHealthBar(context, boss) {
    const barWidth = Math.min(440, WORLD.width * 0.44)
    const barHeight = 16
    const barX = (WORLD.width - barWidth) / 2
    const barY = 172
    const hpRatio = Math.max(0, boss.hp / Math.max(1, boss.maxHp))
    const framePaddingX = 16
    const framePaddingY = 10
    const frameX = barX - framePaddingX
    const frameY = barY - framePaddingY
    const frameWidth = barWidth + framePaddingX * 2
    const frameHeight = barHeight + framePaddingY * 2
    const healthColor = (
      hpRatio > 0.5 ? '#9cff8f' :
      hpRatio > 0.25 ? '#ffb84d' :
      '#ff5c6f'
    )
    const glowColor = (
      hpRatio > 0.5 ? 'rgba(156, 255, 143, 0.5)' :
      hpRatio > 0.25 ? 'rgba(255, 184, 77, 0.5)' :
      'rgba(255, 92, 111, 0.5)'
    )
    const fillWidth = Math.max(0, (barWidth - 6) * hpRatio)

    context.save()
    context.fillStyle = 'rgba(5, 12, 22, 0.88)'
    context.beginPath()
    context.moveTo(frameX + 14, frameY)
    context.lineTo(frameX + frameWidth - 14, frameY)
    context.lineTo(frameX + frameWidth, frameY + frameHeight / 2)
    context.lineTo(frameX + frameWidth - 14, frameY + frameHeight)
    context.lineTo(frameX + 14, frameY + frameHeight)
    context.lineTo(frameX, frameY + frameHeight / 2)
    context.closePath()
    context.fill()

    context.strokeStyle = 'rgba(120, 255, 180, 0.18)'
    context.lineWidth = 2
    context.stroke()

    context.fillStyle = 'rgba(2, 8, 16, 0.95)'
    context.fillRect(barX, barY, barWidth, barHeight)

    if (fillWidth > 0) {
      const hpGradient = context.createLinearGradient(barX, 0, barX + barWidth, 0)
      hpGradient.addColorStop(0, 'rgba(255,255,255,0.22)')
      hpGradient.addColorStop(0.12, healthColor)
      hpGradient.addColorStop(1, healthColor)
      context.shadowColor = glowColor
      context.shadowBlur = 16
      context.fillStyle = hpGradient
      context.fillRect(barX + 3, barY + 3, fillWidth, barHeight - 6)
      context.shadowBlur = 0
    }

    context.strokeStyle = 'rgba(228, 255, 240, 0.24)'
    context.lineWidth = 1.5
    context.strokeRect(barX, barY, barWidth, barHeight)

    const segments = 14
    const segmentSpacing = barWidth / segments
    context.strokeStyle = 'rgba(228, 255, 240, 0.12)'
    context.lineWidth = 1
    for (let i = 1; i < segments; i += 1) {
      const x = barX + i * segmentSpacing
      context.beginPath()
      context.moveTo(x, barY + 2)
      context.lineTo(x, barY + barHeight - 2)
      context.stroke()
    }

    context.fillStyle = 'rgba(255,255,255,0.08)'
    context.fillRect(barX + 3, barY + 3, Math.max(0, fillWidth * 0.55), 3)
    context.fillStyle = 'rgba(238,252,255,0.92)'
    context.font = '700 18px monospace'
    context.textAlign = 'center'
    context.fillText('MOTHERSHIP', WORLD.width / 2, barY - 12)
    context.textAlign = 'left'
    context.restore()
  }
}
