// The named sounds. Each is a function (engine, t, dst, o): the AudioEngine (with tone, noise, say), t the start time, dst where to play,
// o the options (o.entity is the thing that was clicked). A class chooses its sound with `static sound = 'name'`,
// or with a soundFor(x, y) method when it has more than one (see Kite).
//
// To add a sound: add a line here, then name it in a class. It is one place, and a wrong name only logs a warning.
const m = (lo, hi) => lo + Math.random() * (hi - lo);

export const SOUNDS = {
  // ---------- the sea and the weather ----------
  splash(s, t, d) { s.noise(d, t, { white: true, f: [3200, 900], q: 0.7, dur: 0.45, a: 0.015, gain: 0.45 }); },
  plop(s, t, d) { s.noise(d, t, { f: [700, 300], q: 1.4, dur: 0.6, a: 0.015, gain: 0.8 }); s.tone(d, t, { f: [260, 90], dur: 0.25, gain: 0.25 }); },
  puff(s, t, d) { s.noise(d, t, { filter: 'lowpass', f: [600, 180], dur: 0.7, a: 0.15, gain: 0.35 }); },

  // ---------- bells and horns ----------
  // The church bell: three strokes, each a handful of partials that die away at their own pace.
  bell(s, t, d) { for (let i = 0; i < 3; i++) [[0.5, 0.5, 3.2], [1, 1, 2.6], [1.19, 0.55, 1.9], [1.5, 0.35, 1.5], [2, 0.45, 1.2], [2.74, 0.22, 0.8], [3, 0.16, 0.6]].forEach(p => s.tone(d, t + i * 0.75, { f: 540 * p[0], dur: p[2], a: 0.008, gain: 0.07 * p[1] })); },
  honk(s, t, d) { [0, 0.2].forEach(at => [392, 494].forEach(f => s.tone(d, t + at, { type: 'square', f: f, dur: 0.14, a: 0.01, gain: 0.035, lp: 1400 }))); },

  // ---------- birds ----------
  // A gull's call: a few falling cries, each a bright tone that rises quickly and tails off.
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
  puffin(s, t, d) { s.say(d, t, [{ v: 'a', d: 0.55, p: [190, 140] }], { gain: 0.35, scale: 0.85, trem: [26, 0.8] }); },   // a low purring growl

  // ---------- people ----------
  hello(s, t, d) { const p = Math.random() < 0.5 ? m(115, 150) : m(190, 240), k = p > 170 ? 1.12 : 0.95; s.say(d, t, [{ v: 'e', d: 0.14, p: [p, p * 1.1], h: true }, { v: ['o', 'u'], d: 0.28, p: [p * 1.1, p * 0.88] }], { scale: k, gain: 0.5 }); },   // "he-llo"
  ahoy(s, t, d) { s.say(d, t, [{ v: 'a', d: 0.16, p: [105, 125] }, { v: 'o', d: 0.13, p: [135, 125], h: true }, { v: ['o', 'i'], d: 0.36, p: [125, 98] }], { scale: 0.92, gain: 0.55, gap: 0.02 }); },   // a deep "a-hoy!"
  yay(s, t, d) { const p = m(330, 390); s.say(d, t, [{ v: ['u', 'e'], d: 0.2, p: [p, p * 1.25] }, { v: 'i', d: 0.42, p: [p * 1.3, p * 1.6, p * 1.35] }], { scale: 1.28, gain: 0.45, vib: [7, 8] }); },   // a child's "wheee!"
  gotOne(s, t, d) {   // "oh!" and the whirr of a reel
    s.say(d, t, [{ v: ['o', 'a'], d: 0.3, p: [140, 175] }], { scale: 0.95, gain: 0.5, h: true });
    for (let i = 0; i < 9; i++) s.noise(d, t + 0.4 + i * 0.05, { white: true, f: [3200, 2200], q: 3, dur: 0.03, a: 0.002, gain: 0.18 });
  },

  // ---------- animals ----------
  sheep(s, t, d, o) { const lamb = o.entity && o.entity.lamb, p = lamb ? 430 : 300; s.say(d, t, [{ v: ['a', 'e'], d: 0.7, p: [p * 1.05, p * 0.9] }], { scale: lamb ? 1.2 : 1, gain: 0.45, vib: [lamb ? 30 : 22, p * 0.08] }); },   // "baa"
  moo(s, t, d) { s.say(d, t, [{ v: ['o', 'u'], d: 1.1, p: [125, 98] }], { scale: 0.9, gain: 0.6, vib: [5, 4] }); },
  meow(s, t, d) { s.say(d, t, [{ v: 'e', d: 0.1, p: [480, 640] }, { v: ['a', 'o'], d: 0.45, p: [700, 520] }], { scale: 1.1, gain: 0.4, gap: 0 }); },
  seal(s, t, d) { for (let i = 0; i < 2; i++) s.say(d, t + i * 0.32, [{ v: 'o', d: 0.15, p: [170, 105], h: true }], { scale: 0.9, gain: 0.5 }); },   // two barks
  dolphin(s, t, d) {   // whistles and a run of clicks
    s.tone(d, t, { f: [2200, 4800, 3200], dur: 0.35, gain: 0.12, a: 0.03 }); s.tone(d, t + 0.4, { f: [3000, 5200, 2600], dur: 0.3, gain: 0.1, a: 0.03 });
    for (let i = 0; i < 12; i++) s.noise(d, t + 0.75 + i * 0.045 * (1 - i * 0.03), { white: true, f: 6000, q: 5, dur: 0.02, a: 0.002, gain: 0.2 });
  },
  whale(s, t, d) { s.tone(d, t, { f: [85, 150, 110], dur: 2.4, a: 0.4, gain: 0.3, vib: [4, 3] }); s.tone(d, t, { f: [170, 300, 220], dur: 2.4, a: 0.4, gain: 0.1, vib: [4, 6] }); },
  thump(s, t, d) { s.tone(d, t, { f: [90, 40], dur: 0.5, gain: 0.5 }); s.noise(d, t, { filter: 'lowpass', f: 300, dur: 0.4, gain: 0.3 }); },   // something big under the water
  hare(s, t, d) { s.tone(d, t, { type: 'triangle', f: [1800, 2600, 1500], dur: 0.15, gain: 0.2 }); },
  bloop(s, t, d) { s.tone(d, t, { f: [300, 620], dur: 0.18, gain: 0.25, a: 0.02 }); },

  // ---------- things on the island ----------
  knock(s, t, d) { for (let i = 0; i < 3; i++) { s.tone(d, t + i * 0.16, { f: [230, 120], dur: 0.12, a: 0.002, gain: 0.45 }); s.noise(d, t + i * 0.16, { white: true, f: 900, q: 1, dur: 0.05, a: 0.002, gain: 0.2 }); } },   // knock, knock, knock
  clunk(s, t, d) { s.tone(d, t, { f: [170, 85], dur: 0.2, a: 0.003, gain: 0.5 }); s.noise(d, t, { white: true, f: 700, dur: 0.06, a: 0.002, gain: 0.2 }); },
  stone(s, t, d) { s.tone(d, t, { f: [70, 45], dur: 0.6, gain: 0.5 }); s.noise(d, t, { filter: 'lowpass', f: 250, dur: 0.5, gain: 0.3 }); SOUNDS.hare(s, t + 0.5, d); },
  horn(s, t, d) { s.tone(d, t, { type: 'sawtooth', f: [98, 98], dur: 1.4, a: 0.15, gain: 0.3, lp: 500 }); s.tone(d, t, { type: 'sawtooth', f: [123, 123], dur: 1.4, a: 0.15, gain: 0.22, lp: 500 }); },   // a foghorn
  clang(s, t, d) { [[520, 0.25, 1.8], [783, 0.12, 1.3], [1180, 0.06, 0.9]].forEach(p => s.tone(d, t, { f: p[0], dur: p[2], a: 0.003, gain: p[1] })); },   // the buoy's bell
  leaves(s, t, d) { s.noise(d, t, { white: true, f: [2500, 4500], q: 0.8, dur: 0.8, a: 0.12, gain: 0.22, trem: [11, 0.5] }); },
  needles(s, t, d) { s.noise(d, t, { white: true, f: [1800, 2800], q: 0.8, dur: 0.9, a: 0.15, gain: 0.22, trem: [9, 0.5] }); },
  rustle(s, t, d) { s.noise(d, t, { white: true, f: [3000, 5000], q: 1.2, dur: 0.4, a: 0.05, gain: 0.18, trem: [14, 0.6] }); },
  flap(s, t, d) { s.noise(d, t, { white: true, f: 700, q: 1.2, dur: 0.5, a: 0.02, gain: 0.35, trem: [14, 0.9] }); },   // cloth in the wind
  flutter(s, t, d) { s.noise(d, t, { white: true, f: [900, 1600, 900], q: 2, dur: 0.7, a: 0.04, gain: 0.25, trem: [18, 0.8] }); },
  burner(s, t, d) { for (let i = 0; i < 2; i++) { s.noise(d, t + i * 0.7, { f: [400, 900], q: 0.6, dur: 0.6, a: 0.08, gain: 0.35 }); s.noise(d, t + i * 0.7, { filter: 'lowpass', f: 200, dur: 0.6, a: 0.08, gain: 0.25 }); } },   // the burner's roar
  engine(s, t, d) { s.tone(d, t, { type: 'sawtooth', f: [75, 110, 90], dur: 1.6, a: 0.15, gain: 0.18, lp: 700, trem: [38, 0.6] }); s.tone(d, t, { type: 'square', f: [150, 220, 180], dur: 1.6, a: 0.15, gain: 0.05, lp: 800, trem: [38, 0.6] }); }
};
