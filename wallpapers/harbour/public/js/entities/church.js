// The church behind the town: the island's second landmark, drawn like the lighthouse, standing upright and seen from
// slightly to the south. A white nave under a slate roof whose two slopes are lit differently, a square bell tower at one
// end with a pointed spire and a gold cross, arched windows along the nave, a round window over the door, and a shadow on
// the ground. Zoomed in, the bell hangs in the tower's opening (it swings when the church is clicked).
// Click it and the bell rings three times from the tower and the gulls leave it. At night its windows are flat warm panes,
// like the houses' (see House.drawLights).
//
// Drawing: the building is painted once onto a small canvas of its own (a sprite) and only copied to the screen each
// frame; it is painted again when it is shown clearly bigger (zoomed in), up to MAX_SPRITE pixels. Only the shadow (it
// turns with the sun), the bell and the lit panes are drawn live: a handful of fills.
import { TAU, shade, disc, Entity } from '../core/index.js';
import { Gull } from './gulls.js';
import { WindowLights } from '../engine/window-lights.js';

// All sizes in world units, in the church's own frame: x along the nave (the tower at the -x end), y up the screen
// (negative is up), 0 at the foot of the south wall.
const BASE = 0.012;                              // the foot of the south wall lies this far below the church's x, y (its middle)
const TX0 = -0.042, TX1 = -0.023, TH = 0.046;    // the tower's front face: left, right, height
const SIDE = 0.004;                              // how much of the tower's shaded east side shows
const NX0 = TX1, NX1 = 0.038, WH = 0.0125;       // the nave's south wall: left, right, height
const S1 = 0.011, S2 = 0.0055;                   // the roof as seen: the south slope (towards the viewer) and the north slope beyond the ridge
const TC = (TX0 + TX1) / 2;                      // the tower's middle
const APEX = [(TX0 + TX1 + SIDE) / 2, -TH - 0.027];   // the spire's point
const WINDOWS = [-0.0125, -0.0015, 0.0095, 0.0205, 0.0315];   // the nave's arched windows (their middles)
const WIN = { foot: -0.0024, w: 0.003, h: 0.0068 };
const ROSE = { x: TC, y: -0.0185, r: 0.0022 };   // the round window over the door
const BELFRY = { x: TC, foot: -0.0335, w: 0.0068, h: 0.0088 };   // the opening the bell hangs in
const BOX = { x0: -0.048, x1: 0.048, y0: -0.084, y1: 0.004 };  // what the sprite holds (wide enough either way round)

const WALL = '#f6f1e6', WALL_SIDE = '#cfc8b9', STONE = '#b9b3a6', TRIM = '#ddd6c6';
const SLATE_LIT = '#8795a2', SLATE = '#5f6e7b', SLATE_DARK = '#4c5a66';
const GLASS = '#3d5564', DOOR = '#5a4334', DARK = '#27323c', GOLD = '#e8b84a', BRONZE = '#c9973a';
const LINE = 'rgba(34,48,62,0.5)';               // the outline
const PANE = 'rgb(255, 222, 140)';               // a lit window: the houses' flat warm pane
const DUSK = 0.3;                                // the darkness at which the windows come on

/** An arched opening as a path: `w` wide, `h` tall, standing on y = foot, its middle at x. */
function arch(c, x, foot, w, h) {
  const r = w / 2;
  c.beginPath(); c.moveTo(x - r, foot); c.lineTo(x - r, foot - h + r); c.arc(x, foot - h + r, r, Math.PI, 0); c.lineTo(x + r, foot); c.closePath();
}
const box = (c, x, y, w, h, fill) => { c.fillStyle = fill; c.fillRect(x, y, w, h); };
const tri = (c, ax, ay, bx, by, px, py, fill) => { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(px, py); c.closePath(); c.fillStyle = fill; c.fill(); };

/**
 * Paints the whole building (no shadow, no bell, unlit windows) in its own frame: the tower on the left, the origin at
 * the foot of the south wall under the church's middle. `c` is any 2D context already scaled to world units.
 * Not called per frame: Church keeps the result as a sprite. Call it directly for a still picture (a gallery, a proof).
 */
export function paintChurch(c) {
  const len = NX1 - NX0, eave = -WH, ridge = -WH - S1, back = ridge - S2;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // the nave's roof: the far slope catches the light, the near one is in its own shade
  box(c, NX0, back, len, S2, SLATE_LIT); box(c, NX0, ridge, len, S1, SLATE);
  c.strokeStyle = 'rgba(0,0,0,0.09)'; c.lineWidth = 0.0005;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(NX0, ridge + S1 * i / 4); c.lineTo(NX1, ridge + S1 * i / 4); c.stroke(); }   // courses of slate
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.0009; c.beginPath(); c.moveTo(NX0, ridge); c.lineTo(NX1, ridge); c.stroke();   // the ridge
  box(c, NX1 - 0.0013, back, 0.0013, S1 + S2, TRIM);                                     // the east gable's coping
  // the south wall, the shade under the eave, a stone footing
  box(c, NX0, eave, len, WH, WALL); box(c, NX0, eave, len, 0.0013, shade(0.2)); box(c, NX0, -0.0017, len, 0.0017, STONE);
  for (let i = 0; i < WINDOWS.length; i++) {
    const x = WINDOWS[i];
    if (i) box(c, (x + WINDOWS[i - 1]) / 2 - 0.0006, eave + 0.0013, 0.0012, WH - 0.0013, 'rgba(22,48,70,0.1)');   // a buttress between two windows
    arch(c, x, WIN.foot, WIN.w + 0.001, WIN.h + 0.0006); c.fillStyle = TRIM; c.fill();                          // the stone surround
    arch(c, x, WIN.foot, WIN.w, WIN.h); c.fillStyle = GLASS; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.0003; c.beginPath(); c.moveTo(x, WIN.foot); c.lineTo(x, WIN.foot - WIN.h); c.stroke();   // the mullion
  }
  c.strokeStyle = LINE; c.lineWidth = 0.0005; c.strokeRect(NX0, back, len, S1 + S2 + WH);
  // the tower: its shaded east side above the nave's roof, then the front with one wash of light and shade across it
  box(c, TX1, -TH, SIDE, TH + back, WALL_SIDE);
  box(c, TX0, -TH, TX1 - TX0, TH, WALL);
  const wash = c.createLinearGradient(TX0, 0, TX1, 0); wash.addColorStop(0, 'rgba(255,255,255,0.25)'); wash.addColorStop(0.5, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(22,48,70,0.16)');
  box(c, TX0, -TH, TX1 - TX0, TH, wash);
  box(c, TX0, -0.0017, TX1 - TX0, 0.0017, STONE);
  box(c, TX0, -0.0308, TX1 - TX0, 0.0008, TRIM);                                         // a string course under the belfry
  // the door, with the round window over it
  arch(c, TC, 0, 0.0064, 0.0092); c.fillStyle = TRIM; c.fill();
  arch(c, TC, 0, 0.005, 0.0084); c.fillStyle = DOOR; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.0003; c.beginPath(); c.moveTo(TC, 0); c.lineTo(TC, -0.0084); c.stroke();
  disc(c, TC + 0.0007, -0.0036, 0.00028, GOLD);
  disc(c, ROSE.x, ROSE.y, ROSE.r + 0.0008, TRIM); disc(c, ROSE.x, ROSE.y, ROSE.r, GLASS);
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.0003; c.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.moveTo(ROSE.x - Math.cos(a) * ROSE.r, ROSE.y - Math.sin(a) * ROSE.r); c.lineTo(ROSE.x + Math.cos(a) * ROSE.r, ROSE.y + Math.sin(a) * ROSE.r); }
  c.stroke();
  // the belfry's opening (the bell is drawn live, over this)
  arch(c, BELFRY.x, BELFRY.foot, BELFRY.w + 0.0012, BELFRY.h + 0.0007); c.fillStyle = TRIM; c.fill();
  arch(c, BELFRY.x, BELFRY.foot, BELFRY.w, BELFRY.h); c.fillStyle = DARK; c.fill();
  box(c, BELFRY.x - BELFRY.w / 2 - 0.0008, BELFRY.foot, BELFRY.w + 0.0016, 0.0008, TRIM);  // its sill
  c.strokeStyle = LINE; c.lineWidth = 0.0005; c.strokeRect(TX0, -TH, TX1 - TX0, TH);
  c.beginPath(); c.moveTo(TX1, -TH); c.lineTo(TX1 + SIDE, -TH); c.lineTo(TX1 + SIDE, back); c.stroke();
  // the cornice and the spire: two faces, lit and shaded, and a bright edge between them
  const top = -TH - 0.0014;
  tri(c, TX1 - 0.0002, top, TX1 + SIDE + 0.0007, top, APEX[0], APEX[1], SLATE_DARK);
  tri(c, TX0 - 0.0007, top, TX1 - 0.0002, top, APEX[0], APEX[1], SLATE_LIT);
  c.strokeStyle = 'rgba(0,0,0,0.1)'; c.lineWidth = 0.0004;
  for (let i = 1; i < 5; i++) { const u = i / 5, y = top + (APEX[1] - top) * u; c.beginPath(); c.moveTo(TX0 - 0.0007 + (APEX[0] - TX0 + 0.0007) * u, y); c.lineTo(TX1 + SIDE + 0.0007 + (APEX[0] - TX1 - SIDE - 0.0007) * u, y); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.0006; c.beginPath(); c.moveTo(TX1 - 0.0002, top); c.lineTo(APEX[0], APEX[1]); c.stroke();
  c.strokeStyle = LINE; c.lineWidth = 0.0005; c.beginPath(); c.moveTo(TX0 - 0.0007, top); c.lineTo(APEX[0], APEX[1]); c.lineTo(TX1 + SIDE + 0.0007, top); c.stroke();
  box(c, TX0 - 0.001, top, TX1 - TX0 + SIDE + 0.002, 0.0016, TRIM);
  c.strokeRect(TX0 - 0.001, top, TX1 - TX0 + SIDE + 0.002, 0.0016);
  // the cross
  c.strokeStyle = '#7a5a1c'; c.lineWidth = 0.0015; c.beginPath(); c.moveTo(APEX[0], APEX[1] + 0.001); c.lineTo(APEX[0], APEX[1] - 0.0072); c.moveTo(APEX[0] - 0.0021, APEX[1] - 0.0048); c.lineTo(APEX[0] + 0.0021, APEX[1] - 0.0048); c.stroke();
  c.strokeStyle = GOLD; c.lineWidth = 0.0009; c.stroke();
  disc(c, APEX[0], APEX[1] + 0.0004, 0.0009, GOLD);
}

/**
 * Paints the bell in the belfry's opening, swung by `swing` radians about its headstock. Same frame as paintChurch.
 * Cheap (three small fills), so it can be drawn every frame over the sprite.
 */
export function paintBell(c, swing = 0) {
  const top = BELFRY.foot - BELFRY.h + 0.0018;
  c.save(); c.translate(BELFRY.x, top); c.rotate(swing);
  c.fillStyle = BRONZE; c.beginPath();
  c.moveTo(-0.0009, 0.0002); c.quadraticCurveTo(-0.0012, 0.0028, -0.0024, 0.0046); c.lineTo(0.0024, 0.0046); c.quadraticCurveTo(0.0012, 0.0028, 0.0009, 0.0002); c.closePath(); c.fill();
  c.fillStyle = GOLD; c.fillRect(-0.0024, 0.0042, 0.0048, 0.0006);     // the lip catches the light
  disc(c, 0, 0.0052, 0.0006, '#6d4e1a');                                  // the clapper
  c.restore();
  c.fillStyle = '#4a3a2c'; c.fillRect(BELFRY.x - BELFRY.w / 2, top - 0.0005, BELFRY.w, 0.0008);   // the beam it hangs from
}

export class Church extends Entity {
  static passes = { upright: 'draw', lights: 'drawLights' };
  static clicks = 'one';
  static MAX_SPRITE = 1024;   // the longest side of its sprite, in pixels

  constructor(world, o) {   // o: x, y, a (which way the nave runs: it only decides at which end the tower stands)
    super(world); Object.assign(this, o); this.pop = 0;
    this.side = Math.cos(this.a ?? 0) >= 0 ? 1 : -1;   // 1: the tower at the west end (the left), -1: at the right
    /** Where the bell is, in world units: the rings and the gulls start there. */
    this.bell = [this.x + this.side * BELFRY.x, this.y + BASE + BELFRY.foot - BELFRY.h / 2];
    /** The middles of the windows that light up, in world units (the nave's, then the round one). */
    this.windows = [...WINDOWS.map(x => [this.x + this.side * x, this.y + BASE + WIN.foot - WIN.h / 2]), [this.x + this.side * ROSE.x, this.y + BASE + ROSE.y]];
    // each window has its own evening and night, like the houses' (see WindowLights)
    this.lights = this.windows.map((p, n) => (world.windowLights ??= new WindowLights()).add(p[0], p[1], n));
  }

  /** How bright window `n` is now (0..1): its own times by the clock, and only once it is dusk, like the houses' panes. */
  windowLight(n) {
    const clock = this.world?.skyClock, hour = clock ? clock.minutes() / 60 : 0;
    return this.world.windowLights.level(this.lights[n], hour) * Math.min(1, this.darkness / DUSK);
  }

  /** The lit windows as flat warm panes in the windows' own shapes (no halo), on the lights canvas. */
  drawLights(c) {
    if (this.darkness <= 0) return;
    c.globalCompositeOperation = 'source-over'; c.translate(this.x, this.y + BASE); c.scale(this.side, 1);
    c.fillStyle = PANE;
    for (let i = 0; i <= WINDOWS.length; i++) {
      const a = this.windowLight(i);
      if (a <= 0.01) continue;
      c.globalAlpha = a;
      if (i < WINDOWS.length) { arch(c, WINDOWS[i], WIN.foot, WIN.w, WIN.h); c.fill(); }
      else { c.beginPath(); c.arc(ROSE.x, ROSE.y, ROSE.r, 0, TAU); c.fill(); }
    }
  }

  update(dt) { this.pop = Math.max(0, this.pop - dt * 1.5); }
  hit(x, y) { const dx = (x - this.x) * this.side, dy = y - this.y - BASE; return dx > TX0 - 0.003 && dx < NX1 + 0.003 && dy < 0.004 && dy > (dx < TX1 + SIDE ? APEX[1] - 0.008 : -WH - S1 - S2 - 0.003); }
  click() {
    const w = this.world, [bx, by] = this.bell; this.pop = 1;
    for (let i = 0; i < 3; i++) w.ring(bx, by, i * 0.45);
    for (let i = 0; i < 3 && w.count(Gull) < 12; i++) { const b = w.add(new Gull(w, bx, by, Math.random() * TAU)); b.rush = 1.5; }
  }

  /** The sprite, painted again when it is missing or shown clearly bigger than it was painted for. */
  sprite(shown) {
    const long = Math.max(BOX.x1 - BOX.x0, BOX.y1 - BOX.y0), want = Math.min(shown, Church.MAX_SPRITE / long);
    if (this.canvas && this.spritePpu >= want * 0.98) return this.canvas;
    const ppu = Math.min(want * 1.3, Church.MAX_SPRITE / long), canvas = this.canvas ??= document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((BOX.x1 - BOX.x0) * ppu)); canvas.height = Math.max(1, Math.round((BOX.y1 - BOX.y0) * ppu));   // sizing it also wipes it
    const c = canvas.getContext('2d');
    c.setTransform(ppu, 0, 0, ppu, -BOX.x0 * ppu, -BOX.y0 * ppu);
    paintChurch(c);
    this.spritePpu = ppu;
    return canvas;
  }

  /** The shadow on the ground, away from the sun: the nave's, the tower's, and the spire's running out to a point. */
  drawShadow(c) {
    const f = this.side, x = this.x, y = this.y + BASE;
    const nave = this.castShadow(0.026), body = this.castShadow(0.06), tip = this.castShadow(0.095);
    if (nave.a <= 0) return;
    c.fillStyle = shade(0.26 * nave.a); c.beginPath();
    // the nave: its footprint (a strip behind the south wall) pushed away from the sun
    c.moveTo(x + f * NX0, y); c.lineTo(x + f * NX1, y); c.lineTo(x + f * NX1 + nave.x, y + nave.y); c.lineTo(x + f * NX1 + nave.x, y + nave.y - 0.007); c.lineTo(x + f * NX0 + nave.x, y + nave.y - 0.007); c.lineTo(x + f * NX0, y - 0.007); c.closePath();
    // the tower and its spire
    c.moveTo(x + f * TX0, y); c.lineTo(x + f * (TX1 + SIDE), y); c.lineTo(x + f * (TX1 + SIDE) + body.x, y + body.y); c.lineTo(x + f * APEX[0] + tip.x, y + tip.y); c.lineTo(x + f * TX0 + body.x, y + body.y); c.closePath();
    c.fill();
  }

  draw(c) {
    const w = this.world, v = w?.viewport, grow = 1 + 0.12 * this.pop * Math.sin(this.pop * 10);
    this.drawShadow(c);
    const shown = (v ? v.dpr * v.scale * (w.camera?.zoom ?? 1) : 4000) * this.scale;   // screen pixels to a world unit
    c.translate(this.x, this.y + BASE); c.scale(this.side * grow, grow);                // it swells from its foot when rung
    c.drawImage(this.sprite(shown), BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);
    if (shown > 2500 || this.pop > 0) paintBell(c, 0.55 * this.pop * Math.sin(this.pop * 14));   // too small to see at normal zoom unless it swings
  }
}
