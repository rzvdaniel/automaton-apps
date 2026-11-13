# Harbour Wallpaper

A living Irish harbour island for your desktop. Every load builds a different island: a harbour town, walled fields with sheep, a church, a lighthouse, stony shores, boats, sharks, a whale, gulls and clouds, plus a random 4–6 of twelve extras (seals, puffins, cows, a dolmen, a balloon, a biplane, dolphins, a currach, a kite, a buoy, jellyfish, thatched cottages).

## Using it

- **Click anything:** it reacts and makes its own sound (sheep baa, the rower hails, the child with the kite shouts, the church rings).
- **Zoom:** mouse wheel (or `+` / `-`), always sharp; `0` resets. **Pan:** press and drag while zoomed.
- **On a phone:** pinch to zoom, drag to pan, double-tap to zoom in or out, a button at the top right resets the zoom; a tap clicks on release. The island fits a tall screen, is laid out again when you rotate, and draws fewer pixels if the device is slow.
- **Sound:** off until you press the speaker button at the top right; the choice is remembered. Waves come in swells and a gull calls now and then.
- `?seed=123` repeats an island, `N` makes a new one. `?debug` puts every extra on the island, shows a small status panel and lists problems.
- `/gallery.html` shows the extras large.

On Windows, [Lively Wallpaper](https://www.rocksdanister.com/lively/) shows a web page as the desktop background: give it the app's address.

## How it works

Plain scripts in `public/js`, no build step, no dependencies:

- `core.js` helpers and the `Entity` base class · `world.js` entities, camera, clicks, frame loop · `shader.js` sea, shore and meadow, painted by a shader that takes the camera · `island.js` builds an island from a seed · `sound.js` audio machinery · `sounds.js` the named sounds · `entities/` one class per thing.
- `server.js` is a small static server; nothing is stored.

## Changing it

- **Add something:** write a class extending `Harbour.Entity` in `entities/` (copy a similar one), load it in `index.html`, add it in `island.js`. Its `static passes` says when it is drawn, `static clicks` how it takes clicks, `static sound` which sound it makes.
- **Add a sound:** one line in `H.SOUNDS` (`sounds.js`), built from `tone`, `noise` and `say`; then name it in a class.
- **Resize a kind of thing:** `H.SCALES` at the top of `island.js` (`Seal: 1.5`). Any entity also has a `scale`.
- **Robustness:** a thing that throws is logged once and removed; the rest keeps running. Drawing happens in the camera's space, so nothing is a fixed-size picture.

## Run locally

```bash
node server.js
```

Then open http://localhost:8080. Set `AUTOMATON_PORT` to use another port.
