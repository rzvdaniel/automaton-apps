// A cloud drifting on the wind, with its shadow on the island below. Click it and it blows away; a new one drifts in.
// Drawn as vector shapes (not a cached picture), so it stays sharp at any zoom.
//
// It asks the weather (world.weather) how grey it is, how big it grows and how fast it drifts, and the time of day
// (world.day) how it is lit: white by day, dark blue-grey at night, lit only by the moon. At night it also covers the lights
// below it (see drawShade): the lights are drawn on their own canvas above the picture, so the cloud rubs them out there.
// How many clouds there are is not its business: engine/cloud-bank.js adds them and sends them away.
import { TAU, SHADE, Entity, AIRBORNE } from '../core/index.js';

const CLEAR = { cover: 0, darkness: 0, speed: 1 };      // the weather for a world without one (a bare test world)
const NOON = { darkness: 0, moonlight: 0 };
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
// three tones each (lit top, middle, underside), before the time of day's tint is put over the picture
const FAIR = [[255, 255, 255], [230, 236, 247], [213, 222, 239]];
const OVERCAST = [[186, 191, 201], [166, 172, 185], [146, 153, 168]];
// At night the whole picture is then tinted dark blue (Lighting, world.day.light), so these are picked to come out, AFTER
// that tint, a dark blue-grey a little lighter than the night sea: they are far lighter here than they will look.
const NIGHT_NO_MOON = [[200, 210, 236], [172, 182, 210], [148, 158, 188]];
const NIGHT_MOON = [[214, 222, 244], [186, 196, 224], [160, 170, 200]];

export class Cloud extends Entity {
  static passes = { skyShadow: 'drawShadow', clouds: 'draw', cloudShade: 'drawShade' };
  static clicks = 'top';
  static cullRadius = 0.5;   // a big cloud and its shadow
  static ownScale = true;   // it scales through its own size r, not about a point
  static MASK = 0.85;       // how much of a night light under a cloud it hides

  /**
   * The cloud's three colours (lit top, middle, underside) as [r, g, b], for the time of day and the weather.
   * By day greyer the more overcast it is. At night the canvas's night tint comes on top of these, so the night tones are
   * chosen to end up, after it, a dark blue-grey a little lighter than the night sea (lighter still under a bright moon).
   */
  static tones(day = NOON, weather = CLEAR) {
    const lit = FAIR.map((t, i) => mix(t, OVERCAST[i], weather.darkness));
    const night = NIGHT_NO_MOON.map((t, i) => mix(t, NIGHT_MOON[i], day.moonlight ?? 0).map(v => v * (1 - 0.06 * weather.darkness)));
    return lit.map((t, i) => mix(t, night[i], day.darkness ?? 0).map(Math.round));
  }

  /**
   * The three tones as fill styles. Worked out again only when the light or the weather changed (about once a second), not
   * for every cloud in every frame.
   */
  static fills(day = NOON, weather = CLEAR) {
    const k = Cloud.#key, d = day.darkness ?? 0, m = day.moonlight ?? 0, w = weather.darkness;
    if (k.fills && k.d === d && k.m === m && k.w === w) return k.fills;
    Object.assign(k, { d, m, w, fills: Cloud.tones(day, weather).map(t => `rgb(${t.join(',')})`) });
    return k.fills;
  }
  static #key = {};

  constructor(world, rnd, x, y) { super(world); this.shape(rnd); this.x = x; this.y = y; this.leaving = false; }
  // A few large lumps and a ring of smaller ones on their edge: the outline carries the shape.
  shape(rnd) {
    const puffs = [{ x: 0, y: 0, r: 0.52 }], n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1, d = 0.5 + rnd() * 0.25 + Math.floor(i / 2) * 0.4; puffs.push({ x: s * d, y: (rnd() - 0.5) * 0.24, r: 0.36 - Math.floor(i / 2) * 0.08 + rnd() * 0.08 }); }
    const lumps = puffs.length;
    for (let i = 0; i < 5 + Math.floor(rnd() * 4); i++) { const base = puffs[Math.floor(rnd() * lumps)], a = rnd() * TAU; puffs.push({ x: base.x + Math.cos(a) * base.r * 0.9, y: base.y + Math.sin(a) * base.r * 0.8, r: 0.13 + rnd() * 0.12 }); }
    this.puffs = puffs; this.r = 0.05 + rnd() * 0.05; this.speed = 0.005 + rnd() * 0.005; this.alpha = 1; this.fade = false;
  }
  get weather() { return this.world?.weather ?? CLEAR; }
  /** Its size on the screen. */
  get size() { return this.scale * this.r; }
  // The outline of all the lumps together, moved by (dx, dy) cloud-radii and grown by m. One path, so it fills as one shape.
  outline(c, dx, dy, m) {
    const s = this.size; c.beginPath();
    this.puffs.forEach(p => { const x = this.x + (p.x + dx) * s, y = this.y + (p.y + dy) * s; c.moveTo(x + p.r * s * m, y); c.arc(x, y, p.r * s * m, 0, TAU); });
  }
  hit(x, y) { const s = this.size; return this.puffs.some(p => Math.hypot(this.x + p.x * s - x, this.y + p.y * s - y) < p.r * s); }
  click(x, y) { this.world.burst(x, y, 12, 0.1, '255,255,255', 0.009, 0.9); }

  /**
   * Puts the cloud just outside the upwind edge, faded out, to fade in as it drifts on. `lane` (-1..1 across the wind, see
   * CloudBank) is the clear lane it keeps out of.
   */
  enter(lane = null) {
    const { hw, hh } = this.world, wind = this.world.wind;
    let across = Math.random() * 2 - 1;
    if (lane !== null && lane !== undefined && Math.abs(across - lane) < 0.25) across = lane + Math.sign(across - lane || 1) * (0.25 + Math.random() * 0.3);
    across = Math.max(-1, Math.min(1, across));
    if (Math.abs(wind[0]) * hh > Math.abs(wind[1]) * hw) { this.x = -Math.sign(wind[0]) * (hw + this.r * 2.5); this.y = across * hh; }
    else { this.y = -Math.sign(wind[1]) * (hh + this.r * 1.9); this.x = across * hw; }
    this.alpha = 0;
  }
  /** The weather wants fewer clouds: this one fades slowly as it drifts away, and does not come back. */
  leave() { this.leaving = true; }

  update(dt) {
    const w = this.world, wind = w.wind, hw = w.hw, hh = w.hh, speed = this.speed * this.weather.speed;
    this.x += wind[0] * speed * dt; this.y += wind[1] * speed * dt;
    if (this.leaving) this.alpha = Math.max(0, this.alpha - dt / 40);   // forty seconds to fade away
    else this.alpha += ((this.fade ? 0 : 1) - this.alpha) * Math.min(1, dt * (this.fade ? 2.5 : 0.3));   // blown away quickly, fades in slowly
    const out = Math.abs(this.x) > hw + this.r * 2.6 || Math.abs(this.y) > hh + this.r * 2;
    if (this.leaving && (out || this.alpha < 0.02)) { this.dead = true; return; }
    if (out || (this.fade && this.alpha < 0.02)) { this.shape(Math.random); this.enter(w.cloudBank?.lane()); }   // a new one drifts in on the upwind side
  }
  drawShadow(c) { const s = this.castShadow(0.088, 0, AIRBORNE); this.outline(c, s.x / this.r, s.y / this.r, 1); c.globalAlpha = (0.2 + 0.1 * this.weather.darkness) * this.alpha * s.a; c.fillStyle = 'rgb(' + SHADE + ')'; c.fill(); }
  // three flat tones, lit from the top left: the whole shape, then two shifted copies clipped to it
  draw(c) {
    const [top, middle, under] = Cloud.fills(this.world?.day, this.weather);
    const night = this.world?.day?.darkness ?? 0;
    if (night > 0) { c.globalAlpha = 0.35 * night * this.alpha; c.fillStyle = middle; this.outline(c, 0, 0, 1.07); c.fill(); }   // a soft rim, so it reads as a cloud and not a hole
    c.globalAlpha = (0.96 - 0.08 * night) * this.alpha; c.fillStyle = top;
    this.outline(c, 0, 0, 1); c.fill(); c.clip();
    this.outline(c, 0.055, 0.08, 0.99); c.fillStyle = middle; c.fill();
    this.outline(c, 0.2, 0.27, 0.96); c.fillStyle = under; c.fill();
  }

  /** How much of a night light at (x, y) this cloud hides, 0..1. */
  dimAt(x, y) { return this.hit(x, y) ? Cloud.MASK * this.alpha : 0; }
  /**
   * On the lights canvas, after the lights: rubs out the lights under the cloud (MASK of them), so a window under a cloud
   * is mostly hidden and one in a gap still shines. Two steps: a slightly bigger, lighter rub first, so the edge is softer.
   */
  drawShade(c) {
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
    c.globalAlpha = 0.5 * Cloud.MASK * this.alpha; this.outline(c, 0, 0, 1.12); c.fill();   // the wider, lighter step
    c.globalAlpha = Cloud.MASK * this.alpha; this.outline(c, 0, 0, 1); c.fill();
  }
}
