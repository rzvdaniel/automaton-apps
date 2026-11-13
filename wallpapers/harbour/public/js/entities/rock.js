// A boulder of grey Irish limestone, rounded by the weather: a lit top, a darker face towards the viewer,
// moss and lichen when it is dry, foam around its foot when it stands in the sea.
(function (H) {
  'use strict';
  const { TAU, disc, oval, shade } = H;
  const TONES = [['#77838a', '#a2acb0', '#c9d1d3'], ['#7d847c', '#a9aea5', '#cfd3c9'], ['#707c87', '#98a3ae', '#bfc9d1']];
  H.Rock = class extends H.Entity {
    constructor(world, o) {   // o: x, y, r, rot, wet, moss, flat
      super(world); Object.assign(this, o);
      this.tone = TONES[Math.floor(o.rot * 7) % 3]; this.tall = o.r * (o.flat ? 0.2 : 0.46);
      this.shape = []; for (let i = 0; i < 7; i++) { const g = o.rot + i * TAU / 7, rr = o.r * (0.86 + 0.2 * Math.sin(i * 2.3 + o.rot * 5)); this.shape.push([Math.cos(g) * rr, Math.sin(g) * rr * 0.8]); }
    }
    // A smooth outline through the shape's corners, moved by (dx, dy) and scaled by m.
    blob(c, dx, dy, m, col) {
      const s = this.shape, n = s.length, at = i => [this.x + dx + s[i % n][0] * m, this.y + dy + s[i % n][1] * m], mid = i => { const a = at(i), b = at(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      c.fillStyle = col; c.beginPath(); const start = mid(0); c.moveTo(start[0], start[1]);
      for (let i = 1; i <= n; i++) { const p = at(i), q = mid(i); c.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
      c.closePath(); c.fill();
    }
    draw(c, t) {
      const r = this.r, tall = this.tall, tone = this.tone;
      if (this.wet) {   // the sea washes around the foot
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + this.x * 40);
        oval(c, this.x, this.y + r * 0.12, r * (1.22 + 0.14 * pulse), r * (0.92 + 0.12 * pulse), 'rgba(255,255,255,' + (0.3 + 0.22 * pulse) + ')');
      } else oval(c, this.x + r * 0.5, this.y + r * 0.4, r * 0.98, r * 0.7, shade(0.2));
      const face = this.wet ? '#5c6a73' : tone[0];
      this.blob(c, 0, 0, 1, face); this.blob(c, 0, -tall * 0.5, 1, face);
      this.blob(c, 0, -tall, 1, tone[1]);
      this.blob(c, -r * 0.13, -tall - r * 0.12, 0.62, tone[2]);
      if (this.moss) { disc(c, this.x + r * 0.3, this.y - tall + r * 0.14, r * 0.22, '#8fb267'); disc(c, this.x + r * 0.12, this.y - tall + r * 0.3, r * 0.15, '#a3c178'); disc(c, this.x - r * 0.44, this.y - tall + r * 0.08, r * 0.1, '#d6cf8a'); }
    }
  };
})(window.Harbour);
