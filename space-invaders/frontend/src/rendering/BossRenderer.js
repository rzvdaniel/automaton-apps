import { WORLD } from '../config.js'

export class BossRenderer {
  draw(context, boss, bossSprite, elapsed, settings) {
    if (!boss?.active) return

    const wobble = settings.reducedMotion ? 0 : Math.sin(elapsed * 2.8 + boss.hoverPhase) * 4
    const x = boss.x
    const y = boss.y + wobble
    const damageRatio = 1 - boss.hp / Math.max(1, boss.maxHp)
    const reactorPulse = 0.55 + ((Math.sin(boss.reactorPulse * 6.2) + 1) / 2) * 0.45 + (boss.coreCharge ?? 0) * 0.4
    const sprite = bossSprite ?? null
    const width = boss.width
    const height = width * (sprite?.naturalWidth > 0 ? sprite.naturalHeight / sprite.naturalWidth : boss.height / Math.max(1, boss.width))

    this._drawBeam(context, boss, elapsed)

    context.save()
    context.translate(x, y)

    const halo = context.createRadialGradient(0, 0, width * 0.12, 0, 0, width * 0.95)
    halo.addColorStop(0, 'rgba(0, 0, 0, 0.26)')
    halo.addColorStop(0.48, 'rgba(0, 0, 0, 0.18)')
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = halo
    context.beginPath()
    context.arc(0, 0, width * 0.95, 0, Math.PI * 2)
    context.fill()

    context.shadowColor = `rgba(122, 255, 146, ${0.2 + reactorPulse * 0.18})`
    context.shadowBlur = 24

    if (sprite?.complete && sprite.naturalWidth > 0) {
      context.drawImage(sprite, -width / 2, -height / 2, width, height)
    } else {
      context.fillStyle = '#132336'
      context.fillRect(-width / 2, -height / 2, width, height)
    }

    context.globalCompositeOperation = 'screen'
    const coreRadius = width * (0.22 + reactorPulse * 0.08)
    const coreGlow = context.createRadialGradient(0, 0, width * 0.03, 0, 0, coreRadius)
    coreGlow.addColorStop(0, `rgba(255, 230, 255, ${0.36 + reactorPulse * 0.24})`)
    coreGlow.addColorStop(0.38, `rgba(255, 92, 216, ${0.24 + reactorPulse * 0.18})`)
    coreGlow.addColorStop(1, 'rgba(255, 92, 216, 0)')
    context.fillStyle = coreGlow
    context.beginPath()
    context.arc(0, 0, coreRadius, 0, Math.PI * 2)
    context.fill()

    const podGlowAlpha = 0.08 + reactorPulse * 0.08
    context.fillStyle = `rgba(161, 255, 145, ${podGlowAlpha})`
    context.beginPath()
    context.ellipse(-width * 0.28, 0, width * 0.07, height * 0.09, 0, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.ellipse(width * 0.28, 0, width * 0.07, height * 0.09, 0, 0, Math.PI * 2)
    context.fill()

    if (boss.leftPodFlash > 0) {
      context.fillStyle = `rgba(255, 214, 168, ${boss.leftPodFlash * 0.45})`
      context.beginPath()
      context.ellipse(-width * 0.32, height * 0.2, width * 0.045, height * 0.06, 0, 0, Math.PI * 2)
      context.fill()
    }
    if (boss.rightPodFlash > 0) {
      context.fillStyle = `rgba(255, 214, 168, ${boss.rightPodFlash * 0.45})`
      context.beginPath()
      context.ellipse(width * 0.32, height * 0.2, width * 0.045, height * 0.06, 0, 0, Math.PI * 2)
      context.fill()
    }

    if (damageRatio > 0.25) {
      context.fillStyle = 'rgba(255, 180, 120, 0.32)'
      context.beginPath()
      context.ellipse(-width * 0.32, -height * 0.16, width * 0.05, height * 0.08, -0.2, 0, Math.PI * 2)
      context.fill()
    }
    if (damageRatio > 0.5) {
      context.fillStyle = 'rgba(255, 120, 120, 0.26)'
      context.beginPath()
      context.ellipse(width * 0.25, -height * 0.12, width * 0.04, height * 0.06, 0.15, 0, Math.PI * 2)
      context.fill()
    }
    if (damageRatio > 0.75) {
      context.fillStyle = 'rgba(255, 244, 190, 0.46)'
      context.fillRect(-width * 0.19, height * 0.02, width * 0.018, height * 0.08)
      context.fillRect(width * 0.17, -height * 0.01, width * 0.014, height * 0.07)
    }

    if (boss.damageFlash > 0) {
      context.globalAlpha = boss.damageFlash * 0.18
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.ellipse(0, 0, width * 0.22, height * 0.18, 0, 0, Math.PI * 2)
      context.fill()
    }

    context.restore()
    this._drawHealthBar(context, boss)
  }

  _drawBeam(context, boss, elapsed) {
    if (boss.beamWarning > 0) {
      context.save()
      context.globalAlpha = 0.22 + ((Math.sin(elapsed * 14) + 1) / 2) * 0.18
      context.fillStyle = 'rgba(255, 92, 160, 0.42)'
      context.fillRect(boss.beamX - 4, boss.beamStartY, 8, WORLD.height - boss.beamStartY)
      context.restore()
    }

    if (boss.beamActive > 0) {
      const beamAlpha = 0.45 + boss.beamActive * 0.9
      context.save()
      context.globalAlpha = Math.min(1, beamAlpha)
      context.fillStyle = 'rgba(255, 112, 214, 0.2)'
      context.fillRect(boss.beamX - 18, boss.beamStartY, 36, WORLD.height - boss.beamStartY)
      context.fillStyle = 'rgba(255, 232, 252, 0.88)'
      context.fillRect(boss.beamX - 5, boss.beamStartY, 10, WORLD.height - boss.beamStartY)
      const impactGlow = context.createRadialGradient(boss.beamX, WORLD.height - 46, 10, boss.beamX, WORLD.height - 46, 78)
      impactGlow.addColorStop(0, 'rgba(255,255,255,0.9)')
      impactGlow.addColorStop(0.3, 'rgba(255,120,220,0.55)')
      impactGlow.addColorStop(1, 'rgba(255,120,220,0)')
      context.fillStyle = impactGlow
      context.beginPath()
      context.arc(boss.beamX, WORLD.height - 46, 78, 0, Math.PI * 2)
      context.fill()
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
