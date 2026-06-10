# Architecture

Space Invaders is a canvas-based browser game built with vanilla JavaScript (ES modules) and Vite. This document describes the module system, data flow, and extension patterns.

---

## Folder Structure

```
src/
  main.js                        Entry point — DOM scaffold, wires GameApp
  game.js                        Legacy monolith (kept for reference; unused)
  render.js                      Canvas rendering — renderScene entry point
  config.js                      Constants: PALETTE, WORLD, STORAGE_KEYS, sprites
  audio.js                       Web Audio API sound engine
  background-effects.js          Stars + nebula parallax layers
  ufo-encounter.js               UFO state machine (spawn, move, hit)
  settings.js                    loadSettings / saveSettings (localStorage)
  settings-panel.js              Settings overlay interaction (keyboard + pointer)
  overlay-layout.js              Layout math for pause + settings panels
  debug-panel.js                 Debug wave-jump dialog (Shift+D)

  game/
    GameApp.js                   Wires all modules; owns game state; public API
    GameLoop.js                  requestAnimationFrame owner; calls onTick(dt)
    GameState.js                 createInitialState() — pure factory for state shape

  input/
    InputController.js           Keyboard + touch pointer; exposes moveLeft/moveRight/firing

  entities/
    Player.js                    Player constants, createPlayerState, clampPlayerX, updatePlayerMovement
    Enemy.js                     createEnemy factory, ENEMY_RANK_SCORES
    EnemyFormation.js            Grid movement: step, drop, direction, wall detection
    Projectile.js                createPlayerBullet / createEnemyBullet factories

  systems/
    CollisionSystem.js           Pure AABB: rectFromCenter, rectFromTopLeft, intersects
    ProjectileManager.js         Bullet arrays: add, update (move + filter), clear
    WaveManager.js               getWaveConfig (pure) + WaveManager.spawnWave (mutates state)
    ScoreManager.js              Score, lives, high score persistence

  rendering/
    Renderer.js                  Thin class wrapping renderScene from render.js
    HudRenderer.js               drawHud — score/wave/lives bar
    SpriteFactory.js             getCachedSprite, getScanlineCanvas, drawPixelSprite

  audio/
    AudioManager.js              Re-exports createAudioManager from audio.js

  content/
    enemies.js                   EnemyDefinition objects (id, points, behaviour)
    levels.js                    LevelDefinition objects (background, formation rules)
    backgrounds.js               BackgroundDefinition objects (image, tint, glow)

  tests/
    CollisionSystem.test.js
    WaveManager.test.js
    Player.test.js
    ProjectileManager.test.js
    ScoreManager.test.js
    GameState.test.js
    integration/
      game-flow.test.js
```

---

## Game Loop Flow

```
GameLoop.start()
  └─ requestAnimationFrame(tick)
       └─ onTick(dt)                    ← GameApp registers this
            ├─ state.elapsed += dt
            ├─ GameApp.update(dt)       → returns desktopMode
            │    ├─ backgroundEffects.update(dt)
            │    ├─ InputController reads moveLeft/moveRight/firing
            │    ├─ player movement + shooting
            │    ├─ ProjectileManager.update(dt)
            │    ├─ enemy step/drop logic
            │    ├─ enemy fire logic
            │    ├─ CollisionSystem: bullet↔enemy, bullet↔UFO, bullet↔player, enemy↔player
            │    └─ wave clear → WaveManager.spawnWave()
            └─ Renderer.render(state, elapsed, desktopMode)
                 └─ renderScene() in render.js
                      ├─ drawBackground (backgroundEffects)
                      ├─ drawParticles
                      ├─ drawEnemy / drawEnemyArrival / drawUfo
                      ├─ drawProjectiles
                      ├─ drawShip
                      ├─ drawHud
                      ├─ drawOverlay (title / pause / game-over / intermission / settings)
                      └─ drawEffects (scanlines + vignette + flash)
```

---

## How Input Becomes Player Actions

1. `InputController` owns `window.addEventListener('keydown/keyup/blur')` and pointer event bindings on the three touch zone buttons.
2. It exposes three boolean getters: `moveLeft`, `moveRight`, `firing`.
3. Each `update(dt)` call in GameApp reads these getters — no event queuing needed.
4. `clearPointer()` is called on `window blur` (via InputController itself) and from `game.clearPointer()` (called by main.js).
5. For game-start and mute/pause toggles, InputController calls the `onStartGame`, `onToggleMute`, `onTogglePause` callbacks passed at construction.

---

## How Collisions Are Handled

All collision logic lives in `src/systems/CollisionSystem.js` as **pure functions**:

| Function | Description |
|---|---|
| `rectFromCenter(entity)` | Returns `{left, right, top, bottom}` for a center-origin entity |
| `rectFromTopLeft(entity)` | Returns rect for a top-left-origin entity |
| `intersects(a, b)` | AABB overlap test — returns boolean |

GameApp calls these directly in `update(dt)`:
- **Player bullet ↔ enemy**: `intersects(rectFromCenter(bullet), rectFromTopLeft(enemy))`
- **Player bullet ↔ UFO**: delegated to `UfoEncounter.tryHit(bulletRect, wave)`
- **Enemy bullet ↔ player**: `intersects(rectFromCenter(bullet), rectFromCenter(player))`
- **Enemy body ↔ player**: `intersects(rectFromCenter(enemy), rectFromCenter(player))` + y-floor check

---

## How to Add a New Enemy Type

1. **Add a definition** in `src/content/enemies.js`:
   ```js
   {
     id: 'shielded',
     displayName: 'Shield Drone',
     spriteId: 'shielded',
     health: 2,            // absorbs two hits
     points: 75,
     movementPattern: 'formation',
     fireRate: 0.8,
     projectileType: 'standard',
     specialBehavior: null
   }
   ```

2. **Add sprites** to `ENEMY_SPRITES` in `src/config.js` (8×8 bit strings for `shielded` and `shieldedAlt`).

3. **Assign the rank** in `WaveManager.spawnWave` (or in `LEVEL_DEFINITIONS[n].enemyFormation.rowAssignment`) — e.g. return `'shielded'` for specific rows.

4. **Render it** in `render.js` `drawEnemy()`: add a colour/glow case for `enemy.rank === 'shielded'`.

5. **Handle health > 1** in the bullet↔enemy loop in `GameApp.update()`: decrement `enemy.health` before setting `enemy.alive = false`.

---

## How to Add a New Level

1. **Add a background** if needed in `src/content/backgrounds.js` and `src/content/levels.js`.

2. **Add a level definition** in `src/content/levels.js`:
   ```js
   {
     id: 2,
     name: 'Asteroid Belt',
     backgroundId: 'asteroid-bg',
     enemyFormation: {
       enemyTypes: ['grunt', 'shielded'],
       rowAssignment(row) {
         return row % 2 === 0 ? 'shielded' : 'grunt'
       }
     },
     waveRules: { type: 'endless', startWave: 1 },
     musicTheme: null,
     difficultyModifiers: { enemyFireRateMultiplier: 1.2 }
   }
   ```

3. **Pass the level definition** to `WaveManager.spawnWave` (add a `levelDef` option) and use `levelDef.enemyFormation.rowAssignment(row)` instead of the hard-coded rank logic to determine enemy ranks.

4. **Load the background image** from `levelDef.backgroundId` → look up in `BACKGROUND_DEFINITIONS` → set `backgroundImage.src`.

---

## How to Add a Power-Up

1. **Define the power-up** shape (e.g. `{ x, y, type: 'rapid-fire', width, height }`).

2. **Spawn it** when an enemy is destroyed (randomly, or for specific ranks) — push it to a `state.powerUps` array.

3. **Render it** in `render.js` inside `renderScene` — draw a glowing sprite at `powerUp.x, powerUp.y`.

4. **Move it** in `GameApp.update(dt)` — drift downward like an enemy bullet.

5. **Collect it** with a player collision check (`intersects(rectFromTopLeft(powerUp), rectFromCenter(player))`):
   - Apply the effect (e.g. `state.player.cooldown *= 0.4` for rapid fire)
   - Remove from `state.powerUps`
   - Spawn particles and play a sound

6. **Expire the effect** after a timer in `update(dt)`.

---

## Key Invariants

- `state` is a single mutable object owned by `GameApp`. Modules receive it by reference and mutate it during `spawnWave`.
- `state.bullets` and `state.enemyBullets` are kept in sync with `ProjectileManager` arrays after every mutating call.
- `renderScene` in `render.js` is the sole rendering entry point — it reads `state` as a snapshot.
- All pure logic (collision, wave math, score, player movement) is DOM-free and directly unit-testable.
- `localStorage` access is isolated to `GameState.js` (read on init), `ScoreManager.persistHighScore()`, and `settings.js`.
