/** The small status panel shown with ?debug: frames per second, how many things there are, the zoom, and any errors. */
export class DebugPanel {
  constructor(document) {
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:10px;top:10px;margin:0;padding:6px 9px;font:11px/1.35 Consolas,monospace;color:#fff;background:rgba(10,30,45,.55);border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(this.el);
    this.at = performance.now(); this.frames = 0; this.shown = 0;
  }

  /** Call once per frame with the current facts; it refreshes the text twice a second. */
  update(now, { entities, zoom, soundOn, errors, clock }) {
    this.frames++;
    if (now - this.at < 500) return;
    const fps = Math.round((this.frames - this.shown) * 1000 / (now - this.at));
    this.at = now; this.shown = this.frames;
    this.el.textContent = `Harbour debug\n${fps} fps   ${entities} entities   zoom ${zoom.toFixed(2)}\nsound ${soundOn ? 'on' : 'off'}   clock ${clock}\n${errors.length ? 'ERRORS\n' + errors.slice(-3).join('\n') : 'no errors'}`;
  }
}
