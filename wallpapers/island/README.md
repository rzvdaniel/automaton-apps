# Island Wallpaper

A living island for your desktop. Every load builds a different scene: islands, meadows, a fishing boat, fish, gulls, clouds and whoever lives there.

## What reacts

- **The sea:** click for rings; fish bolt and gulls veer away. The pointer leaves a faint wake.
- **Islanders:** click a cat, dog or person and it runs off.
- **Things:** trees shake, the lighthouse beam toggles, the campfire sparks, the boat speeds up.
- **Clouds:** click one and it dissolves.
- **The whale:** crosses the deep water now and then; click it.

`?seed=123` repeats a scene, `?theme=Dusk` or `?theme=Arctic` changes the colours, and `N` makes a new scene.

## Use it as a wallpaper

On Windows, [Lively Wallpaper](https://www.rocksdanister.com/lively/) shows a web page as the desktop background. Give it the app's address, or `public/index.html` from this folder.

## How it works

- `public/scene.js`: a WebGL fragment shader paints sea, shore, sand and meadow; a 2D canvas above it draws everything else.
- `public/objects.js`: the objects, drawn in code.
- `server.js`: a dependency-free Node.js server for the page. Nothing is stored.

## Run locally

```bash
node server.js
```

Then open http://localhost:8080. Set `AUTOMATON_PORT` to use another port.
