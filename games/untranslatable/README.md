# Untranslatable

A bluffing party game for 3 to 20 players about real words that have no neat English translation.

**Play:** https://untranslatable.apps.automaton.monster/

## How to play

1. A real word appears, such as *Kummerspeck* (German).
2. Everyone secretly writes a fake meaning that sounds convincing.
3. All fakes are shuffled with the real meaning, and everyone votes for the one they believe.
4. Finding the real meaning scores **+2**. Every colleague who falls for your fake gives you **+1**.

A game of 7 words takes about 15 minutes. The host creates a room (optionally with a password), shares the link, and controls when the next word starts.

## How it works

- `server.js`: a dependency-free Node.js HTTP server that serves the frontend and the JSON game API.
- `game.js`: rooms, players, phases, and scoring. Rooms live in memory.
- `words.js`: the curated word bank.
- `farewell.js`: a one-time farewell message, shown once and then never again (tracked in `AUTOMATON_APP_DATA_DIR`).
- `public/`: the plain HTML, CSS, and JavaScript frontend. Browsers poll the room state once a second, because Automaton's runtime routing does not support WebSockets.

## Run locally

```bash
node server.js
```

Then open http://localhost:8080. Set `AUTOMATON_PORT` to use another port.

## Deploy

```bash
automaton validate
automaton deploy
```

The deployment contract is in `automaton.json`.
