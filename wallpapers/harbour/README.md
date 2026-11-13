# Harbour Wallpaper

A living Irish harbour island for your desktop. Every load builds a different island: a harbour town, walled fields with sheep, a church, a lighthouse, stony shores, boats, sharks, a whale, gulls and clouds, plus a random 4–6 of ten extras (seals, puffins, cows, a balloon, a biplane, dolphins, a kite, a buoy, jellyfish, thatched cottages).

## Using it

- **Click anything:** it reacts. (Things do not make sounds yet; see Sound.)
- **Zoom:** mouse wheel (or `+` / `-`), always sharp; `0` resets. **Pan:** press and drag while zoomed.
- **On a phone:** pinch to zoom, drag to pan, double-tap to zoom in or out, a button at the top right resets the zoom; a tap clicks on release. The island fits a tall screen, is laid out again when you rotate, and draws fewer pixels if the device is slow.
- **Sound:** off until you press the speaker button at the top right; the choice is remembered. Only the sea (waves that swell and draw back) and the seagulls (a call now and then, and when you click one) make sound; both are synthesised in the browser. Everything else is silent until we find recordings that sound natural.
- `?seed=123` repeats an island, `N` makes a new one. `?debug` puts every extra on the island, shows a status panel and lists problems.
- `/gallery.html` shows the extras large.

On Windows, [Lively Wallpaper](https://www.rocksdanister.com/lively/) shows a web page as the desktop background: give it the app's address.

## How it is built

Plain ES modules in `public/js`: no build step, no dependencies. Each folder has one job and each file one thing.

| Folder | What it holds |
| --- | --- |
| `core/` | Pure helpers (`math`, `draw`) and the `Entity` base class. Knows nothing about the page. |
| `engine/` | The parts of the world, one class each: `Viewport` (screen size), `Camera` (zoom and pan), `Terrain` (land and shore), `Wind`, `Effects` (ripples, spray), `Scene` (entities and drawing them), `Interaction` (what a tap does), `Input` (gestures), `Renderer` and `Backdrop` (canvases and the shader), `FrameLoop`, `QualityMonitor`, `DebugPanel`. `World` ties them together and is what entities talk to. |
| `island/` | Builds an island from a seed, as ordered steps (`land`, `cove`, `roads`, `town`, `fields`, `plants`, `shore`, `extras`, `populate`) sharing one `BuildContext`. `scales.js` sets how big each kind is drawn. |
| `entities/` | One class per thing (`Shark`, `Gull`, `Car`, `Lighthouse`, ...), each with its own state, movement, drawing, click reaction and sound. `index.js` exports them all. |
| `audio/` | `AudioEngine` (Web Audio and the building blocks `tone`, `noise`, `say`), `Ambience` (waves, gulls), `Sound` (what the rest of the code uses), `sounds.js` (the named sounds). |
| `ui/` | The page's buttons. |

`main.js` starts it. It needs to be served over http (the app's address, or `node server.js`): browsers do not load modules from a file.

## Changing it

- **Add something:** write a class extending `Entity` in `entities/` (copy a similar one), export it from `entities/index.js`, and add it in `island/populate.js` (always there) or `island/extras.js` (random). `static passes` says when it is drawn, `static clicks` how it takes clicks, `static sound` which sound it makes.
- **Add a sound:** a function in `audio/sounds.js`, built from `tone`, `noise` and `say` (or a recording, played with a buffer source); then name it in a class with `static sound`.
- **Resize a kind of thing:** `SCALES` in `island/scales.js` (`Seal: 1.5`). Any entity also has a `scale`.
- **A broken thing never stops the show:** an entity that throws is logged once and removed.

## Tests

```bash
node --test "test/*.test.mjs"
```

They cover the maths, camera, viewport and terrain; clicks and sounds; and the generator, which must build exactly the islands in `test/golden.json` (fingerprints of 24 seeds). If you change the layout on purpose, re-take those fingerprints (the function is in `island.test.mjs`).

## Run locally

```bash
node server.js
```

Then open http://localhost:8080. Set `AUTOMATON_PORT` to use another port.
