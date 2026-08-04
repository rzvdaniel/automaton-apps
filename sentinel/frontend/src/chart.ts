export function drawChart(canvas: HTMLCanvasElement, series: Array<Array<number | null>>, colors: string[], maxValue?: number): void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const scale = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * scale))
  canvas.height = Math.max(1, Math.floor(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(scale, scale)
  context.clearRect(0, 0, width, height)
  context.strokeStyle = 'rgba(255,255,255,.055)'
  context.lineWidth = 1
  for (let index = 1; index < 4; index += 1) {
    const y = Math.round((height / 4) * index) + 0.5
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
  }
  const values = series.flat().filter((value): value is number => value != null && Number.isFinite(value))
  const ceiling = maxValue ?? Math.max(1, ...values) * 1.12
  series.forEach((points, seriesIndex) => {
    context.beginPath()
    let drawing = false
    points.forEach((value, index) => {
      if (value == null || !Number.isFinite(value)) { drawing = false; return }
      const x = points.length <= 1 ? width : index * width / (points.length - 1)
      const y = height - Math.min(1, Math.max(0, value / ceiling)) * (height - 8) - 4
      if (!drawing) { context.moveTo(x, y); drawing = true } else context.lineTo(x, y)
    })
    context.strokeStyle = colors[seriesIndex] ?? '#fff'
    context.lineWidth = 2
    context.lineJoin = 'round'
    context.stroke()
  })
}
