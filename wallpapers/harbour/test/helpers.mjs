// Shared test helpers. Import this file FIRST in any test that loads entities: it gives Node the few browser things they use.

// Entities build Path2D shapes when their file loads; Node has no Path2D, and a stand-in is enough here.
globalThis.Path2D ??= class Path2D { constructor(d) { this.d = d; } };

/** A drawing context that accepts every call and draws nothing: enough to run all the drawing code. */
export function fakeContext() {
  const gradient = { addColorStop() {} };
  const own = { createLinearGradient: () => gradient, createRadialGradient: () => gradient, measureText: () => ({ width: 0 }) };
  return new Proxy(own, { get: (t, key) => (key in t ? t[key] : () => {}), set: (t, key, value) => { t[key] = value; return true; } });
}

// Something paints on small canvases it makes itself (the sleek shark): a stand-in page that hands out fake ones.
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext() }) };

/** A sound that records what was played instead of making noise. */
export function recordingSound() {
  return { live: true, on: true, played: [], play(name, options) { this.played.push(name); } };
}

/** Runs `fn` with console.log silenced (the world announces each seed). */
export function quietly(fn) {
  const log = console.log; console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

/** The size of the window the golden fingerprints were taken in. */
export const GOLDEN_SIZE = { width: 2124, height: 1015 };
