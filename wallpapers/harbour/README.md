# Harbour Wallpaper

A living Irish harbour island for your desktop. Every load builds a different island: a harbour town, walled fields with sheep, a church, a lighthouse, stony shores, boats, a shark, gulls and clouds.

## What reacts

- **The sea:** click for rings; fish bolt and gulls veer away. The pointer leaves a faint wake.
- **The town:** the church bell rings and sends its gulls off, chimneys start or stop smoking, people hop, walkers hurry, the car toots and speeds off.
- **The land:** sheep run from a click but stay inside their walls; trees and gorse shake. Trees sway in the wind on their own.
- **The shore:** the fisherman lands a fish (sometimes a boot), the lighthouse switches on or off.
- **Boats and beasts:** sailing boats speed up, moored boats rock, the shark and the whale dive.
- **The sky:** a clicked cloud blows away.

`?seed=123` repeats a scene and `N` makes a new one. `?debug` puts every extra element on the island at once (the console lists them). Sound (waves, gulls, the bell) is off until you press the button at the top right.

## Use it as a wallpaper

On Windows, [Lively Wallpaper](https://www.rocksdanister.com/lively/) shows a web page as the desktop background. Give it the app's address, or `public/index.html` from this folder.

## How it works

Plain scripts in `public/js`, no build step and no dependencies:

- `core.js`: helpers and the `Entity` base class.
- `world.js`: the entity list, drawing layers, clicks and the frame loop.
- `shader.js`: a WebGL fragment shader paints sea, shore, sand and meadow.
- `island.js`: builds the island from a seed and fills the world with entities.
- `sound.js`: all sound, synthesised in the browser.
- `entities/`: one class per thing (`Shark`, `Gull`, `GullFlock`, `Car`, `Lighthouse`, ...). Each owns its state, movement, drawing and click reaction.
- `server.js` (in the app folder): a dependency-free Node.js server for the page. Nothing is stored.

To add something: write a class that extends `Harbour.Entity` in `entities/`, load it in `index.html`, and add it at the end of `island.js`.

## Extra elements, not placed yet

Painted and working, loaded by the page, but not on the island until `island.js` adds them. See them all at `/gallery.html`. Each file's header says where the element belongs.

| Class | Add with | Lives |
| --- | --- | --- |
| `Seal` | `new H.Seal(world, { x, y, a, kind })` kind: grey, brown, pup | on shore rocks or sand, near water |
| `Balloon` | `new H.Balloon(world, { x, y })` | the sky |
| `Biplane` | `new H.Biplane(world, { x, y, a })` | the sky |
| `DolphinPod` | `new H.DolphinPod(world, { x, y, a, count })` | deep water |
| `Currach` | `new H.Currach(world, { x, y, a })` | water near the coast |
| `Puffin` | `new H.Puffin(world, { x, y, flip })` | cliff tops by the shore, in small groups |
| `Cow` | `new H.Cow(world, { x, y, a, kind })` kind: friesian, red, kerry | open meadow |
| `Dolmen` | `new H.Dolmen(world, { x, y })` | open meadow |
| `Cottage` | `new H.Cottage(world, { x, y, a, w, smoke })` | anywhere a `House` goes |
| `Kite` | `new H.Kite(world, { x, y })` x, y: the child | open meadow or beach |
| `Buoy` | `new H.Buoy(world, { x, y })` | open water off the harbour |
| `JellyBloom` | `new H.JellyBloom(world, { x, y, count })` | any water |

## Run locally

```bash
node server.js
```

Then open http://localhost:8080. Set `AUTOMATON_PORT` to use another port.
