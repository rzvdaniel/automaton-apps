# Pac-Man App

- Automaton app root: `c:\Work\automaton-apps\pac-man` with existing appId `044fa195-b5e5-4cc9-9c11-5d5733dcdbb0`.
- Current implementation is a static front-end app: `index.html`, `css/`, `js/`, `assets/`.
- Upload verified via zip POST to local Automaton server; no backend runner required for current scope.
- App shell contains Home, Editor, and Play screens with shared `Level` model and `localStorage` persistence.
- Published mazes now live in `assets/levels/` and are indexed by `assets/levels/catalog.json`.
- `catalog.json` now uses per-level flags: `isFeatured`, `isListed`, and `includeInRandom`, while `defaultLevelId` defines the first maze shown to every player.
- Editor saves remain local to the browser. Admin publishing flow is: export JSON, add the file under `assets/levels/`, update `catalog.json`, then upload the app bundle to Automaton.