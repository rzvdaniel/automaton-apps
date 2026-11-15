/**
 * Palettes: the ground's colours (sand, grass and sea) at four times of day, in sets the viewer can choose between.
 *
 * A set is { id, name, day, sunrise, sunset, night }. Each of the four is a palette of nine colours, as they should
 * appear on screen (red, green, blue, each 0..1): the dry and wet sand, the two greens of the meadow, the three
 * depths of the sea, the glow where the sea is shallow next to the shore and the foam. The backdrop's shader mixes the
 * four palettes by the weights DayCycle gives it (see DayCycle.phasesAt) and divides the non-day ones by the time of
 * day's light, so what is listed here is what shows (the day colours are simply multiplied by the light, as they always were).
 *
 * 'classic' is the island as it always was by day, with the night of #205 and a sunrise and sunset of their own.
 * Entities (houses, trees, boats) have no palettes: they are lit by the same light.
 */
export const COLOURS = Object.freeze(['dry', 'wet', 'grass', 'grass2', 'shallow', 'mid', 'deep', 'glow', 'foam']);
/** The order of the four palettes in the shader (u_pal and u_phase). */
export const PHASES = Object.freeze(['day', 'sunrise', 'sunset', 'night']);

const palette = (...values) => Object.freeze(Object.fromEntries(COLOURS.map((name, i) => [name, Object.freeze(values[i])])));

export const PALETTES = Object.freeze([
  Object.freeze({
    id: 'classic', name: 'Classic',
    day: palette([0.957, 0.922, 0.882], [0.925, 0.863, 0.714], [0.663, 0.824, 0.467], [0.455, 0.706, 0.361], [0.271, 0.827, 0.812], [0.086, 0.682, 0.816], [0.039, 0.416, 0.612], [0.812, 0.933, 0.769], [1, 1, 1]),
    // a pale peach sand, fresh green grass, a soft lilac-blue sea
    sunrise: palette([0.96, 0.80, 0.70], [0.86, 0.68, 0.60], [0.55, 0.75, 0.45], [0.42, 0.62, 0.38], [0.60, 0.68, 0.78], [0.40, 0.50, 0.75], [0.22, 0.30, 0.58], [0.85, 0.80, 0.75], [1, 0.95, 0.92]),
    // an apricot sand, olive-gold grass, a dark teal sea with a coral sheen near the shore
    sunset: palette([0.93, 0.66, 0.45], [0.82, 0.52, 0.38], [0.55, 0.55, 0.25], [0.42, 0.45, 0.20], [0.45, 0.50, 0.48], [0.06, 0.32, 0.38], [0.03, 0.18, 0.26], [0.95, 0.60, 0.45], [0.98, 0.82, 0.74]),
    night: palette([0.62, 0.64, 0.74], [0.50, 0.54, 0.68], [0.30, 0.50, 0.47], [0.22, 0.40, 0.42], [0.16, 0.42, 0.62], [0.07, 0.25, 0.48], [0.03, 0.12, 0.30], [0.45, 0.62, 0.72], [0.85, 0.90, 1.0])
  }),
  // cool and muted: slate sea, sage grass, grey sand; rosy granite at dusk
  Object.freeze({
    id: 'nordic', name: 'Nordic',
    day: palette([0.86, 0.86, 0.84], [0.74, 0.76, 0.76], [0.50, 0.62, 0.45], [0.38, 0.52, 0.38], [0.55, 0.75, 0.78], [0.25, 0.50, 0.62], [0.12, 0.30, 0.46], [0.70, 0.82, 0.74], [0.97, 0.99, 1]),
    sunrise: palette([0.84, 0.78, 0.76], [0.72, 0.66, 0.68], [0.50, 0.62, 0.48], [0.38, 0.52, 0.40], [0.58, 0.68, 0.76], [0.42, 0.54, 0.68], [0.24, 0.34, 0.52], [0.76, 0.76, 0.74], [0.96, 0.95, 0.98]),
    sunset: palette([0.76, 0.58, 0.54], [0.62, 0.47, 0.47], [0.40, 0.44, 0.32], [0.30, 0.36, 0.28], [0.50, 0.42, 0.48], [0.26, 0.28, 0.42], [0.13, 0.16, 0.30], [0.80, 0.58, 0.54], [0.92, 0.84, 0.84]),
    night: palette([0.50, 0.55, 0.66], [0.40, 0.46, 0.60], [0.24, 0.36, 0.38], [0.18, 0.29, 0.33], [0.20, 0.34, 0.50], [0.10, 0.20, 0.38], [0.05, 0.10, 0.24], [0.38, 0.50, 0.62], [0.80, 0.86, 0.95])
  })
]);

export const DEFAULT_PALETTE = 'classic';

export const isPaletteId = id => PALETTES.some(p => p.id === id);
/** The set with this id; an unknown id is the default set. */
export const paletteSet = id => PALETTES.find(p => p.id === id) ?? PALETTES[0];

/**
 * The shader's `u_pal`: 18 colours as 54 numbers. The first nine are the set's day palette; the next nine are the non-day part
 * on screen, blended on the CPU: sunrise, sunset and night by their weights (`phases`, see DayCycle.phasesAt), the night one
 * a little brighter by the moonlight (0..1). The shader adds the day weight times the first nine and the light-corrected second nine.
 * Few uniforms matter on phones (some allow only 64 fragment vectors); it changes with the light, about once a second.
 */
export function blend(set, phases = [1, 0, 0, 0], moon = 0) {
  const out = new Float32Array(54), w = [phases[1], phases[2], phases[3] * (1 + 0.15 * moon)];
  COLOURS.forEach((name, k) => {
    for (let i = 0; i < 3; i++) {
      out[k * 3 + i] = set.day[name][i];
      out[27 + k * 3 + i] = w[0] * set.sunrise[name][i] + w[1] * set.sunset[name][i] + w[2] * set.night[name][i];
    }
  });
  return out;
}

/** A set as 108 numbers: 36 colours (day, sunrise, sunset, night; nine each, in COLOURS order). */
export function flatten(set) {
  return new Float32Array(PHASES.flatMap(phase => COLOURS.flatMap(name => set[phase][name])));
}
