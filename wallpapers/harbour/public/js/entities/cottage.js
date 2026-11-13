// A thatched cottage: whitewashed walls, a red half-door, flowers under the windows and a deep straw roof.
// It is a House, so it takes the same options and its chimney smokes the same way: click it to light or put out the fire.
// new Cottage(world, { x, y, a, w, smoke })
import { shade, disc, oval, rrect, sprite } from '../core/index.js';
import { House } from './house.js';

export class Cottage extends House {
  constructor(world, o) {
    super(world, Object.assign({ wall: '#f6f1e6', roof: ['#dcbd7e', '#c4a161'] }, o));
    this.straw = []; for (let i = 0; i < 90; i++) this.straw.push([-49 + Math.random() * 98, -30 + Math.random() * 58, 4 + Math.random() * 7, Math.random() < 0.5]);
  }
  draw(c) {
    const front = Math.cos(this.a) >= 0 ? 1 : -1, grow = 1 + 0.22 * this.pop * Math.sin(this.pop * 10), u = this.w / 100;
    sprite(c, this.x + 0.005, this.y + 0.0068, this.a, u, () => { c.fillStyle = shade(0.26); rrect(c, -52, -34, 104, 70, 13); c.fill(); });
    sprite(c, this.x, this.y, this.a, u * grow, () => {
      c.scale(1, front);   // the front wall is on whichever long side faces the viewer
      // a path and flowers by the door
      oval(c, 0, 53, 6, 7, '#e6d8b6'); [[-34, 51, '#e2553f'], [-28, 53, '#f3c148'], [-22, 51, '#e9a4c4'], [22, 52, '#f3c148'], [29, 51, '#e2553f'], [35, 53, '#ffffff']].forEach(k => { disc(c, k[0], k[1] + 1, 2.6, '#5d9a4c'); disc(c, k[0], k[1], 1.5, k[2]); });
      // the whitewashed front: door, two windows with boxes of flowers
      c.fillStyle = '#f8f4ea'; c.fillRect(-46, 26, 92, 21); c.fillStyle = 'rgba(30,45,60,0.16)'; c.fillRect(-46, 26, 92, 5); c.fillStyle = '#cfc7b6'; c.fillRect(-46, 45, 92, 2);
      c.fillStyle = '#b8342a'; c.fillRect(-5, 32, 10, 15); c.fillStyle = '#d24a3c'; c.fillRect(-5, 32, 10, 7); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-5, 38.6, 10, 0.8); disc(c, 3, 42, 0.8, '#f3c148');
      [-27, 27].forEach(x => { c.fillStyle = '#2f4254'; c.fillRect(x - 5, 33, 10, 8); c.fillStyle = '#f8f4ea'; c.fillRect(x - 0.5, 33, 1, 8); c.fillRect(x - 5, 36.6, 10, 0.9); c.fillStyle = '#7a5a36'; c.fillRect(x - 6, 41, 12, 2); [-4, 0, 4].forEach((d, i) => disc(c, x + d, 41, 1.5, ['#e2553f', '#f3c148', '#e9a4c4'][i])); });
      // the thatch: a deep rounded roof, lighter along the ridge, combed straw, a stitched ridge
      c.save(); rrect(c, -52, -34, 104, 66, 15); c.clip();
      const slope = c.createLinearGradient(0, -34, 0, 32); slope.addColorStop(0, '#c9a85c'); slope.addColorStop(0.42, '#ecd08a'); slope.addColorStop(0.5, '#f6e2a6'); slope.addColorStop(0.58, '#e2c278'); slope.addColorStop(1, '#b8924a');
      c.fillStyle = slope; c.fillRect(-52, -34, 104, 66);
      this.straw.forEach(k => { c.strokeStyle = k[3] ? 'rgba(120,84,30,0.22)' : 'rgba(255,244,200,0.3)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(k[0], k[1]); c.lineTo(k[0] + (k[0] / 50) * 1.5, k[1] + (k[1] > -1 ? k[2] : -k[2])); c.stroke(); });
      [-1, 1].forEach(s => { const end = c.createLinearGradient(s * 52, 0, s * 30, 0); end.addColorStop(0, 'rgba(110,76,28,0.4)'); end.addColorStop(1, 'rgba(110,76,28,0)'); c.fillStyle = end; c.fillRect(s > 0 ? 30 : -52, -34, 22, 66); });
      c.fillStyle = 'rgba(96,66,24,0.35)'; c.fillRect(-52, 27, 104, 5);                                   // the eaves in shadow
      c.restore();
      c.fillStyle = '#b58c3e'; rrect(c, -38, -4.5, 76, 7, 3.5); c.fill(); c.fillStyle = '#d8b566'; rrect(c, -38, -5.5, 76, 6, 3); c.fill();
      c.strokeStyle = 'rgba(96,66,24,0.6)'; c.lineWidth = 0.7; for (let x = -34; x <= 34; x += 6) { c.beginPath(); c.moveTo(x - 2, -5); c.lineTo(x + 2, 0); c.moveTo(x + 2, -5); c.lineTo(x - 2, 0); c.stroke(); }
      // the chimney, standing a little proud of the roof
      c.scale(1, front);
      c.fillStyle = '#8f897c'; rrect(c, 24.5, -5.5 + 2.5, 11, 11, 2); c.fill(); c.fillStyle = '#c9c3b5'; rrect(c, 24.5, -5.5 - 1, 11, 11, 2); c.fill();
      c.fillStyle = '#3b3530'; rrect(c, 27, -4, 6, 6, 1.5); c.fill();
    });
  }
}
void oval;
