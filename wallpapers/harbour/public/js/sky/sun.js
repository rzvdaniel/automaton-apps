import { RAD, sin, cos, wrap, daysSinceJ2000, tilt, toLocalSky } from './sky-math.js';

/**
 * Sun: where the sun is in the sky, seen from one place at one moment.
 *
 * Give it a Date and a latitude and longitude (degrees, north and east are +). It answers with the sun's
 * azimuth (the compass direction: 0 north, 90 east, 180 south, 270 west) and altitude (degrees above the horizon;
 * below zero it has set). It is pure arithmetic: no clock, no page.
 *
 * The method is the low-precision formula for the sun published by the U.S. Naval Observatory ("Approximate Solar
 * Coordinates", the Astronomical Almanac's low-precision formulas), good to about 0.01 degrees for 1950-2050; then the
 * usual turn from the sky's coordinates (right ascension, declination) into the local sky (azimuth, altitude).
 * Refraction near the horizon is ignored, so a rising or setting sun is about half a degree off. That is plenty for shadows.
 */
export class Sun {
  /** The sun's place along its yearly path round the sky (ecliptic longitude, degrees). Moon uses it for the phase. */
  static longitude(days) {
    const meanAnomaly = wrap(357.529 + 0.98560028 * days);
    const meanLongitude = wrap(280.459 + 0.98564736 * days);
    return meanLongitude + 1.915 * sin(meanAnomaly) + 0.020 * sin(2 * meanAnomaly);
  }

  /**
   * @param {Date} date the moment
   * @param {number} lat latitude in degrees (north is +)
   * @param {number} lon longitude in degrees (east is +)
   * @returns {{ azimuth: number, altitude: number, declination: number }} degrees
   */
  static position(date, lat, lon) {
    const days = daysSinceJ2000(date);
    const longitude = Sun.longitude(days), e = tilt(days);
    const rightAscension = Math.atan2(cos(e) * sin(longitude), cos(longitude)) / RAD;
    const declination = Math.asin(sin(e) * sin(longitude)) / RAD;
    return { ...toLocalSky(rightAscension, declination, days, lat, lon), declination };
  }
}
