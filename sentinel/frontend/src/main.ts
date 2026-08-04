import './styles.css'
import { drawChart } from './chart'
import { bytes, duration, percent, sampleTime } from './formatters'
import { Poller, connectionStatus } from './polling'
import { loadPrivacy, privacyLabels, savePrivacy } from './privacy'
import type { HistoryPoint, Snapshot, Status } from './types'

const required = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing UI element: ${selector}`)
  return element
}
const text = (selector: string, value: string) => { required(selector).textContent = value }
const meter = (selector: string, value: number | null | undefined) => {
  required<HTMLElement>(selector).style.width = `${Math.min(100, Math.max(0, value ?? 0))}%`
}
const escape = (value: string) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char)

let snapshot: Snapshot | null = null
let history: HistoryPoint[] = []
let privacy = loadPrivacy()
let lastSuccess: number | null = null
const privacyInput = required<HTMLInputElement>('#privacy')
privacyInput.checked = privacy

function renderStatus(status: Status): void {
  const labels: Record<Status, string> = { healthy: 'Healthy', degraded: 'Degraded', stale: 'Stale data', unavailable: 'Unavailable' }
  const pill = required('#status-pill')
  pill.className = `status-pill ${status}`
  pill.querySelector('span')!.textContent = labels[status]
}

function renderCharts(): void {
  drawChart(required('#cpu-chart'), [history.map((point) => point.cpuPercent)], ['#52e3a1'], 100)
  drawChart(required('#memory-chart'), [history.map((point) => point.memoryPercent)], ['#5aa9ff'], 100)
  drawChart(required('#network-chart'), [history.map((point) => point.networkRxBytesPerSecond), history.map((point) => point.networkTxBytesPerSecond)], ['#a985ff', '#f0b35a'])
}

function render(): void {
  if (!snapshot) return
  const labels = privacyLabels(privacy)
  const cpu = snapshot.cpu
  const memory = snapshot.memory
  const network = snapshot.network
  const system = snapshot.system

  text('#host-title', labels.host(system?.hostname ?? 'Host unavailable'))
  text('#system-subtitle', system ? `${system.os} · ${system.architecture}` : 'Privileged host metrics are unavailable')
  text('#updated', sampleTime(snapshot.timestamp))
  text('#cpu-value', percent(cpu?.percent))
  text('#cpu-chart-value', percent(cpu?.percent))
  meter('#cpu-meter', cpu?.percent)
  text('#cpu-detail', cpu ? `Load ${cpu.load1.toFixed(2)} / ${cpu.load5.toFixed(2)} / ${cpu.load15.toFixed(2)}` : 'Load averages unavailable')
  text('#memory-value', percent(memory?.percent))
  text('#memory-chart-value', percent(memory?.percent))
  meter('#memory-meter', memory?.percent)
  text('#memory-detail', memory ? `${bytes(memory.usedBytes)} of ${bytes(memory.totalBytes)}` : 'Usage unavailable')
  text('#network-value', bytes((network?.rxBytesPerSecond ?? 0) + (network?.txBytesPerSecond ?? 0), true))
  text('#network-rx', bytes(network?.rxBytesPerSecond, true))
  text('#network-tx', bytes(network?.txBytesPerSecond, true))
  text('#network-detail', network ? `${network.interfaceCount} active interface${network.interfaceCount === 1 ? '' : 's'}` : 'No interfaces detected')
  text('#uptime-value', duration(snapshot.uptimeSeconds))

  const info = required('#system-info')
  const infoValues = [system?.os ?? '—', system?.kernel ?? '—', system?.architecture ?? '—', system?.cpuModel ?? '—', memory ? `${percent(memory.swapPercent)} · ${bytes(memory.swapUsedBytes)} used` : '—']
  info.querySelectorAll('dd').forEach((element, index) => { element.textContent = infoValues[index] ?? '—' })

  const warnings = required('#warnings')
  warnings.innerHTML = snapshot.warnings.map((warning) => `<div><span>!</span>${escape(warning)}</div>`).join('')

  const disks = snapshot.disks
  text('#disk-count', disks ? `${disks.length} volume${disks.length === 1 ? '' : 's'}` : 'Unavailable')
  required('#disks').innerHTML = disks?.length ? disks.map((disk, index) => `<div class="disk-row"><div class="disk-meta"><div><strong>${escape(labels.filesystem(disk.mount, index))}</strong><span>${escape(disk.filesystem)}</span></div><b>${percent(disk.percent)}</b></div><div class="meter"><i style="width:${Math.min(100, disk.percent)}%"></i></div><p>${bytes(disk.usedBytes)} used of ${bytes(disk.totalBytes)} · ${bytes(disk.availableBytes)} free</p></div>`).join('') : '<div class="empty">Storage metrics unavailable</div>'

  const containers = snapshot.containers
  const running = containers?.filter((item) => item.state === 'running').length ?? 0
  text('#container-count', containers ? `${running} running · ${containers.length} total` : 'Unavailable')
  required('#containers').innerHTML = containers?.length ? containers.map((container, index) => {
    const stateClass = container.state === 'running' ? (container.health === 'unhealthy' ? 'danger' : 'good') : 'muted'
    const stateLabel = container.health !== 'none' ? container.health : container.state
    return `<tr><td><div class="container-name"><i class="${stateClass}"></i><div><strong>${escape(labels.container(container.name, index))}</strong><span>${escape(container.id)}</span></div></div></td><td class="image-cell">${escape(labels.image(container.image, index))}</td><td><span class="state ${stateClass}">${escape(stateLabel)}</span><small>${escape(container.status)}</small></td><td>${percent(container.cpuPercent)}</td><td><strong>${bytes(container.memoryUsageBytes)}</strong><span class="subvalue">${percent(container.memoryPercent)}</span></td><td>${container.restartCount}</td></tr>`
  }).join('') : `<tr><td colspan="6" class="empty">${containers ? 'No containers found' : 'Docker metrics unavailable'}</td></tr>`

  renderCharts()
  renderStatus(connectionStatus(lastSuccess, Date.now(), snapshot.status === 'degraded'))
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json() as Promise<T>
}

async function loadHistory(): Promise<void> {
  try {
    const response = await requestJson<{ points: HistoryPoint[] }>('/api/history')
    history = response.points.slice(-300)
    renderCharts()
  } catch (error) {
    console.warn('History is not available yet.', error)
  }
}

async function pollSnapshot(): Promise<void> {
  try {
    snapshot = await requestJson<Snapshot>('/api/snapshot')
    lastSuccess = Date.now()
    const latest: HistoryPoint = {
      timestampMs: snapshot.timestampMs,
      cpuPercent: snapshot.cpu?.percent ?? null,
      memoryPercent: snapshot.memory?.percent ?? null,
      networkRxBytesPerSecond: snapshot.network?.rxBytesPerSecond ?? null,
      networkTxBytesPerSecond: snapshot.network?.txBytesPerSecond ?? null,
    }
    if (history.at(-1)?.timestampMs !== latest.timestampMs) history = [...history.slice(-299), latest]
    render()
  } catch (error) {
    renderStatus(connectionStatus(lastSuccess, Date.now()))
    console.warn('Snapshot request failed.', error)
  }
}

privacyInput.addEventListener('change', () => {
  privacy = privacyInput.checked
  savePrivacy(privacy)
  render()
})
window.addEventListener('resize', renderCharts)
setInterval(() => renderStatus(connectionStatus(lastSuccess, Date.now(), snapshot?.status === 'degraded')), 1000)

void loadHistory()
new Poller(pollSnapshot).start()
