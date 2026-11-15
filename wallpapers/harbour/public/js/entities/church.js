// The church behind the town: the island's second landmark, drawn like the houses (see house.js): seen from above at the
// same angle, with the same small upward offset for height. The nave is a long house: its two roof slopes lit like the
// houses' (the far one in the light), a strip of wall on the side facing the viewer, turned with the island by its angle
// `a`. At one end stands a square bell tower, taller by the same kind of upward offset, with a pyramid spire and a gold cross.
// Arched windows along the nave, a door and a round window in the tower, and the shadow cast away from the sun the way the
// houses' is (Entity.castShadow). Zoomed in, the bell hangs in the tower's opening (it swings when the church is clicked).
// Click it and the bell rings three times from the tower and the gulls leave it. At night its windows are flat warm panes,
// like the houses' (see House.drawLights).
//
// Drawing: the building is painted once onto a small canvas of its own (a sprite) and only copied to the screen each
// frame; it is painted again when it is shown clearly bigger (zoomed in), up to MAX_SPRITE pixels. Only the shadow (it
// turns with the sun), the bell and the lit panes are drawn live: a handful of fills.
import { TAU, shade, disc, Entity } from '../core/index.js';
import { Gull } from './gulls.js';
import { WindowLights } from '../engine/window-lights.js';

// All sizes in world units. The church has its own frame on the ground: u along the nave (the tower at the -u end), v across
// it, the origin at the middle of the whole footprint; `a` turns that frame on the island. Heights are drawn as the houses do:
// a point z above the ground is drawn z higher up the screen.
const NAVE = { u0: -0.021, u1: 0.04, v: 0.013, wall: 0.0075 };    // the nave: its footprint (v: half its depth) and wall height
const TOWER = { u0: -0.04, u1: -0.021, v: 0.0095, wall: 0.024 };  // the tower, the same way
const SPIRE = 0.026;                                              // the spire's height above the tower's top
const LIFT = 1.5;                                                 // a shadow reaches this many times the height it is cast by (the houses' 0.0084 for a 0.0055 wall)
const WINDOWS = [-0.01, 0.001, 0.012, 0.023, 0.034];              // the nave's arched windows (u of their middles)
const WIN = { foot: -0.0012, w: 0.0026, h: 0.0047 };              // in a wall's own frame: y is up from the ground (negative)
const TU = (TOWER.u0 + TOWER.u1) / 2;                             // the tower's middle
const DOOR = { w: 0.0042, h: 0.0064 };
const ROSE = { y: -0.0112, r: 0.0017 };                           // the round window over the door
const BELFRY = { foot: -0.0155, w: 0.0055, h: 0.0068 };           // the opening the bell hangs in

const WALL = '#f6f1e6', WALL_SIDE = '#cfc8b9', TRIM = '#ddd6c6';
const SLATE_LIT = '#8795a2', SLATE = '#5f6e7b', SLATE_DARK = '#4c5a66';
const GLASS = '#3d5564', DOOR_COLOR = '#5a4334', DARK = '#27323c', GOLD = '#e8b84a', BRONZE = '#c9973a';
const LINE = 'rgba(34,48,62,0.45)';              // the outline
const PANE = 'rgb(255, 222, 140)';               // a lit window: the houses' flat warm pane
const DUSK = 0.3;                                // the darkness at which the windows come on
const MARGIN = 0.003;                            // how far outside the drawing a click still counts

/** An arched opening as a path: `w` wide, `h` tall, standing on y = foot, its middle at x. */
function arch(c, x, foot, w, h) {
  const r = w / 2;
  c.beginPath(); c.moveTo(x - r, foot); c.lineTo(x - r, foot - h + r); c.arc(x, foot - h + r, r, Math.PI, 0); c.lineTo(x + r, foot); c.closePath();
}
const poly = (c, pts, fill) => { c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); };
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);

/** The convex hull of some points (Andrew's monotone chain), counter-clockwise on a y-down screen. */
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), out = [];
  for (const side of [p, [...p].reverse()]) {
    const start = out.length;
    for (const q of side) { while (out.length >= start + 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop(); out.push(q); }
    out.pop();
  }
  return out;
}
/** Is (x, y) inside the convex polygon (from `hull`), or within `margin` of it? */
const inside = (poly, x, y, margin) => poly.every((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1]; return (dx * (y - a[1]) - dy * (x - a[0])) / (Math.hypot(dx, dy) || 1) >= -margin; });

/**
 * The church's shape for a turn `a`, in world units relative to its middle: everything the drawing, the windows, the bell, the
 * shadow and the click need. Pure.
 */
export function layout(a = 0) {
  const cos = Math.cos(a), sin = Math.sin(a), sigma = cos >= 0 ? 1 : -1;
  const ground = (u, v) => [cos * u - sin * v, sin * u + cos * v];
  const rect = ({ u0, u1, v }) => [ground(u0, -v), ground(u1, -v), ground(u1, v), ground(u0, v)];   // clockwise on the screen
  const up = (pts, z) => pts.map(p => [p[0], p[1] - z]);
  const nave = rect(NAVE), tower = rect(TOWER), top = up(tower, TOWER.wall);
  const centre = ground(TU, 0), apex = [centre[0], centre[1] - TOWER.wall - SPIRE];
  /** A wall's own frame (the wall on the viewer's side, at v = vw): x along the wall (u), y up the screen, origin on the ground at u = u0. */
  const frame = (u0, vw) => { const o = ground(u0, vw); return [cos, sin, 0, 1, o[0], o[1]]; };
  const naveFrame = frame(0, sigma * NAVE.v), towerFrame = frame(TU, sigma * TOWER.v);
  const at = (f, x, y) => [f[4] + f[0] * x + f[2] * y, f[5] + f[1] * x + f[3] * y];
  const points = [...nave, ...up(nave, NAVE.wall), ...tower, ...top, apex, [apex[0], apex[1] - 0.0075]];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), pad = 0.003;
  return {
    cos, sin, sigma, ground, nave, tower, top, apex, naveFrame, towerFrame,
    box: { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad },
    windows: WINDOWS.map(u => at(naveFrame, u, WIN.foot - WIN.h / 2)),                 // the middles of the arched windows
    rose: at(towerFrame, 0, ROSE.y),
    bell: at(towerFrame, 0, BELFRY.foot - BELFRY.h / 2),
    // what a click on the building hits: the nave and the tower each swept up by their height, and the spire
    hit: [hull([...nave, ...up(nave, NAVE.wall)]), hull([...tower, ...top]), hull([...top, apex, [apex[0], apex[1] - 0.0075]])]
  };
}

/**
 * Paints one block (the nave or the tower) as the houses are: the strip of wall on every side that faces the viewer, then the
 * top. `corners` is the footprint, `wall` its height. The roof is drawn by `roof(top)`.
 */
function block(c, corners, wall, roof, details) {
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len;
    if (ny <= 0.02) return;   // a wall facing away from the viewer is hidden behind the roof
    poly(c, [p, q, [q[0], q[1] - wall], [p[0], p[1] - wall]], nx > 0.25 ? WALL_SIDE : WALL);
    c.strokeStyle = LINE; c.lineWidth = 0.0005; c.beginPath(); c.moveTo(p[0], p[1] - wall); c.lineTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.lineTo(q[0], q[1] - wall); c.stroke();
  });
  details?.();
  roof(corners.map(p => [p[0], p[1] - wall]));
}

/** The windows, the door, the round window and the belfry's opening, painted onto the walls (in each wall's own frame). */
function paintDetails(c, g, where) {
  c.save();
  if (where === 'nave') {
    c.transform(...g.naveFrame);
    for (const u of WINDOWS) {
      arch(c, u, WIN.foot, WIN.w + 0.0009, WIN.h + 0.0005); c.fillStyle = TRIM; c.fill();
      arch(c, u, WIN.foot, WIN.w, WIN.h); c.fillStyle = GLASS; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.00025; c.beginPath(); c.moveTo(u, WIN.foot); c.lineTo(u, WIN.foot - WIN.h); c.stroke();
    }
  } else {
    c.transform(...g.towerFrame);
    arch(c, 0, 0, DOOR.w + 0.0012, DOOR.h + 0.0006); c.fillStyle = TRIM; c.fill();
    arch(c, 0, 0, DOOR.w, DOOR.h); c.fillStyle = DOOR_COLOR; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.00025; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -DOOR.h); c.stroke();
    disc(c, 0.0006, -0.003, 0.00025, GOLD);
    disc(c, 0, ROSE.y, ROSE.r + 0.0006, TRIM); disc(c, 0, ROSE.y, ROSE.r, GLASS);
    c.fillStyle = TRIM; c.fillRect(TOWER.u0 - TU, -0.0148, TOWER.u1 - TOWER.u0, 0.0006);   // a string course under the belfry
    arch(c, 0, BELFRY.foot, BELFRY.w + 0.001, BELFRY.h + 0.0006); c.fillStyle = TRIM; c.fill();
    arch(c, 0, BELFRY.foot, BELFRY.w, BELFRY.h); c.fillStyle = DARK; c.fill();
  }
  c.restore();
}

/** The nave's roof, like a house's: two slopes along the nave, the far one in the light, with courses and a bright ridge. */
function paintNaveRoof(c, g) {
  const { ground } = g, lift = NAVE.wall, up = p => [p[0], p[1] - lift];
  const slopes = [[-NAVE.v, 0], [0, NAVE.v]].map(([v0, v1]) => [ground(NAVE.u0, v0), ground(NAVE.u1, v0), ground(NAVE.u1, v1), ground(NAVE.u0, v1)].map(up));
  slopes.sort((p, q) => p[0][1] - q[0][1]);   // the far (higher on the screen) slope first
  poly(c, slopes[0], SLATE_LIT); poly(c, slopes[1], SLATE);
  c.strokeStyle = 'rgba(0,0,0,0.09)'; c.lineWidth = 0.0005;
  for (const v of [-0.5 * NAVE.v, 0.5 * NAVE.v]) { const a = up(ground(NAVE.u0, v)), b = up(ground(NAVE.u1, v)); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  const r0 = up(ground(NAVE.u0, 0)), r1 = up(ground(NAVE.u1, 0));
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.0009; c.beginPath(); c.moveTo(r0[0], r0[1]); c.lineTo(r1[0], r1[1]); c.stroke();   // the ridge
  c.strokeStyle = LINE; c.lineWidth = 0.0005; c.beginPath(); g.nave.map(up).forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.closePath(); c.stroke();
}

/** The tower's spire: a pyramid on the tower's top, its four faces drawn far to near, each lit by the way it faces. */
function paintSpire(c, g) {
  const top = g.top, apex = g.apex, cx = top.reduce((s, p) => s + p[0], 0) / 4, cy = top.reduce((s, p) => s + p[1], 0) / 4;
  const grow = p => [cx + (p[0] - cx) * 1.12, cy + (p[1] - cy) * 1.12];   // the eaves reach a little past the walls
  const eave = top.map(grow);
  const faces = eave.map((p, i) => {
    const q = eave[(i + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len;
    return { pts: [p, q, apex], mid: (p[1] + q[1]) / 2, light: Math.min(1, Math.max(0, 0.5 - 0.5 * (nx * 0.45 + ny * 0.9))) };   // light comes from the top left of the screen
  }).sort((p, q) => p.mid - q.mid);
  poly(c, eave, SLATE_DARK);
  for (const f of faces) {
    const k = f.light, col = k > 0.5 ? mix([76, 90, 102], [135, 149, 162], (k - 0.5) * 2) : mix([62, 78, 92], [76, 90, 102], k * 2);
    poly(c, f.pts, `rgb(${col.map(Math.round)})`);
    c.strokeStyle = LINE; c.lineWidth = 0.0004; c.stroke();
  }
  // the cross
  c.strokeStyle = '#7a5a1c'; c.lineWidth = 0.0015; c.beginPath(); c.moveTo(apex[0], apex[1] + 0.001); c.lineTo(apex[0], apex[1] - 0.0072); c.moveTo(apex[0] - 0.0021, apex[1] - 0.0048); c.lineTo(apex[0] + 0.0021, apex[1] - 0.0048); c.stroke();
  c.strokeStyle = GOLD; c.lineWidth = 0.0009; c.stroke();
  disc(c, apex[0], apex[1] + 0.0004, 0.0009, GOLD);
}

/**
 * Paints the whole building (no shadow, no bell, unlit windows) relative to the church's middle, for the turn `a` (or a
 * ready `layout`). `c` is any 2D context already scaled to world units. Not called per frame: Church keeps the result as a
 * sprite. Call it directly for a still picture (a gallery, a proof).
 */
export function paintChurch(c, a = 0) {
  const g = typeof a === 'object' ? a : layout(a);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const naveY = (g.nave[0][1] + g.nave[2][1]) / 2, towerY = (g.tower[0][1] + g.tower[2][1]) / 2;
  const drawNave = () => block(c, g.nave, NAVE.wall, () => paintNaveRoof(c, g), () => paintDetails(c, g, 'nave'));
  const drawTower = () => { block(c, g.tower, TOWER.wall, () => paintSpire(c, g), () => paintDetails(c, g, 'tower')); };
  // the one farther up the screen first, so the nearer one overlaps it
  if (naveY < towerY) { drawNave(); drawTower(); } else { drawTower(); drawNave(); }
}

/**
 * Paints the bell in the belfry's opening, swung by `swing` radians about its headstock. In the tower wall's own frame (the
 * caller has applied `layout(a).towerFrame`). Cheap (three small fills), so it can be drawn every frame over the sprite.
 */
export function paintBell(c, swing = 0) {
  const top = BELFRY.foot - BELFRY.h + 0.0018;
  c.save(); c.translate(0, top); c.rotate(swing);
  c.fillStyle = BRONZE; c.beginPath();
  c.moveTo(-0.0009, 0.0002); c.quadraticCurveTo(-0.0012, 0.0028, -0.0024, 0.0046); c.lineTo(0.0024, 0.0046); c.quadraticCurveTo(0.0012, 0.0028, 0.0009, 0.0002); c.closePath(); c.fill();
  c.fillStyle = GOLD; c.fillRect(-0.0024, 0.0042, 0.0048, 0.0006);     // the lip catches the light
  disc(c, 0, 0.0052, 0.0006, '#6d4e1a');                                  // the clapper
  c.restore();
  c.fillStyle = '#4a3a2c'; c.fillRect(-BELFRY.w / 2, top - 0.0005, BELFRY.w, 0.0008);   // the beam it hangs from
}

export class Church extends Entity {
  static passes = { upright: 'draw', lights: 'drawLights' };
  static clicks = 'one';
  static MAX_SPRITE = 1024;   // the longest side of its sprite, in pixels

  constructor(world, o) {   // o: x, y, a (which way the nave runs, as the houses' a: the tower stands at its -u end)
    super(world); Object.assign(this, o); this.pop = 0;
    this.shape = layout(this.a ?? 0);
    /** Where the bell is, in world units: the rings and the gulls start there. */
    this.bell = [this.x + this.shape.bell[0], this.y + this.shape.bell[1]];
    /** The middles of the windows that light up, in world units (the nave's, then the round one). */
    this.windows = [...this.shape.windows, this.shape.rose].map(p => [this.x + p[0], this.y + p[1]]);
    // each window has its own evening and night, like the houses' (see WindowLights)
    this.lights = this.windows.map((p, n) => (world.windowLights ??= new WindowLights()).add(p[0], p[1], n));
  }

  /** How bright window `n` is now (0..1): its own times by the clock, and only once it is dusk, like the houses' panes. */
  windowLight(n) {
    const hour = this.world?.hourNow ?? 0;   // cached by the world: not worked out per window per frame
    return this.world.windowLights.level(this.lights[n], hour) * Math.min(1, this.darkness / DUSK);
  }

  /** The lit windows as flat warm panes in the windows' own shapes (no halo), on the lights canvas. */
  drawLights(c) {
    if (this.darkness <= 0) return;
    const g = this.shape; c.globalCompositeOperation = 'source-over'; c.translate(this.x, this.y); c.fillStyle = PANE;
    for (let i = 0; i <= WINDOWS.length; i++) {
      const a = this.windowLight(i);
      if (a <= 0.01) continue;
      c.save(); c.globalAlpha = a;
      if (i < WINDOWS.length) { c.transform(...g.naveFrame); arch(c, WINDOWS[i], WIN.foot, WIN.w, WIN.h); c.fill(); }
      else { c.transform(...g.towerFrame); c.beginPath(); c.arc(0, ROSE.y, ROSE.r, 0, TAU); c.fill(); }
      c.restore();
    }
  }

  update(dt) { this.pop = Math.max(0, this.pop - dt * 1.5); }
  hit(x, y) { const dx = x - this.x, dy = y - this.y; return this.shape.hit.some(p => inside(p, dx, dy, MARGIN)); }
  click() {
    const w = this.world, [bx, by] = this.bell; this.pop = 1;
    for (let i = 0; i < 3; i++) w.ring(bx, by, i * 0.45);
    for (let i = 0; i < 3 && w.count(Gull) < 12; i++) { const b = w.add(new Gull(w, bx, by, Math.random() * TAU)); b.rush = 1.5; }
  }

  /** The sprite, painted again when it is missing or shown clearly bigger than it was painted for. */
  sprite(shown) {
    const { box } = this.shape, long = Math.max(box.x1 - box.x0, box.y1 - box.y0), want = Math.min(shown, Church.MAX_SPRITE / long);
    if (this.canvas && this.spritePpu >= want * 0.98) return this.canvas;
    const ppu = Math.min(want * 1.3, Church.MAX_SPRITE / long), canvas = this.canvas ??= document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((box.x1 - box.x0) * ppu)); canvas.height = Math.max(1, Math.round((box.y1 - box.y0) * ppu));   // sizing it also wipes it
    const c = canvas.getContext('2d');
    c.setTransform(ppu, 0, 0, ppu, -box.x0 * ppu, -box.y0 * ppu);
    paintChurch(c, this.shape);
    this.spritePpu = ppu;
    return canvas;
  }

  /** The shadow on the ground, away from the sun like the houses': the nave's, and the tower's with its spire running out to a point. */
  drawShadow(c) {
    const g = this.shape, nave = this.castShadow(NAVE.wall * LIFT), body = this.castShadow(TOWER.wall * LIFT), tip = this.castShadow((TOWER.wall + SPIRE) * LIFT);
    if (nave.a <= 0) return;
    const move = (pts, s) => pts.map(p => [p[0] + s.x, p[1] + s.y]), centre = g.ground(TU, 0);
    const parts = [hull([...g.nave, ...move(g.nave, nave)]), hull([...g.tower, ...move(g.tower, body), [centre[0] + tip.x, centre[1] + tip.y]])];
    c.save(); c.translate(this.x, this.y); c.fillStyle = shade(0.26 * nave.a); c.beginPath();
    for (const part of parts) part.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])), c.closePath();
    c.fill(); c.restore();
  }

  draw(c) {
    const w = this.world, v = w?.viewport, grow = 1 + 0.12 * this.pop * Math.sin(this.pop * 10), { box } = this.shape;
    this.drawShadow(c);
    const shown = (v ? v.dpr * v.scale * (w.camera?.zoom ?? 1) : 4000) * this.scale;   // screen pixels to a world unit
    c.translate(this.x, this.y); c.scale(grow, grow);                                    // it swells from its middle when rung
    c.drawImage(this.sprite(shown), box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    if (shown > 2500 || this.pop > 0) { c.transform(...this.shape.towerFrame); paintBell(c, 0.55 * this.pop * Math.sin(this.pop * 14)); }   // too small to see at normal zoom unless it swings
  }
}
