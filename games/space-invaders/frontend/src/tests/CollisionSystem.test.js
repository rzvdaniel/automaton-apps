import { describe, it, expect } from 'vitest'
import { intersects, rectFromCenter, rectFromTopLeft } from '../systems/CollisionSystem.js'

describe('CollisionSystem', () => {
  it('detects overlapping rects', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 }
    const b = { left: 5, right: 15, top: 5, bottom: 15 }
    expect(intersects(a, b)).toBe(true)
  })

  it('returns false for non-overlapping rects', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 }
    const b = { left: 20, right: 30, top: 20, bottom: 30 }
    expect(intersects(a, b)).toBe(false)
  })

  it('handles touching edges (no collision)', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 }
    const b = { left: 10, right: 20, top: 0, bottom: 10 }
    expect(intersects(a, b)).toBe(false)
  })

  it('rectFromCenter creates correct bounds', () => {
    const entity = { x: 50, y: 100, width: 20, height: 10 }
    const rect = rectFromCenter(entity)
    expect(rect.left).toBe(40)
    expect(rect.right).toBe(60)
    expect(rect.top).toBe(95)
    expect(rect.bottom).toBe(105)
  })

  it('rectFromTopLeft creates correct bounds', () => {
    const entity = { x: 10, y: 20, width: 30, height: 40 }
    const rect = rectFromTopLeft(entity)
    expect(rect.left).toBe(10)
    expect(rect.right).toBe(40)
    expect(rect.top).toBe(20)
    expect(rect.bottom).toBe(60)
  })

  it('detects overlap when one rect is inside another', () => {
    const outer = { left: 0, right: 100, top: 0, bottom: 100 }
    const inner = { left: 10, right: 90, top: 10, bottom: 90 }
    expect(intersects(outer, inner)).toBe(true)
  })
})
