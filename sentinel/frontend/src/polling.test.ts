import { afterEach, describe, expect, it, vi } from 'vitest'
import { Poller, connectionStatus } from './polling'

describe('connection state', () => {
  it('identifies healthy, degraded, stale, and unavailable states', () => {
    expect(connectionStatus(null, 20_000)).toBe('unavailable')
    expect(connectionStatus(15_000, 20_000)).toBe('healthy')
    expect(connectionStatus(15_000, 20_000, true)).toBe('degraded')
    expect(connectionStatus(1_000, 20_000)).toBe('stale')
  })
})

describe('polling', () => {
  afterEach(() => vi.useRealTimers())

  it('never overlaps requests', async () => {
    vi.useFakeTimers()
    let resolve: (() => void) | undefined
    let active = 0
    let maxActive = 0
    const task = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((done) => { resolve = done })
      active -= 1
    })
    const poller = new Poller(task, 3000)
    poller.start()
    await vi.advanceTimersByTimeAsync(9000)
    expect(task).toHaveBeenCalledTimes(1)
    resolve?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(3000)
    expect(task).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
    poller.stop()
  })
})
