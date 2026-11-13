/**
 * Turns raw mouse, finger and pen events into a few intentions, and tells a handler about them:
 *
 *   tap(x, y)            a click or a finger tap
 *   hover(x, y)          the pointer moved over the screen
 *   leave()              the pointer left it
 *   pan(dx, dy)          the view is being dragged by this many pixels
 *   zoom(factor, x, y, instant)   zoom about a point (wheel, pinch, double-tap)
 *   key(key)             a key was pressed
 *   dragging(isDragging) a drag started or ended
 *   isZoomed()           asked: is the view zoomed in? (a press then waits to see whether it becomes a drag)
 *   zoomLevel()          asked: how far is it zoomed in? (a double tap zooms in, or back out)
 *
 * A mouse press on the whole island is a tap at once. A finger always waits for the release, so a pinch or a pan never taps.
 */
export class Input {
  static DRAG_PIXELS = 5;         // how far a press must move to become a drag
  static DOUBLE_TAP_MS = 320;
  static DOUBLE_TAP_PIXELS = 30;

  constructor(target, handler) {
    this.target = target; this.handler = handler;
    this.pointers = new Map();    // the fingers (or mouse) currently down
    this.press = null;            // { x, y, lastX, lastY, dragged, deferred }
    this.pinch = null;            // [midX, midY, distance] while two fingers are down
    this.lastTap = null;
    this.abort = new AbortController();
  }

  start() {
    const on = (type, fn, options) => this.target.addEventListener(type, fn, { ...options, signal: this.abort.signal });
    on('pointerdown', e => this.#down(e));
    on('pointermove', e => this.#move(e));
    on('pointerup', e => this.#up(e));
    on('pointercancel', e => this.#up(e));
    on('wheel', e => { e.preventDefault(); const px = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; this.handler.zoom(Math.exp(-e.deltaY * px * 0.0015), e.clientX, e.clientY, false); }, { passive: false });
    on('keydown', e => this.handler.key(e.key));
    on('contextmenu', e => e.preventDefault());
    this.target.document?.addEventListener('mouseleave', () => { this.handler.leave(); this.press = null; this.handler.dragging(false); }, { signal: this.abort.signal });
    return this;
  }
  stop() { this.abort.abort(); }

  #midpoint() {
    const [a, b] = [...this.pointers.values()];
    return [(a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(a.x - b.x, a.y - b.y)];
  }

  #down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) { this.press = null; this.pinch = this.#midpoint(); return; }
    if (this.pointers.size > 2) return;
    const touch = e.pointerType !== 'mouse';
    if (e.pointerType === 'touch') this.#doubleTap(e);
    this.press = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, dragged: false, deferred: this.handler.isZoomed() || touch };
    if (!this.press.deferred) this.handler.tap(e.clientX, e.clientY);
  }

  /** A quick second tap in the same place zooms in, or back out. */
  #doubleTap(e) {
    const last = this.lastTap;
    if (last && e.timeStamp - last.time < Input.DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < Input.DOUBLE_TAP_PIXELS) {
      const level = this.handler.zoomLevel();
      this.handler.zoom(level > 1.5 ? 1 / level : 2.5, e.clientX, e.clientY, false);   // in when whole, back out when already in
      this.lastTap = null;
    } else this.lastTap = { time: e.timeStamp, x: e.clientX, y: e.clientY };
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (this.pinch && this.pointers.size === 2) {
      const m = this.#midpoint();
      this.handler.zoom(m[2] / (this.pinch[2] || m[2]), m[0], m[1], true); this.handler.pan(m[0] - this.pinch[0], m[1] - this.pinch[1]);
      this.pinch = m; return;
    }
    if (e.pointerType !== 'mouse' && !p) return;
    const press = this.press;
    if (press?.deferred) {
      if (!press.dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) > Input.DRAG_PIXELS) { press.dragged = true; this.handler.dragging(true); }
      if (press.dragged) { this.handler.pan(e.clientX - press.lastX, e.clientY - press.lastY); press.lastX = e.clientX; press.lastY = e.clientY; this.handler.leave(); return; }
    }
    this.handler.hover(e.clientX, e.clientY);
  }

  #up(e) {
    const had = this.pointers.delete(e.pointerId);
    if (!had && e.pointerType !== 'mouse') return;
    if (this.pinch) {   // one finger left after a pinch carries on as a pan, never as a tap
      if (this.pointers.size < 2) {
        this.pinch = null;
        const rest = [...this.pointers.values()][0];
        if (rest) this.press = { x: rest.x, y: rest.y, lastX: rest.x, lastY: rest.y, dragged: true, deferred: true };
      }
      return;
    }
    const press = this.press; this.press = null;
    if (press?.deferred && !press.dragged) this.handler.tap(e.clientX, e.clientY);
    this.handler.dragging(false);
    if (e.pointerType !== 'mouse') this.handler.leave();
  }
}
