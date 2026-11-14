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
const RAD = Math.PI / 180;
const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD);
const wrap = d => ((d % 360) + 360) % 360;

export class Sun {
  /**
   * @param {Date} date the moment
   * @param {number} lat latitude in degrees (north is +)
   * @param {number} lon longitude in degrees (east is +)
   * @returns {{ azimuth: number, altitude: number, declination: number }} degrees
   */
  static position(date, lat, lon) {
    const days = date.getTime() / 86400000 + 2440587.5 - 2451545.0;   // days since noon on 1 January 2000 (J2000)

    // the sun along its yearly path round the sky
    const meanAnomaly = wrap(357.529 + 0.98560028 * days);
    const meanLongitude = wrap(280.459 + 0.98564736 * days);
    const longitude = meanLongitude + 1.915 * sin(meanAnomaly) + 0.020 * sin(2 * meanAnomaly);
    const tilt = 23.439 - 0.00000036 * days;   // of the Earth's axis

    // ...as right ascension and declination
    const rightAscension = Math.atan2(cos(tilt) * sin(longitude), cos(longitude)) / RAD;
    const declination = Math.asin(sin(tilt) * sin(longitude)) / RAD;

    // how far the sun is past the place's meridian (the hour angle), from the sidereal time there
    const siderealDegrees = wrap(280.46061837 + 360.98564736629 * days + lon);
    const hourAngle = siderealDegrees - rightAscension;

    const altitude = Math.asin(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle)) / RAD;
    const azimuth = wrap(Math.atan2(-cos(declination) * sin(hourAngle), sin(declination) * cos(lat) - cos(declination) * cos(hourAngle) * sin(lat)) / RAD);
    return { azimuth, altitude, declination };
  }
}
