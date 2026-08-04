export type Status = 'healthy' | 'degraded' | 'stale' | 'unavailable'

export interface HistoryPoint {
  timestampMs: number
  cpuPercent: number | null
  memoryPercent: number | null
  networkRxBytesPerSecond: number | null
  networkTxBytesPerSecond: number | null
}

export interface Snapshot {
  timestamp: string
  timestampMs: number
  status: 'healthy' | 'degraded'
  warnings: string[]
  cpu: null | { percent: number | null; load1: number; load5: number; load15: number }
  memory: null | { totalBytes: number; usedBytes: number; availableBytes: number; percent: number; swapTotalBytes: number; swapUsedBytes: number; swapPercent: number }
  network: null | { rxBytes: number; txBytes: number; rxBytesPerSecond: number | null; txBytesPerSecond: number | null; interfaceCount: number }
  uptimeSeconds: number | null
  system: null | { hostname: string; os: string; kernel: string; architecture: string; cpuModel: string }
  disks: null | Array<{ mount: string; filesystem: string; totalBytes: number; usedBytes: number; availableBytes: number; percent: number }>
  containers: null | Array<{ id: string; name: string; image: string; state: string; status: string; health: string; cpuPercent: number | null; memoryUsageBytes: number; memoryPercent: number | null; restartCount: number }>
}
