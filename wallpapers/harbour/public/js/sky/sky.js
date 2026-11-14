import { Sun } from './sun.js';

/**
 * Sky: what is in the sky above a place at a moment. For now that is the sun (the moon comes with the night).
 *
 * It is pure: give it a Date and a place ({ lat, lon } in degrees) and it gives back { sun: { azimuth, altitude } }.
 * DayCycle asks it, and turns the answer into what the scene needs (how dark it is, where shadows fall).
 */
export class Sky {
  /**
   * @param {Date} date the moment
   * @param {{ lat: number, lon: number }} place where on Earth
   */
  at(date, { lat, lon }) {
    return { sun: Sun.position(date, lat, lon) };
  }
}
