/**
 * The settings panel's icons, drawn for this app: 24 by 24, simple strokes in `currentColor`, so they read in light and dark
 * and on a chosen (filled) button. Each is a string of inline SVG.
 */
const svg = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const SUN = '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>';
const CLOUD = 'M7.5 18.5a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 16.7 10a4.2 4.2 0 0 1 .3 8.5z';

export const ICONS = Object.freeze({
  // weather
  sunny: svg(SUN),
  partly: svg('<circle cx="9" cy="9" r="2.8"/><path d="M9 3v1.4M3 9h1.4M4.8 4.8l1 1M13.2 4.8l-1 1"/><path d="M9.5 19.5a3 3 0 0 1-.3-6 4.4 4.4 0 0 1 8.4 1.2 2.9 2.9 0 0 1-.4 4.8z"/>'),
  cloudy: svg(`<path d="${CLOUD}"/>`),
  stormy: svg(`<path d="M7.5 15.5a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 16.7 7a4.2 4.2 0 0 1 .3 8.5"/><path d="M12.5 11l-2.5 4.5h3.5L11 20.5"/>`),
  // wind
  auto: svg('<path d="M7 19l5-14 5 14M9 14h6"/>'),
  calm: svg('<path d="M4 12h10a2.5 2.5 0 1 0-2.5-2.5"/>'),
  windy: svg('<path d="M4 9h10a2.5 2.5 0 1 0-2.5-2.5M4 15h13a2.5 2.5 0 1 1-2.5 2.5"/>'),
  gale: svg('<path d="M3 7h10a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2.5 2.5 0 1 1-2.5 2.5M3 17h9a2.5 2.5 0 1 1-2.5 2.5"/>'),
  // waves
  wavesOff: svg('<path d="M4 12h16"/>'),
  wavesOriginal: svg('<circle cx="7" cy="9" r="1" fill="currentColor"/><circle cx="14" cy="7" r="1" fill="currentColor"/><circle cx="17" cy="14" r="1" fill="currentColor"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>'),
  wavesCrescents: svg('<path d="M3 10a4 4 0 0 1 8 0M12 17a4 4 0 0 1 8 0M13 8.5a3 3 0 0 1 6 0"/>'),
  wavesDashes: svg('<path d="M4 8h5M13 8h6M7 13h6M16 13h3M4 18h6M14 18h5"/>'),
  // moon
  moonReal: svg('<path d="M18 14.5A7 7 0 0 1 9.5 6a7 7 0 1 0 8.5 8.5z"/><path d="M17 4v3M15.5 5.5h3"/>'),
  moonFull: svg('<circle cx="12" cy="12" r="7" fill="currentColor" fill-opacity="0.3"/>'),
  moonNew: svg('<circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>'),
  // sound
  soundOn: svg('<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8"/>'),
  soundOff: svg('<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'),
  // the panel's own buttons
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>')
});

/**
 * A palette set's icon: a small disc in the set's grass, sand and sea (day colours), top to bottom.
 * @param {{ id: string, day: Record<string, number[]> }} set
 */
export function swatch(set) {
  const rgb = c => `rgb(${c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')})`;
  const id = `swatch-${set.id.replace(/[^a-z0-9]/gi, '')}`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="12" cy="12" r="9"/></clipPath></defs>`
    + `<g clip-path="url(#${id})"><rect x="3" y="3" width="18" height="6" fill="${rgb(set.day.grass)}"/><rect x="3" y="9" width="18" height="5" fill="${rgb(set.day.dry)}"/><rect x="3" y="14" width="18" height="7" fill="${rgb(set.day.mid)}"/></g>`
    + '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
}
