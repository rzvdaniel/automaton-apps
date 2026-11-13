// Sound, made in the browser with no audio files: slow waves with quiet gaps, a gull calling now and then,
// the church bell, a splash, the car's horn. Off until the button is pressed; the choice is remembered.
(function (H) {
  'use strict';
  const KEY = 'harbour-sound', rand = (lo, hi) => lo + Math.random() * (hi - lo);
  H.Sound = class {
    constructor(button) {
      this.button = button; this.ctx = null; this.on = false; this.lastGull = 0; this.timers = [];
      let saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
      if (button) {
        ['mousedown', 'touchstart'].forEach(n => button.addEventListener(n, e => e.stopPropagation()));   // the button is not part of the island
        button.addEventListener('click', () => this.set(!this.on));
      }
      // a browser only lets a page make sound after the first click or key press
      if (saved) { this.set(true); const wake = () => { if (this.ctx) this.ctx.resume(); }; ['mousedown', 'touchstart', 'keydown'].forEach(n => window.addEventListener(n, wake, { once: true })); }
    }
    set(on) {
      this.on = on;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      if (this.button) { this.button.classList.toggle('on', on); this.button.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      if (on) this.start(); else this.stop();
    }
    get live() { return this.on && this.ctx && this.ctx.state === 'running'; }
    start() {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!this.ctx) {
        const ctx = this.ctx = new AC(), n = ctx.sampleRate * 4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // soft, low noise: the body of a wave
        this.noise = buf; this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
        // the sea: a low rumble and a brighter hiss of foam, each with its own swell
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 520;
        const high = ctx.createBiquadFilter(); high.type = 'bandpass'; high.frequency.value = 1900; high.Q.value = 0.5;
        this.rumble = ctx.createGain(); this.rumble.gain.value = 0.05; this.hiss = ctx.createGain(); this.hiss.gain.value = 0.01;
        src.connect(low); low.connect(this.rumble); this.rumble.connect(this.master); src.connect(high); high.connect(this.hiss); this.hiss.connect(this.master); src.start();
      }
      this.ctx.resume();
      this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.8);
      this.timers.forEach(clearTimeout); this.timers = [];
      this.swell(); this.later(() => this.callGulls(), rand(6, 16));
    }
    stop() { this.timers.forEach(clearTimeout); this.timers = []; if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); }
    later(fn, seconds) { this.timers.push(setTimeout(() => { if (this.on) fn(); }, seconds * 1000)); }
    // One wave rolls in and draws back; then the sea is quiet for a while.
    swell() {
      if (this.live) {
        const t = this.ctx.currentTime, peak = rand(0.22, 0.42), rise = rand(1.6, 2.6);
        this.rumble.gain.setTargetAtTime(peak, t, rise * 0.45); this.rumble.gain.setTargetAtTime(0.045, t + rise, 1.7);
        this.hiss.gain.setTargetAtTime(peak * 0.3, t + rise * 0.6, 0.5); this.hiss.gain.setTargetAtTime(0.008, t + rise + 0.7, 1.5);
      }
      this.later(() => this.swell(), Math.random() < 0.2 ? rand(13, 20) : rand(6.5, 10.5));
    }
    callGulls() { this.gull(true); this.later(() => this.callGulls(), rand(18, 55)); }
    // A gull's call: a few falling cries, each a bright tone that rises quickly and tails off.
    gull(calm) {
      if (!this.live) return;
      const ctx = this.ctx, now = ctx.currentTime; if (!calm && now - this.lastGull < 5) return; this.lastGull = now;
      const out = ctx.createGain(); out.gain.value = calm ? rand(0.035, 0.07) : 0.06;
      const voice = ctx.createBiquadFilter(); voice.type = 'bandpass'; voice.frequency.value = rand(1900, 2500); voice.Q.value = 2.2;
      const far = ctx.createBiquadFilter(); far.type = 'lowpass'; far.frequency.value = 3600;
      voice.connect(far); far.connect(out);
      if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.8, 0.8); out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
      const base = rand(950, 1250), cries = 3 + Math.floor(Math.random() * 4); let t = now + 0.05;
      for (let i = 0; i < cries; i++) {
        const long = i === 0 ? 1.5 : 1, d = rand(0.2, 0.3) * long, f = base * (1 - i * 0.025), g = ctx.createGain();
        [['sawtooth', 1, 0.6], ['square', 2, 0.18]].forEach(v => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = v[0]; og.gain.value = v[2]; o.frequency.setValueAtTime(f * 0.72 * v[1], t); o.frequency.linearRampToValueAtTime(f * v[1], t + d * 0.25); o.frequency.linearRampToValueAtTime(f * 0.8 * v[1], t + d); o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.05); });
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + d * 0.2); g.gain.linearRampToValueAtTime(0.6, t + d * 0.6); g.gain.linearRampToValueAtTime(0, t + d);
        g.connect(voice); t += d + rand(0.05, 0.12);
      }
    }
    // The bell: three strokes, each a handful of partials that die away at their own pace.
    bell() {
      if (!this.live) return;
      const ctx = this.ctx;
      for (let s = 0; s < 3; s++) {
        const t = ctx.currentTime + 0.02 + s * 0.75;
        [[0.5, 0.5, 3.2], [1, 1, 2.6], [1.19, 0.55, 1.9], [1.5, 0.35, 1.5], [2, 0.45, 1.2], [2.74, 0.22, 0.8], [3, 0.16, 0.6]].forEach(p => {
          const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 540 * p[0];
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 * p[1], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
          o.connect(g); g.connect(this.master); o.start(t); o.stop(t + p[2] + 0.05);
        });
      }
    }
    // A short burst of filtered noise: a splash (bright) or something dropping into the water (dull).
    burstNoise(freq, q, level, decay) {
      if (!this.live) return;
      const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.45, t + decay); f.Q.value = q;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random() * 3, decay + 0.1);
    }
    splash() { this.burstNoise(1500, 0.8, 0.5, 0.45); }
    plop() { this.burstNoise(700, 1.4, 0.8, 0.6); }
    honk() {
      if (!this.live) return;
      const ctx = this.ctx;
      [0, 0.2].forEach(at => [392, 494].forEach(f => {
        const t = ctx.currentTime + at, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 1400;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.01); g.gain.setValueAtTime(0.035, t + 0.11); g.gain.linearRampToValueAtTime(0, t + 0.14);
        o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16);
      }));
    }
  };
})(window.Harbour);
