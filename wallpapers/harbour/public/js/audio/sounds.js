// The named sounds. Each is a function (engine, t, dst, o): the AudioEngine (with tone, noise, say), t the start time, dst where to play,
// o the options. A class can name one with `static sound = 'name'` (played when it is clicked) or give itself a soundFor(x, y) method.
// For now the only sounds are the seagulls (and the sea, which is in ambience.js); everything else is silent until we find
// recordings that sound natural. To add one: add a function here, then name it in a class.
const m = (lo, hi) => lo + Math.random() * (hi - lo);

export const SOUNDS = {
  // A fox's yip: two or three short, high barks, each a quick rise and fall through a nasal filter.
  yip(s, t, d) {
    const c = s.ctx, g = c.createGain(), nose = c.createBiquadFilter();
    g.gain.value = 0.5; nose.type = 'bandpass'; nose.frequency.value = m(1300, 1700); nose.Q.value = 3;
    nose.connect(g); g.connect(d);
    let at = t + 0.03;
    for (let i = 2 + Math.floor(Math.random() * 2); i > 0; i--) {
      const dur = m(0.09, 0.14), f = m(700, 900), osc = c.createOscillator(), env = c.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f * 0.8, at); osc.frequency.linearRampToValueAtTime(f * 1.25, at + dur * 0.3); osc.frequency.linearRampToValueAtTime(f * 0.7, at + dur);
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(0.12, at + dur * 0.15); env.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(env); env.connect(nose); osc.start(at); osc.stop(at + dur + 0.02);
      at += dur + m(0.12, 0.22);
    }
  },

  // A seagull's call: a few falling cries, each a bright tone that rises quickly and tails off.
  gull(s, t, d, o) {
    const c = s.ctx, g = c.createGain(), voice = c.createBiquadFilter(), far = c.createBiquadFilter();
    g.gain.value = o.calm ? m(0.5, 0.9) : 0.8; voice.type = 'bandpass'; voice.frequency.value = m(1900, 2500); voice.Q.value = 2.2; far.type = 'lowpass'; far.frequency.value = 3600;
    voice.connect(far); far.connect(g); g.connect(d);
    const base = m(950, 1250), cries = 3 + Math.floor(Math.random() * 4); let at = t + 0.05;
    for (let i = 0; i < cries; i++) {
      const dur = m(0.2, 0.3) * (i === 0 ? 1.5 : 1), f = base * (1 - i * 0.025), env = c.createGain();
      [['sawtooth', 1, 0.6], ['square', 2, 0.18]].forEach(v => { const osc = c.createOscillator(), og = c.createGain(); osc.type = v[0]; og.gain.value = v[2]; osc.frequency.setValueAtTime(f * 0.72 * v[1], at); osc.frequency.linearRampToValueAtTime(f * v[1], at + dur * 0.25); osc.frequency.linearRampToValueAtTime(f * 0.8 * v[1], at + dur); osc.connect(og); og.connect(env); osc.start(at); osc.stop(at + dur + 0.05); });
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(0.07, at + dur * 0.2); env.gain.linearRampToValueAtTime(0.04, at + dur * 0.6); env.gain.linearRampToValueAtTime(0, at + dur);
      env.connect(voice); at += dur + m(0.05, 0.12);
    }
  },
};
