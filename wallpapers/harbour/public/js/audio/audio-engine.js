// Formants (resonances of the mouth) of five vowels: what makes a sawtooth hum sound like "a", "o", "i"...
const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };

/**
 * The Web Audio plumbing and the building blocks every sound is made from. It makes no decisions about what to play.
 *
 * Building blocks (each starts at audio time t and plays into a destination node `dst`):
 *   tone   a pitch, or a sweep between pitches
 *   noise  a burst of filtered noise
 *   say    a voice or an animal's call, from a list of syllables
 */
export class AudioEngine {
  constructor() { this.ctx = null; this.master = null; this.brown = null; this.white = null; this.samples = new Map(); }

  /** Is it making sound right now? */
  get live() { return this.ctx?.state === 'running'; }

  /** Creates the audio graph the first time, resumes it, and fades the master volume in. */
  start() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!this.ctx) {
      const ctx = this.ctx = new AudioContextClass();
      this.brown = this.#buffer(d => { let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });   // soft and low: the body of a wave
      this.white = this.#buffer(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });                                                          // bright: rustles, hiss, ticks
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    }
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.8);
    return true;
  }
  resume() { this.ctx?.resume(); }
  stop() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); }
  get now() { return this.ctx.currentTime; }

  #buffer(fill) {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 4, this.ctx.sampleRate);
    fill(buffer.getChannelData(0));
    return buffer;
  }

  /** A fresh volume control and left-right position for one sound; connect the sound to the returned node. */
  out(pan = 0, level = 1) {
    const ctx = this.ctx, gain = ctx.createGain();
    gain.gain.value = level;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner); panner.connect(this.master);
    } else gain.connect(this.master);
    return gain;
  }

  /**
   * A pitch. type: 'sine' | 'triangle' | 'sawtooth' | 'square'; f: one frequency, or a list to sweep through; dur: seconds; gain; a: attack seconds;
   * vib [rate, depth in Hz] wobbles the pitch; trem [rate, depth 0-1] wobbles the volume; lp low-passes it.
   */
  tone(dst, t, { type = 'sine', f, dur, gain = 0.2, a = 0.01, vib, trem, lp }) {
    const c = this.ctx, osc = c.createOscillator(), env = c.createGain(), freqs = [].concat(f);
    osc.type = type; osc.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) osc.frequency.linearRampToValueAtTime(freqs[i], t + dur * i / (freqs.length - 1));
    if (vib) this.#wobble(osc.frequency, t, dur, vib[0], vib[1]);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain, t + a); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (lp) { const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lp; node.connect(filter); node = filter; }
    node.connect(env);
    (trem ? this.#tremolo(env, t, dur, trem[0], trem[1]) : env).connect(dst);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** A burst of noise through a filter: filter 'bandpass' | 'lowpass' | 'highpass'; f a frequency or list to sweep; q sharpness; white for bright noise. */
  noise(dst, t, { white = false, filter = 'bandpass', f, q = 1, dur, gain = 0.3, a = 0.02, trem }) {
    const c = this.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), env = c.createGain(), freqs = [].concat(f);
    src.buffer = white ? this.white : this.brown; src.loop = true; flt.type = filter; flt.Q.value = q; flt.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) flt.frequency.exponentialRampToValueAtTime(freqs[i], t + dur * i / (freqs.length - 1));
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain, t + a); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(env);
    (trem ? this.#tremolo(env, t, dur, trem[0], trem[1]) : env).connect(dst);
    src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
  }

  /**
   * A voice, or an animal's call, from a list of syllables: { v: vowel or [from, to], d: seconds, p: pitch or [from, to] in Hz, h: begins with a breath }.
   * opts: scale (mouth size: below 1 is a bigger, deeper voice), gain, vib [rate, Hz], trem [rate, depth], gap seconds between syllables.
   */
  say(dst, t, syllables, { scale = 1, gain = 0.3, vib, trem, gap = 0.03 } = {}) {
    const c = this.ctx; let at = t;
    for (const s of syllables) {
      const dur = s.d, pitch = [].concat(s.p), vowels = [].concat(s.v), from = VOWELS[vowels[0]], to = VOWELS[vowels.at(-1)];
      const osc = c.createOscillator(), env = c.createGain(), mix = c.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(pitch[0], at);
      for (let i = 1; i < pitch.length; i++) osc.frequency.linearRampToValueAtTime(pitch[i], at + dur * i / (pitch.length - 1));
      if (vib) this.#wobble(osc.frequency, at, dur, vib[0], vib[1]);
      [1, 0.55, 0.3].forEach((weight, k) => {   // three resonances in parallel, each gliding from the first vowel to the last
        const filter = c.createBiquadFilter(), w = c.createGain();
        filter.type = 'bandpass'; filter.Q.value = 7;
        filter.frequency.setValueAtTime(from[k] * scale, at); filter.frequency.linearRampToValueAtTime(to[k] * scale, at + dur);
        w.gain.value = weight * (k ? 1.6 : 1); osc.connect(filter); filter.connect(w); w.connect(mix);
      });
      env.gain.setValueAtTime(0.0001, at); env.gain.linearRampToValueAtTime(gain, at + Math.min(0.04, dur * 0.3)); env.gain.setValueAtTime(gain, at + dur * 0.7); env.gain.linearRampToValueAtTime(0.0001, at + dur);
      mix.connect(env);
      (trem ? this.#tremolo(env, at, dur, trem[0], trem[1]) : env).connect(dst);
      osc.start(at); osc.stop(at + dur + 0.05);
      if (s.h) this.noise(dst, at - 0.03, { white: true, f: 1800, q: 0.8, dur: 0.09, a: 0.01, gain: gain * 0.5 });
      at += dur + gap;
    }
  }

  /**
   * Loads recordings: { name: { file, clips? } } with a function that gives each file's address. A recording that fails to load is
   * only reported; the sounds that use it fall back to their synthetic version. clips: [[start, seconds], ...] are the stretches worth playing.
   */
  async loadSamples(definitions, addressOf) {
    await Promise.all(Object.entries(definitions).map(async ([name, { file, clips }]) => {
      try {
        const response = await fetch(addressOf(file));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        this.samples.set(name, { buffer: await this.ctx.decodeAudioData(await response.arrayBuffer()), clips });
      } catch (err) { console.warn(`Harbour: recording "${name}" not loaded (${err.message}); its synthetic sound is used`); }
    }));
  }

  /** Plays a recording (one of its clips, chosen at random). Returns false when it is not loaded, so the caller can fall back. */
  sample(dst, t, name, { gain = 1, rate = 1, fade = 0.04 } = {}) {
    const sample = this.samples.get(name);
    if (!sample) return false;
    const [start, seconds] = sample.clips ? sample.clips[Math.floor(Math.random() * sample.clips.length)] : [0, sample.buffer.duration];
    const c = this.ctx, source = c.createBufferSource(), env = c.createGain(), length = seconds / rate;
    source.buffer = sample.buffer; source.playbackRate.value = rate;
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain, t + fade); env.gain.setValueAtTime(gain, t + Math.max(fade, length - fade)); env.gain.linearRampToValueAtTime(0.0001, t + length);
    source.connect(env); env.connect(dst);
    source.start(t, start, seconds);
    return true;
  }

  /** Makes a value (pitch) waver: `rate` times a second, by `depth` in its own units. */
  #wobble(param, t, dur, rate, depth) {
    const c = this.ctx, lfo = c.createOscillator(), g = c.createGain();
    lfo.frequency.value = rate; g.gain.value = depth; lfo.connect(g); g.connect(param); lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  /** Makes a sound's volume pulse. Returns the node to connect onward. */
  #tremolo(node, t, dur, rate, depth) {
    const c = this.ctx, am = c.createGain(), lfo = c.createOscillator(), g = c.createGain();
    am.gain.value = 1 - depth / 2; lfo.frequency.value = rate; g.gain.value = depth / 2;
    lfo.connect(g); g.connect(am.gain); lfo.start(t); lfo.stop(t + dur + 0.05); node.connect(am);
    return am;
  }
}
