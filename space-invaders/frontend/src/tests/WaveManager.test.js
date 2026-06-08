import { describe, it, expect } from 'vitest'
import { getWaveConfig } from '../systems/WaveManager.js'

describe('getWaveConfig', () => {
  it('wave 1 has baseline config', () => {
    const config = getWaveConfig(1)
    expect(config.columns).toBe(6)
    expect(config.rows).toBe(4)
    expect(config.gapX).toBe(30)
    expect(config.gapY).toBe(40)
    expect(config.stepInterval).toBe(0.54)
  })

  it('later waves have more columns', () => {
    const wave1 = getWaveConfig(1)
    const wave5 = getWaveConfig(5)
    expect(wave5.columns).toBeGreaterThan(wave1.columns)
  })

  it('columns are clamped to max 9', () => {
    const config = getWaveConfig(99)
    expect(config.columns).toBeLessThanOrEqual(9)
  })

  it('stepInterval decreases with wave number', () => {
    const wave1 = getWaveConfig(1)
    const wave5 = getWaveConfig(5)
    expect(wave5.stepInterval).toBeLessThan(wave1.stepInterval)
  })

  it('enemy fire rate increases with wave', () => {
    const wave1 = getWaveConfig(1)
    const wave5 = getWaveConfig(5)
    expect(wave5.enemyFireRate).toBeGreaterThan(wave1.enemyFireRate)
  })

  it('stepInterval has a minimum floor', () => {
    const config = getWaveConfig(99)
    expect(config.stepInterval).toBeGreaterThanOrEqual(0.18)
  })

  it('enemy size decreases with wave but has a floor', () => {
    const config = getWaveConfig(99)
    expect(config.enemyWidth).toBeGreaterThanOrEqual(58)
    expect(config.enemyHeight).toBeGreaterThanOrEqual(58)
  })

  it('resets wave pacing at the start of a new level', () => {
    const wave5 = getWaveConfig(5)
    const wave6 = getWaveConfig(6)
    expect(wave6.stepInterval).toBeGreaterThan(wave5.stepInterval)
    expect(wave6.horizontalStep).toBeLessThanOrEqual(30)
  })

  it('caps late-game projectile pressure', () => {
    const config = getWaveConfig(99)
    expect(config.enemyBulletSpeed).toBeLessThanOrEqual(760)
    expect(config.maxEnemyBullets).toBeLessThanOrEqual(6)
    expect(config.horizontalStep).toBeLessThanOrEqual(38)
    expect(config.drop).toBeLessThanOrEqual(55)
  })
})
