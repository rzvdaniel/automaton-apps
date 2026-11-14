/**
 * Sky arithmetic shared by Sun and Moon: degrees instead of radians, the day count astronomers use, and the turn from
 * the sky's own coordinates (right ascension and declination, fixed to the stars) into what someone standing at a place
 * sees (azimuth: compass direction, 0 north, 90 east; altitude: degrees above the horizon).
 */
export const RAD = Math.PI / 180;
export const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD);
export const wrap = d => ((d % 360) + 360) % 360;

/** Days since noon (UTC) on 1 January 2000, the moment called J2000. */
export const daysSinceJ2000 = date => date.getTime() / 86400000 + 2440587.5 - 2451545.0;

/** The tilt of the Earth's axis (degrees) on that day. */
export const tilt = days => 23.439 - 0.00000036 * days;

/**
 * Where a body with that right ascension and declination stands in the local sky.
 * @returns {{ azimuth: number, altitude: number }} degrees
 */
export function toLocalSky(rightAscension, declination, days, lat, lon) {
  // how far the body is past the place's meridian (the hour angle), from the sidereal time there
  const hourAngle = wrap(280.46061837 + 360.98564736629 * days + lon) - rightAscension;
  const altitude = Math.asin(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle)) / RAD;
  const azimuth = wrap(Math.atan2(-cos(declination) * sin(hourAngle), sin(declination) * cos(lat) - cos(declination) * cos(hourAngle) * sin(lat)) / RAD);
  return { azimuth, altitude };
}
