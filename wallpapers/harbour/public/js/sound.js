// Sound, made in the browser with no audio files. Off until the button is pressed; the choice is remembered.
//
// This file is the machinery: the audio graph, the sea, the occasional gull, and a few building blocks (tone, noise, say)
// that sounds.js combines into named sounds. To make a thing sound when it is clicked, give its class `static sound = 'name'`
// and add `name` to H.SOUNDS in sounds.js. Nothing in here needs to change for that.
(function (H) {
  'use strict';
  const KEY = 'harbour-sound', rand = (lo, hi) => lo + Math.random() * (hi - lo);
  // Formants (resonances of the mouth) of five vowels: what makes a sawtooth hum sound like "a", "o", "i"...
  const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };

  H.Sound = class {
    constructor(button) {
      this.button = button; this.ctx = null; this.on = false; this.timers = []; this.last = {}; this.world = null;
      let saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
      if (button) {
        ['mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel'].forEach(n => button.addEventListener(n, e => e.stopPropagation()));   // the button is not part of the island
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
        const ctx = this.ctx = new AC(), n = ctx.sampleRate * 4, make = fill => { const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); fill(d); return b; };
        let last = 0;
        this.brown = make(d => { for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });   // soft and low: the body of a wave
        this.white = make(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });                                                         // bright: rustles, hiss, ticks
        this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
        // the sea: a low rumble and a brighter hiss of foam, each with its own swell
        const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
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

    // ---------- the ambience: waves, and a gull now and then ----------
    // One wave rolls in and draws back; then the sea is quiet for a while.
    swell() {
      if (this.live) {
        const t = this.ctx.currentTime, peak = rand(0.22, 0.42), rise = rand(1.6, 2.6);
        this.rumble.gain.setTargetAtTime(peak, t, rise * 0.45); this.rumble.gain.setTargetAtTime(0.045, t + rise, 1.7);
        this.hiss.gain.setTargetAtTime(peak * 0.3, t + rise * 0.6, 0.5); this.hiss.gain.setTargetAtTime(0.008, t + rise + 0.7, 1.5);
      }
      this.later(() => this.swell(), Math.random() < 0.2 ? rand(13, 20) : rand(6.5, 10.5));
    }
    // A gull calls from where one really is, heard from that side; rarely, so it stays a pleasure.
    callGulls() {
      const w = this.world, gulls = w ? w.entities.filter(e => e instanceof H.Gull || e instanceof H.GullFlock) : [], g = gulls.length ? gulls[Math.floor(Math.random() * gulls.length)] : null;
      this.play('gull', { calm: true, pan: g ? w.panOf(g.x) : rand(-0.8, 0.8) });
      this.later(() => this.callGulls(), rand(25, 70));
    }

    // ---------- playing a named sound ----------
    // o.pan: -1 (left) to 1 (right); o.level: volume; o.entity: the thing that was clicked; anything else a sound may use.
    play(name, o) {
      if (!this.live) return;
      const fn = H.SOUNDS && H.SOUNDS[name]; if (!fn) { if (this.world && this.world.debug) console.warn('Harbour: no sound called "' + name + '"'); return; }
      const now = this.ctx.currentTime, opt = o || {};
      if (now - (this.last[name] || 0) < (opt.calm ? 4 : 0.15)) return;   // the same sound never piles on itself
      this.last[name] = now;
      try { fn(this, now + 0.01, this.out(opt.pan, opt.level), opt); } catch (err) { console.error('Harbour: sound "' + name + '" failed:', err); }
    }
    // A fresh volume and left-right position for one sound.
    out(pan, level) {
      const ctx = this.ctx, g = ctx.createGain(); g.gain.value = level === undefined ? 1 : level;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); p.connect(this.master); } else g.connect(this.master);
      return g;
    }
    // Older calls from entities: kept so they keep working.
    bell() { this.play('bell'); } honk() { this.play('honk'); } splash() { this.play('splash'); } plop() { this.play('plop'); } gull() { this.play('gull'); }

    // ---------- building blocks (all start at audio time t and play into dst) ----------
    // A pitch: type 'sine' | 'triangle' | 'sawtooth' | 'square'; f one frequency or a list to sweep through; dur seconds; gain; a attack;
    // vib [rate, depth in Hz] wobbles the pitch; trem [rate, depth 0-1] wobbles the volume; lp low-passes it.
    tone(dst, t, o) {
      const c = this.ctx, osc = c.createOscillator(), g = c.createGain(), f = [].concat(o.f), dur = o.dur, a = o.a === undefined ? 0.01 : o.a;
      osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f[0], t);
      for (let i = 1; i < f.length; i++) osc.frequency.linearRampToValueAtTime(f[i], t + dur * i / (f.length - 1));
      if (o.vib) this.wobble(osc.frequency, t, dur, o.vib[0], o.vib[1]);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain === undefined ? 0.2 : o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc; if (o.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; node.connect(lp); node = lp; }
      node.connect(g); let out = g; if (o.trem) out = this.tremolo(g, t, dur, o.trem[0], o.trem[1]);
      out.connect(dst); osc.start(t); osc.stop(t + dur + 0.05);
    }
    // A burst of noise through a filter: filter 'bandpass' | 'lowpass' | 'highpass'; f a frequency or list to sweep; q sharpness; white for bright noise.
    noise(dst, t, o) {
      const c = this.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain(), fr = [].concat(o.f), dur = o.dur, a = o.a === undefined ? 0.02 : o.a;
      src.buffer = o.white ? this.white : this.brown; src.loop = true; flt.type = o.filter || 'bandpass'; flt.Q.value = o.q || 1; flt.frequency.setValueAtTime(fr[0], t);
      for (let i = 1; i < fr.length; i++) flt.frequency.exponentialRampToValueAtTime(fr[i], t + dur * i / (fr.length - 1));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain === undefined ? 0.3 : o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); let out = g; if (o.trem) out = this.tremolo(g, t, dur, o.trem[0], o.trem[1]);
      out.connect(dst); src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
    }
    // A voice, or an animal's call, from a list of syllables: { v: vowel or [from, to], d: seconds, p: pitch or [from, to] in Hz, h: begins with a breath }.
    // opts: scale (mouth size: below 1 is a bigger, deeper voice), gain, vib [rate, Hz], trem [rate, depth], gap seconds between syllables.
    say(dst, t, syllables, opts) {
      const c = this.ctx, o = opts || {}, scale = o.scale || 1; let at = t;
      syllables.forEach(s => {
        const dur = s.d, p = [].concat(s.p), v = [].concat(s.v), from = VOWELS[v[0]], to = VOWELS[v[v.length - 1]];
        const osc = c.createOscillator(), env = c.createGain(), mix = c.createGain(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(p[0], at);
        for (let i = 1; i < p.length; i++) osc.frequency.linearRampToValueAtTime(p[i], at + dur * i / (p.length - 1));
        if (o.vib) this.wobble(osc.frequency, at, dur, o.vib[0], o.vib[1]);
        [1, 0.55, 0.3].forEach((weight, k) => {   // three resonances in parallel, each gliding from the first vowel to the last
          const f = c.createBiquadFilter(), w = c.createGain(); f.type = 'bandpass'; f.Q.value = 7;
          f.frequency.setValueAtTime(from[k] * scale, at); f.frequency.linearRampToValueAtTime(to[k] * scale, at + dur);
          w.gain.value = weight * (k ? 1.6 : 1); osc.connect(f); f.connect(w); w.connect(mix);
        });
        env.gain.setValueAtTime(0.0001, at); env.gain.linearRampToValueAtTime(o.gain === undefined ? 0.3 : o.gain, at + Math.min(0.04, dur * 0.3)); env.gain.setValueAtTime(o.gain === undefined ? 0.3 : o.gain, at + dur * 0.7); env.gain.linearRampToValueAtTime(0.0001, at + dur);
        mix.connect(env); let out = env; if (o.trem) out = this.tremolo(env, at, dur, o.trem[0], o.trem[1]);
        out.connect(dst); osc.start(at); osc.stop(at + dur + 0.05);
        if (s.h) this.noise(dst, at - 0.03, { white: true, f: 1800, q: 0.8, dur: 0.09, a: 0.01, gain: (o.gain || 0.3) * 0.5 });
        at += dur + (o.gap === undefined ? 0.03 : o.gap);
      });
    }
    // Make a value (pitch) waver: rate times a second, depth in its own units.
    wobble(param, t, dur, rate, depth) { const c = this.ctx, lfo = c.createOscillator(), g = c.createGain(); lfo.frequency.value = rate; g.gain.value = depth; lfo.connect(g); g.connect(param); lfo.start(t); lfo.stop(t + dur + 0.05); }
    // Make a sound's volume pulse: returns the node to connect onward.
    tremolo(node, t, dur, rate, depth) {
      const c = this.ctx, am = c.createGain(), lfo = c.createOscillator(), g = c.createGain(); am.gain.value = 1 - depth / 2; lfo.frequency.value = rate; g.gain.value = depth / 2;
      lfo.connect(g); g.connect(am.gain); lfo.start(t); lfo.stop(t + dur + 0.05); node.connect(am); return am;
    }
  };
})(window.Harbour);
