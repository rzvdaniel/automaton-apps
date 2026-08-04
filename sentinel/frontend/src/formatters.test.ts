import { describe, expect, it } from 'vitest'
import { bytes, duration, percent } from './formatters'

describe('formatters', () => {
  it('formats percentages and missing values', () => {
    expect(percent(42.56)).toBe('42.6%')
    expect(percent(null)).toBe('—')
  })
  it('formats bytes and rates', () => {
    expect(bytes(1_500_000)).toBe('1.50 MB')
    expect(bytes(2500, true)).toBe('2.50 KB/s')
  })
  it('formats durations', () => {
    expect(duration(176400)).toBe('2d 1h')
    expect(duration(null)).toBe('—')
  })
})
