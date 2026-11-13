const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * The sound that is always there while sound is on: waves that swell and draw back with quiet gaps between,
 * and a gull calling now and then (rarely, so it stays a pleasure), heard from where a gull really is.
 */
export class Ambience {
  /**
   * @param {import('./audio-engine.js').AudioEngine} engine
   * @param {(name: string, options?: object) => void} play plays a named sound
   * @param {() => number} gullPan where across the screen a gull is, -1 to 1
   */
  constructor(engine, play, gullPan = () => 0) {
    this.engine = engine; this.play = play; this.gullPan = gullPan;
    this.timers = []; this.sea = null;
  }

  start() {
    this.stop();
    this.#buildSea();
    this.#swell();
    this.#later(() => this.#callGull(), rand(6, 16));
  }
  stop() { this.timers.forEach(clearTimeout); this.timers = []; }

  #later(fn, seconds) { this.timers.push(setTimeout(fn, seconds * 1000)); }

  /** The sea: a low rumble and a brighter hiss of foam, each with its own swell. Built once. */
  #buildSea() {
    if (this.sea) return;
    const { ctx, brown, master } = this.engine;
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 520;
    const high = ctx.createBiquadFilter(); high.type = 'bandpass'; high.frequency.value = 1900; high.Q.value = 0.5;
    const rumble = ctx.createGain(); rumble.gain.value = 0.05;
    const hiss = ctx.createGain(); hiss.gain.value = 0.01;
    src.connect(low); low.connect(rumble); rumble.connect(master);
    src.connect(high); high.connect(hiss); hiss.connect(master);
    src.start();
    this.sea = { rumble, hiss };
  }

  /** One wave rolls in and draws back; then the sea is quiet for a while. */
  #swell() {
    if (this.engine.live) {
      const { rumble, hiss } = this.sea, t = this.engine.now, peak = rand(0.22, 0.42), rise = rand(1.6, 2.6);
      rumble.gain.setTargetAtTime(peak, t, rise * 0.45); rumble.gain.setTargetAtTime(0.045, t + rise, 1.7);
      hiss.gain.setTargetAtTime(peak * 0.3, t + rise * 0.6, 0.5); hiss.gain.setTargetAtTime(0.008, t + rise + 0.7, 1.5);
    }
    this.#later(() => this.#swell(), Math.random() < 0.2 ? rand(13, 20) : rand(6.5, 10.5));
  }

  #callGull() {
    this.play('gull', { calm: true, pan: this.gullPan() });
    this.#later(() => this.#callGull(), rand(25, 70));
  }
}
