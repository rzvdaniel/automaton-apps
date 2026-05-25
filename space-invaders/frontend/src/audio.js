export function createAudioManager() {
  let context = null
  let ready = false
  let muted = false

  function ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx || context) return context
    context = new AudioCtx()
    return context
  }

  async function unlock() {
    const ctx = ensureContext()
    if (!ctx) return
    await ctx.resume()
    ready = true
  }

  function setMuted(value) {
    muted = value
  }

  function pulse(type, frequency, duration, volume, slide = 0) {
    if (!ready || !context || muted) return
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
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.03)
  }

  return {
    unlock,
    setMuted,
    shoot() {
      pulse('square', 980, 0.08, 0.035, -280)
      pulse('triangle', 490, 0.06, 0.02, -120)
    },
    enemyShoot() {
      pulse('sawtooth', 260, 0.11, 0.025, -100)
    },
    explosion() {
      pulse('sawtooth', 180, 0.2, 0.06, -160)
      pulse('square', 90, 0.16, 0.04, -80)
    },
    playerHit() {
      pulse('triangle', 260, 0.24, 0.05, -140)
    },
    wave() {
      pulse('square', 620, 0.1, 0.03, 140)
      pulse('square', 820, 0.14, 0.025, 90)
    }
  }
}
