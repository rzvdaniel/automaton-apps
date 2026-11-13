// The gallery: every extra element, drawn large and alive in a frame of its own. Click one to see its reaction.
// Each frame is a small World (with no page of its own) whose shore is faked, so an entity can live in it.
import { World } from './engine/world.js';
import { LAYERS } from './engine/scene.js';
import { TAU } from './core/math.js';
import * as E from './entities/index.js';

const SEA = '#17a3cb', DEEP = '#0f7fb0', GRASS = '#93c96b', SAND = '#efe3c9';

/** A world with a pretend shore: 'sea' is all water, 'land' all grass, 'shore' has land on the left and sea on the right. */
class Stage extends World {
  constructor(kind) { super({ width: 400, height: 300, debug: false }); this.kind = kind; }
  get hw() { return 6; }
  get hh() { return 6; }
  get wind() { return [0.9, 0.2]; }
  field(x) { return this.kind === 'sea' ? 1 : this.kind === 'land' ? -1 : x; }
  grad(x, y) { return { d: this.field(x, y), gx: this.kind === 'shore' ? 1 : 0, gy: this.kind === 'shore' ? 0 : -1 }; }
  pushIn(p) { return p; }
}

const R = Math.random;
// title, class, note, where it lives, pixels per world unit at a 400px-wide frame, how to make it, background, fixed camera
const SHOW = [
  ['Whale', 'Whale', 'Already in the scene, repainted. A humpback, sometimes with a calf; she blows when she surfaces.', 'sea', 1500, w => { const e = new E.Whale(w, R); e.cross(0, 0, 1, 0.15); e.calf = true; e.alpha = 1; e.blow = 2; e.at = 1e9; return e; }, DEEP],
  ['Seal', 'Seal', 'Basks on rock or sand. Click: it wriggles to the sea, swims, then comes home.', 'shore', 6200, w => { w.add(new E.Seal(w, { x: -0.022, y: 0.012, a: 2.6, kind: 'pup' })); w.add(new E.Seal(w, { x: -0.03, y: -0.012, a: 0.5, kind: 'brown' })); return new E.Seal(w, { x: -0.012, y: 0, a: -0.3, kind: 'grey' }); }, null, true],
  ['Hot-air balloon', 'Balloon', 'Drifts on the wind above everything. Click: the burner fires and it climbs.', 'land', 2600, w => new E.Balloon(w, { x: 0, y: 0 }), GRASS],
  ['Biplane', 'Biplane', 'Tours the island, banking into turns. Click: a barrel roll with smoke.', 'land', 3300, w => new E.Biplane(w, { x: 0, y: 0, a: -0.3 }), GRASS],
  ['Dolphins', 'DolphinPod', 'A pod in deep water; they leap in turn. Click: they all leap.', 'sea', 2700, w => new E.DolphinPod(w, { x: 0, y: 0, a: -0.2, count: 4 }), DEEP],
  ['Puffin', 'Puffin', 'Stands on the cliffs. Click: it whirrs out to sea and back.', 'shore', 9000, w => { w.add(new E.Puffin(w, { x: -0.011, y: 0.003, flip: true })); return new E.Puffin(w, { x: 0.003, y: 0 }); }, null, true],
  ['Cow', 'Cow', 'Grazes around its spot. Click: it trots off. Three coats.', 'land', 7200, w => { w.add(new E.Cow(w, { x: -0.017, y: -0.011, a: 2.4, kind: 'red' })); w.add(new E.Cow(w, { x: 0.017, y: 0.012, a: -0.6, kind: 'kerry' })); return new E.Cow(w, { x: 0, y: 0, a: 0.4, kind: 'friesian' }); }, GRASS, true],
  ['Thatched cottage', 'Cottage', 'A whitewashed cottage under thatch; takes the place of any house.', 'land', 7500, w => new E.Cottage(w, { x: 0, y: 0, a: 0.12, w: 0.034, smoke: true }), GRASS, true],
  ['Kite', 'Kite', 'A child on the grass flying a kite in the wind. Click the kite: it loops.', 'land', 3300, w => new E.Kite(w, { x: -0.04, y: 0.022 }), GRASS, true],
  ['Buoy', 'Buoy', 'A red marker rocking on the swell, lamp blinking. Click: it rocks hard.', 'sea', 14000, w => new E.Buoy(w, { x: 0, y: 0.003 }), SEA, true],
  ['Jellyfish', 'JellyBloom', 'A bloom of moon jellies pulsing under the surface; they shy from a click.', 'sea', 5200, w => new E.JellyBloom(w, { x: 0, y: 0, count: 7 }), DEEP, true]
];

const cells = [];
for (const [title, name, note, kind, zoom, make, background, fixed] of SHOW) {
  if (!E[name]) continue;
  const figure = document.createElement('figure'), canvas = document.createElement('canvas');
  figure.appendChild(canvas);
  figure.insertAdjacentHTML('beforeend', `<figcaption><b>${title} <code>${name}</code></b><span>${note}</span></figcaption>`);
  document.getElementById('grid').appendChild(figure);
  const stage = new Stage(kind), main = stage.add(make(stage));
  const cell = { canvas, ctx: canvas.getContext('2d'), stage, main, zoom, background, fixed, camera: [0, 0] };
  canvas.addEventListener('click', event => {
    const r = canvas.getBoundingClientRect(), k = cell.zoom * r.width / 400;
    const x = (event.clientX - r.left - r.width / 2) / k + cell.camera[0], y = (event.clientY - r.top - r.height / 2) / k + cell.camera[1];
    let hit = false;
    for (const e of stage.scene.entities) if (e.constructor.clicks && e.hit(x, y)) { e.click(x, y); hit = true; }
    if (!hit) main.click(main.x, main.y);
    if (stage.field(x, y) > 0) stage.ripple(x, y, 1);
  });
  cells.push(cell);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const cell of cells) {
    const { canvas, ctx: c, stage } = cell, r = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
    stage.update(dt);
    if (!cell.fixed) cell.camera = [cell.main.x, cell.main.y];
    const k = cell.zoom * canvas.width / 400;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (cell.background) { c.fillStyle = cell.background; c.fillRect(0, 0, canvas.width, canvas.height); }
    else {   // land on the left, sea on the right, a line of foam between
      const edge = canvas.width / 2 - cell.camera[0] * k;
      c.fillStyle = SAND; c.fillRect(0, 0, edge, canvas.height); c.fillStyle = SEA; c.fillRect(edge, 0, canvas.width, canvas.height);
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(edge - 3, 0, 6, canvas.height);
    }
    c.setTransform(k, 0, 0, k, canvas.width / 2 - cell.camera[0] * k, canvas.height / 2 - cell.camera[1] * k);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const p of stage.effects.ripples) {   // the shader paints these in the real scene
      const u = p.t / 2.8; c.strokeStyle = `rgba(255,255,255,${0.6 * p.k * (1 - u) * (1 - u)})`; c.lineWidth = 0.0012;
      c.beginPath(); c.arc(p.x, p.y, 0.004 + 0.06 * Math.pow(u, 0.75) * (0.5 + 0.5 * p.k), 0, TAU); c.stroke();
    }
    for (const layer of LAYERS) {
      if (layer === 'effects') stage.effects.draw(c);
      stage.scene.drawLayer(layer, c, stage.clock);
    }
  }
}
requestAnimationFrame(frame);
