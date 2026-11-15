// A cloud drifting on the wind, with its shadow on the island below. Click it and it blows away; a new one drifts in.
//
// There are two kinds. A fair cloud is a heap of round lumps in three flat tones. A storm cloud (`storm` true) is another
// shape: wide and low, a row of heaped lumps with smaller ones hanging under it, so it is ragged and rounded all the way
// round (no straight edge anywhere), solid dark slate in layers that get darker towards the base, with a lighter rim
// along the top where the light catches it.
//
// It asks the weather (world.weather) how grey it is, how big it grows and how fast it drifts, and the time of day
// (world.day) how it is lit: white by day, dark blue-grey at night, lit only by the moon. At night it also covers the lights
// below it (see drawShade): the lights are drawn on their own canvas above the picture, so the cloud rubs them out there.
// How many clouds there are, and of which kind, is not its business: engine/cloud-bank.js adds them and sends them away.
//
// Drawing: the picture of a cloud is painted once onto a small canvas of its own (its sprite) and then only copied to the
// screen each frame, so a sky crowded with storm clouds costs one image per cloud. The sprite is painted again when the
// cloud is shown clearly bigger (zoomed in, or grown with the weather), so it stays sharp up to MAX_SPRITE pixels, and
// when its colours change (the light, the weather): a few clouds per frame, never all at once. Its shadow and its rubbing
// out of the night lights are plain one-colour shapes and stay vector.
import { TAU, SHADE, Entity, AIRBORNE } from '../core/index.js';

const CLEAR = { cover: 0, darkness: 0, speed: 1, size: 1 };      // the weather for a world without one (a bare test world)
const NOON = { darkness: 0, moonlight: 0 };
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
// three tones each (lit top, middle, underside), before the time of day's tint is put over the picture
const FAIR = [[255, 255, 255], [230, 236, 247], [213, 222, 239]];
const OVERCAST = [[186, 191, 201], [166, 172, 185], [146, 153, 168]];
// At night the whole picture then gets a mild blue light (Lighting, world.day.light), so these are picked to come out, AFTER
// that light, a blue-grey a step lighter than the night sea on screen (middle sea about (0.07, 0.25, 0.48)).
const NIGHT_NO_MOON = [[90, 122, 158], [74, 105, 142], [59, 88, 126]];
const NIGHT_MOON = [[91, 125, 172], [76, 108, 155], [60, 90, 138]];
// A storm cloud has four: the rim along its top, then three layers of slate, the darkest along the base. At night the
// layers come out, after the night light, darker than the night sea (a dark mass), and the rim lighter than it: with no
// moon just enough to show the outline, under a bright moon clearly lit.
const STORM = [[156, 164, 180], [84, 91, 108], [62, 68, 84], [43, 48, 62]];
const STORM_NO_MOON = [[84, 114, 150], [44, 64, 94], [35, 53, 81], [27, 43, 68]];
const STORM_MOON = [[128, 160, 204], [38, 56, 84], [30, 46, 71], [23, 37, 59]];

const SPRITE_MARGIN = 1.25;    // a sprite is painted this much bigger than shown, so a little growing does not repaint it
const REPAINTS_A_FRAME = 3;    // how many clouds may repaint for a change of colour in one frame

export class Cloud extends Entity {
  static passes = { skyShadow: 'drawShadow', clouds: 'draw', cloudShade: 'drawShade' };
  static clicks = 'top';
  static cullRadius = 0.5;   // a big cloud and its shadow
  static ownScale = true;   // it scales through its own size r, not about a point
  static MASK = 0.85;       // how much of a night light under a cloud it hides
  static MAX_SPRITE = 1024; // the longest side of a cloud's sprite, in pixels

  /**
   * The cloud's colours as [r, g, b], for the time of day and the weather: three for a fair cloud (lit top, middle,
   * underside), four for a storm cloud (rim, then three layers down to the base).
   * By day a fair cloud is greyer the more overcast it is. At night the canvas's night tint comes on top of these, so the
   * night tones are chosen to end up, after it, a dark blue-grey a little lighter than the night sea (lighter still under a
   * bright moon); a storm cloud's layers end up darker than that sea and its rim lighter.
   */
  static tones(day = NOON, weather = CLEAR, storm = false) {
    const d = day.darkness ?? 0, m = day.moonlight ?? 0;
    if (storm) return STORM.map((t, i) => mix(t, mix(STORM_NO_MOON[i], STORM_MOON[i], m), d).map(Math.round));
    const lit = FAIR.map((t, i) => mix(t, OVERCAST[i], weather.darkness));
    const night = NIGHT_NO_MOON.map((t, i) => mix(t, NIGHT_MOON[i], m).map(v => v * (1 - 0.06 * weather.darkness)));
    return lit.map((t, i) => mix(t, night[i], d).map(Math.round));
  }

  /**
   * The tones as fill styles. Worked out again only when the light or the weather changed (about once a second), not for
   * every cloud in every frame; and the very same list comes back while the colours are the same, so a cloud can tell by it
   * whether its sprite is still right.
   */
  static fills(day = NOON, weather = CLEAR, storm = false) {
    const k = Cloud.#keys[storm ? 1 : 0], d = day.darkness ?? 0, m = day.moonlight ?? 0, w = weather.darkness;
    if (k.fills && k.d === d && k.m === m && k.w === w) return k.fills;
    const fills = Cloud.tones(day, weather, storm).map(t => `rgb(${t.join(',')})`);
    k.d = d; k.m = m; k.w = w;
    if (!k.fills || fills.some((f, i) => f !== k.fills[i]) || Math.abs(d - k.night) > 0.02) { k.fills = fills; k.night = d; }   // night: the soft rim in the sprite follows it
    return k.fills;
  }
  static #keys = [{}, {}];
  static #frame = { at: -1, left: 0 };   // how many repaints for colour are left in this frame
  static #spare = [];                    // sprites of clouds that are gone, for the next ones

  constructor(world, rnd, x, y, storm = false) { super(world); this.storm = storm; this.shape(rnd); this.x = x; this.y = y; this.leaving = false; }

  /** A new outline for this cloud, of its kind. */
  shape(rnd) {
    if (this.storm) this.stormShape(rnd); else this.fairShape(rnd);
    this.alpha = 1; this.fade = false; this.measure(); this.spriteFills = null;
  }
  // A few large lumps and a ring of smaller ones on their edge: the outline carries the shape.
  fairShape(rnd) {
    const puffs = [{ x: 0, y: 0, r: 0.52 }], n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1, d = 0.5 + rnd() * 0.25 + Math.floor(i / 2) * 0.4; puffs.push({ x: s * d, y: (rnd() - 0.5) * 0.24, r: 0.36 - Math.floor(i / 2) * 0.08 + rnd() * 0.08 }); }
    const lumps = puffs.length;
    for (let i = 0; i < 5 + Math.floor(rnd() * 4); i++) { const base = puffs[Math.floor(rnd() * lumps)], a = rnd() * TAU; puffs.push({ x: base.x + Math.cos(a) * base.r * 0.9, y: base.y + Math.sin(a) * base.r * 0.8, r: 0.13 + rnd() * 0.12 }); }
    this.puffs = puffs; this.floor = undefined; this.r = 0.05 + rnd() * 0.05; this.speed = 0.005 + rnd() * 0.005;
  }
  // A long row of lumps, close enough to merge into one body, heaped higher in the middle; each hangs to its own depth, and
  // a few smaller lumps hang under the row, so the underside is ragged and round. Small ragged ones sit along the top.
  // Nothing reaches below the line y = 0 (the floor): every lump stays whole above it, so no edge is ever cut straight.
  stormShape(rnd) {
    const puffs = [], half = 1.25 + rnd() * 0.5, n = Math.round(half / 0.21) + 1;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), r = 0.26 + 0.16 * Math.sin(u * Math.PI) + rnd() * 0.07;
      puffs.push({ x: (u * 2 - 1) * half + (rnd() - 0.5) * 0.08, y: -r - 0.04 - rnd() * 0.14, r });
    }
    for (let i = 0; i < 6 + Math.floor(rnd() * 4); i++) {
      const base = puffs[Math.floor(rnd() * n)], a = Math.PI + rnd() * Math.PI;   // on the upper half of a lump
      puffs.push({ x: base.x + Math.cos(a) * base.r * 0.95, y: base.y + Math.sin(a) * base.r * 0.85, r: 0.1 + rnd() * 0.11 });
    }
    for (let i = 0; i < 4 + Math.floor(rnd() * 3); i++) {   // the ones hanging under the row, big enough to reach up into it
      const r = 0.15 + rnd() * 0.1;
      puffs.push({ x: (rnd() * 2 - 1) * half * 0.85, y: -r - rnd() * 0.04, r });
    }
    this.puffs = puffs; this.floor = 0; this.r = 0.12 + rnd() * 0.06; this.speed = 0.005 + rnd() * 0.005;
  }
  /** The box around all the lumps, in cloud-radii from its x, y, with room for the soft night rim: what its sprite holds. */
  measure() {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const p of this.puffs) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r); }
    if (this.floor !== undefined) y1 = Math.min(y1, this.floor);
    this.box = { x0: x0 - 0.08, x1: x1 + 0.08, y0: y0 - 0.08, y1: y1 + 0.08 };
  }
  get weather() { return this.world?.weather ?? CLEAR; }
  /** Its size on the screen: a fair cloud grows with the weather (small on a sunny day, large on a cloudy one). */
  get size() { return this.scale * this.r * (this.storm ? 1 : this.weather.size ?? 1); }

  /**
   * The outline of all the lumps together as one path, so it fills as one shape: each lump at (ox, oy) + its place times
   * `s`, moved by (dx, dy) cloud-radii and grown by m. A lump that reaches below the cloud's floor is cut off there (only
   * the moved or grown copies of a storm cloud do). Every lump is drawn the same way round: the path is filled by the
   * nonzero rule, and two lumps drawn opposite ways would leave a hole where they overlap.
   */
  trace(c, ox, oy, s, dx, dy, m) {
    const floor = this.floor === undefined ? Infinity : oy + this.floor * s;
    c.beginPath();
    for (const p of this.puffs) {
      const x = ox + (p.x + dx) * s, y = oy + (p.y + dy) * s, r = p.r * s * m, t = (floor - y) / r;
      if (t >= 1) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      else if (t > -1) { const a = Math.asin(t); c.moveTo(x - r * Math.cos(a), y + r * t); c.arc(x, y, r, Math.PI - a, TAU + a); c.closePath(); }   // over the top, from the floor back to the floor
    }
  }
  /** The outline where the cloud is, in world units. */
  outline(c, dx, dy, m) { this.trace(c, this.x, this.y, this.size, dx, dy, m); }
  hit(x, y) {
    const s = this.size;
    if (this.floor !== undefined && y > this.y + this.floor * s) return false;
    return this.puffs.some(p => Math.hypot(this.x + p.x * s - x, this.y + p.y * s - y) < p.r * s);
  }
  click(x, y) { this.world.burst(x, y, 12, 0.1, this.storm ? '150,158,174' : '255,255,255', 0.009, 0.9); }

  /** Is (x, y) outside the view by more than the cloud's own reach (times k)? */
  outside(x, y, k = 1) {
    const { hw, hh } = this.world, b = this.box, s = this.size * k;
    return x + b.x1 * s < -hw || x + b.x0 * s > hw || y + b.y1 * s < -hh || y + b.y0 * s > hh;
  }

  /**
   * Puts the cloud just outside the upwind edge, faded out, to fade in as it drifts on. `lane` (-1..1 across the wind, see
   * CloudBank) is the clear lane it keeps out of.
   */
  enter(lane = null) {
    const { hw, hh } = this.world, wind = this.world.wind, b = this.box, s = this.size * 0.9;   // 0.9: a sliver of it is in view, so it is not sent round again at once
    let across = Math.random() * 2 - 1;
    if (lane !== null && lane !== undefined && Math.abs(across - lane) < 0.25) across = lane + Math.sign(across - lane || 1) * (0.25 + Math.random() * 0.3);
    across = Math.max(-1, Math.min(1, across));
    if (Math.abs(wind[0]) * hh > Math.abs(wind[1]) * hw) { this.x = wind[0] > 0 ? -hw - b.x1 * s : hw - b.x0 * s; this.y = across * hh; }
    else { this.y = wind[1] > 0 ? -hh - b.y1 * s : hh - b.y0 * s; this.x = across * hw; }
    this.alpha = 0;
  }
  /** Puts the cloud at (x, y) in the sky, faded out, to fade in where it is: how a sky fills up when the weather turns. */
  form(x, y, quick = false) { this.x = x; this.y = y; this.alpha = 0; this.quick = quick; }
  /** The weather wants fewer clouds: this one fades as it drifts on, and does not come back. */
  leave(quick = false) { this.leaving = true; this.quick = quick; }   // quick: the viewer chose the weather, so it fades in about a second and a half (not eight)

  update(dt) {
    const w = this.world, wind = w.wind, push = w.windPush ?? 1;
    // faster when cloudier, and when it blows harder; a storm cloud goes with the wind more than a fair one
    const speed = this.speed * this.weather.speed * (this.storm ? 0.3 + 0.7 * push : 0.5 + 0.5 * push);
    this.x += wind[0] * speed * dt; this.y += wind[1] * speed * dt;
    if (this.leaving) this.alpha = Math.max(0, this.alpha - dt / (this.quick ? 1.5 : 8));   // eight seconds to fade away (a second and a half after the viewer's choice)
    else this.alpha += ((this.fade ? 0 : 1) - this.alpha) * Math.min(1, dt * (this.fade || this.quick ? 2.5 : this.storm ? 0.45 : 0.3));   // blown away quickly, fades in slowly (a storm cloud sooner: it is a solid mass)
    const out = this.outside(this.x, this.y);
    if (this.leaving && (out || this.alpha < 0.02)) { this.dead = true; if (this.canvas) { Cloud.#spare.push(this.canvas); this.canvas = null; } return; }
    if (out || (this.fade && this.alpha < 0.02)) { this.shape(Math.random); this.enter(this.storm ? null : w.cloudBank?.lane()); }   // a new one drifts in on the upwind side
  }
  // a storm cloud hangs lower: its shadow lies nearer to it, and is darker
  drawShadow(c) {
    const s = this.castShadow(this.storm ? 0.055 : 0.088, 0, AIRBORNE), r = this.size || 1;
    this.outline(c, s.x / r, s.y / r, 1);
    c.globalAlpha = (this.storm ? 0.3 : 0.2 + 0.1 * this.weather.darkness) * this.alpha * s.a; c.fillStyle = 'rgb(' + SHADE + ')'; c.fill();
  }

  /**
   * Paints the cloud's picture onto its sprite, `ppu` pixels to a cloud-radius.
   * A fair cloud: three flat tones, lit from the top left: the whole shape, then two shifted copies clipped to it.
   * A storm cloud: the whole shape in the rim's tone, fully opaque, then three copies clipped to it, each moved further
   * down (and a little to the right) and darker, so a light rim is left along the top and the dark gathers in the lumps
   * of the underside; the edge of each layer is the cloud's own lumpy outline, never a straight line.
   */
  paint(fills, ppu, night) {
    const b = this.box, canvas = this.canvas ??= Cloud.#spare.pop() ?? document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((b.x1 - b.x0) * ppu)); canvas.height = Math.max(1, Math.round((b.y1 - b.y0) * ppu));   // sizing it also wipes it
    const c = canvas.getContext('2d');
    c.setTransform(ppu, 0, 0, ppu, -b.x0 * ppu, -b.y0 * ppu);
    if (night > 0) { c.globalAlpha = 0.35 * night; c.fillStyle = fills[this.storm ? 0 : 1]; this.trace(c, 0, 0, 1, 0, 0, 1.07); c.fill(); }   // a soft rim, so it reads as a cloud and not a hole
    c.globalAlpha = this.storm ? 1 : 0.96 - 0.08 * night; c.fillStyle = fills[0];
    this.trace(c, 0, 0, 1, 0, 0, 1); c.fill(); c.clip();
    c.globalAlpha = 1;
    if (this.storm) {
      this.trace(c, 0, 0, 1, 0.03, 0.07, 0.98); c.fillStyle = fills[1]; c.fill();
      this.trace(c, 0, 0, 1, 0.08, 0.3, 0.97); c.fillStyle = fills[2]; c.fill();
      this.trace(c, 0, 0, 1, 0.14, 0.55, 0.95); c.fillStyle = fills[3]; c.fill();
    } else {
      this.trace(c, 0, 0, 1, 0.055, 0.08, 0.99); c.fillStyle = fills[1]; c.fill();
      this.trace(c, 0, 0, 1, 0.2, 0.27, 0.96); c.fillStyle = fills[2]; c.fill();
    }
    this.spriteFills = fills; this.spritePpu = ppu;
  }

  /** Copies the sprite to the screen, painting it first when it is missing, too small or too big, or (in turn) the wrong colours. */
  draw(c) {
    const w = this.world, v = w?.viewport, s = this.size, b = this.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const fills = Cloud.fills(w?.day, this.weather, this.storm);
    const shown = Math.min(s * (v ? v.dpr * v.scale * (w.camera?.zoom ?? 1) : 600), Cloud.MAX_SPRITE / Math.max(bw, bh));   // pixels to a cloud-radius on the screen
    let repaint = !this.spriteFills || this.spritePpu < shown * 0.98 || this.spritePpu > shown * 2.5;
    if (!repaint && this.spriteFills !== fills) {
      const f = Cloud.#frame, at = w?.clock ?? 0;
      if (f.at !== at) { f.at = at; f.left = REPAINTS_A_FRAME; }
      if (f.left > 0) { f.left--; repaint = true; }
    }
    if (repaint) this.paint(fills, Math.min(shown * SPRITE_MARGIN, Cloud.MAX_SPRITE / Math.max(bw, bh)), w?.day?.darkness ?? 0);
    c.globalAlpha = this.alpha;
    c.drawImage(this.canvas, this.x + b.x0 * s, this.y + b.y0 * s, bw * s, bh * s);
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
