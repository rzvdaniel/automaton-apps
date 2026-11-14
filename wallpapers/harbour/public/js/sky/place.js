/**
 * Place: where on Earth the island is.
 *
 * The viewer's time zone (such as 'Europe/Bucharest') says roughly where they live. Place turns a time zone into a city
 * with a latitude and longitude, using a small table of common zones. A zone that is not in the table gets the city whose
 * clock is closest to it (same offset from UTC); a zone the browser does not know at all gets Bucharest.
 * The choice comes from Settings (a picked zone, else the browser's own). Place also tells the local time there.
 */
export const FALLBACK_ZONE = 'Europe/Bucharest';

/** zone, city, latitude (north is +), longitude (east is +) */
const TABLE = [
  ['Pacific/Honolulu', 'Honolulu', 21.31, -157.86], ['America/Anchorage', 'Anchorage', 61.22, -149.9],
  ['America/Los_Angeles', 'Los Angeles', 34.05, -118.24], ['America/Vancouver', 'Vancouver', 49.28, -123.12],
  ['America/Phoenix', 'Phoenix', 33.45, -112.07], ['America/Denver', 'Denver', 39.74, -104.99],
  ['America/Mexico_City', 'Mexico City', 19.43, -99.13], ['America/Chicago', 'Chicago', 41.88, -87.63],
  ['America/New_York', 'New York', 40.71, -74.01], ['America/Toronto', 'Toronto', 43.65, -79.38],
  ['America/Bogota', 'Bogota', 4.71, -74.07], ['America/Lima', 'Lima', -12.05, -77.04],
  ['America/Halifax', 'Halifax', 44.65, -63.57], ['America/Caracas', 'Caracas', 10.48, -66.9],
  ['America/Santiago', 'Santiago', -33.45, -70.67], ['America/Sao_Paulo', 'Sao Paulo', -23.55, -46.63],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires', -34.6, -58.38], ['Atlantic/Reykjavik', 'Reykjavik', 64.15, -21.94],
  ['Atlantic/Azores', 'Azores', 37.74, -25.67], ['Europe/Lisbon', 'Lisbon', 38.72, -9.14],
  ['Europe/Dublin', 'Dublin', 53.35, -6.26], ['Europe/London', 'London', 51.51, -0.13],
  ['Africa/Casablanca', 'Casablanca', 33.57, -7.59], ['Africa/Lagos', 'Lagos', 6.52, 3.38],
  ['Europe/Paris', 'Paris', 48.86, 2.35], ['Europe/Madrid', 'Madrid', 40.42, -3.7],
  ['Europe/Berlin', 'Berlin', 52.52, 13.4], ['Europe/Rome', 'Rome', 41.9, 12.5],
  ['Europe/Amsterdam', 'Amsterdam', 52.37, 4.9], ['Europe/Stockholm', 'Stockholm', 59.33, 18.07],
  ['Europe/Warsaw', 'Warsaw', 52.23, 21.01], ['Europe/Athens', 'Athens', 37.98, 23.73],
  ['Europe/Bucharest', 'Bucharest', 44.43, 26.1], ['Europe/Helsinki', 'Helsinki', 60.17, 24.94],
  ['Europe/Kyiv', 'Kyiv', 50.45, 30.52], ['Africa/Cairo', 'Cairo', 30.04, 31.24],
  ['Africa/Johannesburg', 'Johannesburg', -26.2, 28.05], ['Africa/Nairobi', 'Nairobi', -1.29, 36.82],
  ['Europe/Istanbul', 'Istanbul', 41.01, 28.98], ['Europe/Moscow', 'Moscow', 55.76, 37.62],
  ['Asia/Riyadh', 'Riyadh', 24.71, 46.68], ['Asia/Tehran', 'Tehran', 35.69, 51.39],
  ['Asia/Dubai', 'Dubai', 25.2, 55.27], ['Asia/Karachi', 'Karachi', 24.86, 67.01],
  ['Asia/Kolkata', 'Mumbai', 19.08, 72.88], ['Asia/Dhaka', 'Dhaka', 23.81, 90.41],
  ['Asia/Bangkok', 'Bangkok', 13.76, 100.5], ['Asia/Jakarta', 'Jakarta', -6.21, 106.85],
  ['Asia/Singapore', 'Singapore', 1.35, 103.82], ['Asia/Shanghai', 'Shanghai', 31.23, 121.47],
  ['Asia/Hong_Kong', 'Hong Kong', 22.32, 114.17], ['Asia/Manila', 'Manila', 14.6, 120.98],
  ['Asia/Seoul', 'Seoul', 37.57, 126.98], ['Asia/Tokyo', 'Tokyo', 35.68, 139.69],
  ['Australia/Perth', 'Perth', -31.95, 115.86], ['Australia/Sydney', 'Sydney', -33.87, 151.21],
  ['Pacific/Auckland', 'Auckland', -36.85, 174.76]
].map(([zone, city, lat, lon]) => Object.freeze({ zone, city, lat, lon }));

/** The wall-clock parts of a moment in a zone. */
function parts(zone, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).map(x => [x.type, Number(x.value)]));
  return { hours: p.hour, minutes: p.minute, seconds: p.second, day: p.day, month: p.month, year: p.year };
}

export class Place {
  /**
   * @param {{ settings: import('./settings.js').Settings, browserZone?: string }} parts
   * browserZone: the browser's own time zone; read from Intl when not given
   */
  constructor({ settings, browserZone = Place.detectZone() }) {
    this.settings = settings;
    this.browserZone = Place.isZone(browserZone) ? browserZone : FALLBACK_ZONE;
  }

  /** The cities one can pick from. */
  static get cities() { return TABLE; }

  /** The browser's time zone, or Bucharest when it will not say. */
  static detectZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE; } catch { return FALLBACK_ZONE; }
  }

  static isZone(zone) {
    if (typeof zone !== 'string' || !zone) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
  }

  /** How many minutes the zone's clock is ahead of UTC at that moment (Bucharest in winter: 120). */
  static offsetMinutes(zone, date) {
    const p = parts(zone, date);
    return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hours, p.minutes, p.seconds) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }

  /** The table entry for a zone: itself, else the city on the closest clock, else Bucharest. Always { zone, city, lat, lon }. */
  static lookup(zone, date = new Date()) {
    const exact = TABLE.find(c => c.zone === zone);
    if (exact) return exact;
    const bucharest = TABLE.find(c => c.zone === FALLBACK_ZONE);
    if (!Place.isZone(zone)) return bucharest;
    const mine = Place.offsetMinutes(zone, date);
    let best = bucharest, gap = Infinity;
    for (const c of TABLE) {
      const d = Math.abs(Place.offsetMinutes(c.zone, date) - mine);
      if (d < gap) { gap = d; best = c; }
    }
    return best;
  }

  /** The time zone in use: the one picked in settings, else the browser's. */
  get zone() {
    const picked = this.settings.get('place');
    return picked && Place.isZone(picked) ? picked : this.browserZone;
  }

  /** Where the island is now: { zone, city, lat, lon }. */
  get current() { return Place.lookup(this.zone); }

  /** The wall-clock time at this place at that moment: { hours, minutes, seconds, day, month, year }. */
  local(date) { return parts(this.zone, date); }

  /** The moment when the wall clock at this place shows that day and time. */
  instantOf({ year, month, day, hours, minutes }) {
    const guess = Date.UTC(year, month - 1, day, hours, minutes);
    let t = guess - Place.offsetMinutes(this.zone, new Date(guess)) * 60000;
    t = guess - Place.offsetMinutes(this.zone, new Date(t)) * 60000;   // once more, in case the first guess crossed a clock change
    return new Date(t);
  }
}
