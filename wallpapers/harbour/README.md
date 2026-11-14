# Harbour Wallpaper

A living Irish harbour island for your desktop. Every load builds a different island: a harbour town, walled fields with sheep, a church, a lighthouse, stony shores, boats, sharks, a whale, gulls and clouds, plus a random 4–6 of ten extras (seals, puffins, cows, a balloon, a biplane, dolphins, a kite, a buoy, jellyfish, thatched cottages).

## Using it

- **Click anything:** it reacts. (Things do not make sounds yet; see Sound.)
- **Zoom:** mouse wheel (or `+` / `-`), always sharp; `0` resets. **Pan:** press and drag while zoomed.
- **On a phone:** pinch to zoom, drag to pan, double-tap to zoom in or out, a button at the top right resets the zoom; a tap clicks on release. The island fits a tall screen, is laid out again when you rotate, and draws fewer pixels if the device is slow.
- **Settings:** the button at the top right opens a dialog: Sound (off until you switch it on), Place (your browser's time zone, or a city), Time ("Now", or a start time that then runs forward), Weather (more sun or more clouds) and Wind (Auto, or calm to stormy). Choices are saved in the browser. Place and Time set the clock the island uses (shown in `?debug`): the shadows follow the real sun for that place and time, short and pointing north at noon, long in the morning and afternoon, gone at night. Weather and Wind are only stored for now.
- **Night:** at dusk the balloon, biplane, kite, gulls, puffins and parasols go home one by one, and most of the people; one or two stay out with a lantern, and a fox comes out to roam (click it: it jumps and yips). Windows light up house by house (some stay dark), the church windows glow, lamps come on along the quay and the pier, a few moored boats show a lantern, the car has its headlights on and the lighthouse sweeps its beam out to sea. At dawn it all goes the other way.
- **Sound:** the choice is remembered. Only the sea (waves that swell and draw back), the seagulls (a call now and then, and when you click one) and the fox's yip make sound; both are synthesised in the browser. Everything else is silent until we find recordings that sound natural.
- `?seed=123` repeats an island, `N` makes a new one. `?debug` puts every extra on the island, shows a status panel and lists problems.
- `/gallery.html` shows the extras large.

On Windows, [Lively Wallpaper](https://www.rocksdanister.com/lively/) shows a web page as the desktop background: give it the app's address.

## How it is built

Plain ES modules in `public/js`: no build step, no dependencies. Each folder has one job and each file one thing.

| Folder | What it holds |
| --- | --- |
| `core/` | Pure helpers (`math`, `draw`) and the `Entity` base class. Knows nothing about the page. |
| `engine/` | The parts of the world, one class each: `Viewport` (screen size), `Camera` (zoom and pan), `Terrain` (land and shore), `Wind`, `Effects` (ripples, spray), `Scene` (entities and drawing them), `Presence` (who is out at this hour: each class says `static active = 'day' / 'night' / 'always'`, or a `nightShare` that stays out at night), `Interaction` (what a tap does), `Input` (gestures), `Renderer` and `Backdrop` (canvases and the shader), `FrameLoop`, `QualityMonitor`, `DebugPanel`. `World` ties them together and is what entities talk to. |
| `island/` | Builds an island from a seed, as ordered steps (`land`, `cove`, `roads`, `town`, `fields`, `plants`, `shore`, `extras`, `populate`) sharing one `BuildContext`. `scales.js` sets how big each kind is drawn. |
| `entities/` | One class per thing (`Shark`, `Gull`, `Car`, `Lighthouse`, ...), each with its own state, movement, drawing, click reaction and sound. `index.js` exports them all. |
| `audio/` | `AudioEngine` (Web Audio and the building blocks `tone`, `noise`, `say`), `Ambience` (waves, gulls), `Sound` (what the rest of the code uses), `sounds.js` (the named sounds). |
| `sky/` | The viewer's choices and the island's place and time, one class each: `Settings` (saved in the browser), `Place` (time zone to city, latitude, longitude), `SkyClock` (the time shown), `Sun`, `Moon` and `Sky` (where the sun and moon are, and the moon's phase), `DayCycle` (dawn, day, dusk or night; the light's colour, `world.day.light`; and where shadows fall, from the sun by day and the moon by night: `world.day.shadow`, which every entity's shadow reads through `Entity.castShadow`). `engine/lighting.js` puts the light over the whole picture once: a shader uniform for sea and land, one CSS colour filter for the drawing. Night lights (an entity's `drawLights` pass, through `glow()` in `core/glow.js`) go on a third canvas above, with no filter, so they stay bright. |
| `ui/` | The page's buttons and the settings dialog, built from the UI kit copied into `public/ui/` (never edit it; see the repository's design skill). |

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
