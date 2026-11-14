import { RAD, sin, cos, wrap, daysSinceJ2000, tilt, toLocalSky } from './sky-math.js';
import { Sun } from './sun.js';

/**
 * Moon: where the moon is in the sky, seen from one place at one moment, and how much of it is lit.
 *
 * It answers { azimuth, altitude, fraction, waxing }: the compass direction and height in degrees (as for the Sun),
 * the lit fraction of the disc (0 new moon, 1 full moon) and whether it is growing (waxing) or shrinking.
 *
 * The position is the Astronomical Almanac's low-precision formula for the moon ("Low-precision formulae for the Moon's
 * coordinates", section D), good to about 0.3 degrees: a handful of sine terms for the moon's longitude and latitude along
 * the ecliptic (the sun's yearly path), and for its parallax (the moon is close, so seen from the Earth's surface it sits up
 * to a degree lower than seen from the Earth's centre; that is corrected). The lit fraction comes from the angle between
 * the sun and the moon (their elongation): fraction = (1 - cos(elongation)) / 2, as in Meeus, "Astronomical Algorithms",
 * chapter 48, without the tiny correction for the moon's distance. Refraction is ignored. Pure arithmetic: no clock, no page.
 */
export class Moon {
  /**
   * @param {Date} date the moment
   * @param {number} lat latitude in degrees (north is +)
   * @param {number} lon longitude in degrees (east is +)
   * @returns {{ azimuth: number, altitude: number, fraction: number, waxing: boolean }}
   */
  static position(date, lat, lon) {
    const days = daysSinceJ2000(date), T = days / 36525;   // T: centuries since J2000

    // the moon along the ecliptic: longitude and latitude (degrees), and its parallax
    const longitude = wrap(218.32 + 481267.881 * T
      + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T) + 0.66 * sin(235.7 + 890534.22 * T)
      + 0.21 * sin(269.9 + 954397.74 * T) - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.5 + 966404.03 * T));
    const latitude = 5.13 * sin(93.3 + 483202.02 * T) + 0.28 * sin(228.2 + 960400.89 * T)
      - 0.28 * sin(318.3 + 6003.15 * T) - 0.17 * sin(217.6 - 407332.21 * T);
    const parallax = 0.9508 + 0.0518 * cos(135.0 + 477198.87 * T) + 0.0095 * cos(259.3 - 413335.36 * T)
      + 0.0078 * cos(235.7 + 890534.22 * T) + 0.0028 * cos(269.9 + 954397.74 * T);

    // ...as right ascension and declination, then the local sky
    const e = tilt(days);
    const rightAscension = Math.atan2(sin(longitude) * cos(e) - Math.tan(latitude * RAD) * sin(e), cos(longitude)) / RAD;
    const declination = Math.asin(sin(latitude) * cos(e) + cos(latitude) * sin(e) * sin(longitude)) / RAD;
    const { azimuth, altitude } = toLocalSky(rightAscension, declination, days, lat, lon);

    // the phase, from how far the moon is from the sun
    const apart = longitude - Sun.longitude(days);
    const fraction = (1 - cos(latitude) * cos(apart)) / 2;
    return { azimuth, altitude: altitude - parallax * cos(altitude), fraction, waxing: sin(apart) > 0 };
  }
}
