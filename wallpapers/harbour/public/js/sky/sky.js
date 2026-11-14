import { Sun } from './sun.js';
import { Moon } from './moon.js';

/**
 * Sky: what is in the sky above a place at a moment: the sun and the moon.
 *
 * It is pure: give it a Date and a place ({ lat, lon } in degrees) and it gives back
 * { sun: { azimuth, altitude }, moon: { azimuth, altitude, fraction, waxing } }.
 * DayCycle asks it, and turns the answer into what the scene needs (how dark it is, the light, where shadows fall).
 */
export class Sky {
  /**
   * @param {Date} date the moment
   * @param {{ lat: number, lon: number }} place where on Earth
   */
  at(date, { lat, lon }) {
    return { sun: Sun.position(date, lat, lon), moon: Moon.position(date, lat, lon) };
  }
}
