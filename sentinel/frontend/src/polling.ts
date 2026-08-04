import type { Status } from './types'

export function connectionStatus(lastSuccessMs: number | null, nowMs: number, degraded = false): Status {
  if (lastSuccessMs == null) return 'unavailable'
  if (nowMs - lastSuccessMs > 10_000) return 'stale'
  return degraded ? 'degraded' : 'healthy'
}

export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(private readonly task: () => Promise<void>, private readonly intervalMs = 3000) {}

  start(): void {
    if (this.running) return
    this.running = true
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    const started = Date.now()
    try {
      await this.task()
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => void this.tick(), Math.max(0, this.intervalMs - (Date.now() - started)))
      }
    }
  }
}
