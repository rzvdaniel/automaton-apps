export function createAudioManager() {
  let context = null
  let ready = false
  let muted = false
  let masterGain = null
  let compressor = null

  function isTouchAudioProfile() {
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches
  }

  function getMasterVolume() {
    return isTouchAudioProfile() ? 1.28 : 0.92
  }

  function ensureOutputChain(ctx) {
    if (!ctx || (masterGain && compressor)) return
    compressor = ctx.createDynamicsCompressor()
    compressor.threshold.setValueAtTime(-24, ctx.currentTime)
    compressor.knee.setValueAtTime(18, ctx.currentTime)
    compressor.ratio.setValueAtTime(3.2, ctx.currentTime)
    compressor.attack.setValueAtTime(0.003, ctx.currentTime)
    compressor.release.setValueAtTime(0.18, ctx.currentTime)

    masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(getMasterVolume(), ctx.currentTime)
    compressor.connect(masterGain)
    masterGain.connect(ctx.destination)
  }

  function ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx || context) return context
    context = new AudioCtx()
    ensureOutputChain(context)
    return context
  }

  async function unlock() {
    const ctx = ensureContext()
    if (!ctx) return
    await ctx.resume()
    masterGain?.gain.setValueAtTime(getMasterVolume(), ctx.currentTime)
    ready = true
  }

  function setMuted(value) {
    muted = value
  }

  function pulse(type, frequency, duration, volume, slide = 0) {
    if (!ready || !context || muted || !compressor) return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    if (slide) {
      oscillator.frequency.linearRampToValueAtTime(frequency + slide, now + duration)
    }
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain)
    gain.connect(compressor)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.03)
  }

  return {
    unlock,
    setMuted,
    shoot() {
      pulse('square', 980, 0.08, 0.048, -280)
      pulse('triangle', 490, 0.06, 0.028, -120)
    },
    enemyShoot() {
      pulse('sawtooth', 260, 0.11, 0.034, -100)
    },
    explosion() {
      pulse('sawtooth', 180, 0.2, 0.085, -160)
      pulse('square', 90, 0.16, 0.054, -80)
    },
    playerHit() {
      pulse('triangle', 260, 0.24, 0.068, -140)
    },
    wave() {
      pulse('square', 620, 0.1, 0.042, 140)
      pulse('square', 820, 0.14, 0.036, 90)
    },
    waveArrival() {
      pulse('triangle', 340, 0.18, 0.034, 120)
      pulse('sawtooth', 420, 0.22, 0.022, 180)
      pulse('square', 560, 0.14, 0.018, 90)
    },
    formationLocked() {
      pulse('triangle', 720, 0.08, 0.026, 80)
      pulse('square', 980, 0.1, 0.018, 40)
    }
  }
}
