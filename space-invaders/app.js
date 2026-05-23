const STORAGE_KEYS = {
  bestScore: "space-invaders-best-score",
};

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const startButton = document.querySelector('[data-action="start"]');
const pauseButton = document.querySelector('[data-action="pause"]');
const installButton = document.querySelector('[data-action="install"]');
const overlay = document.querySelector('[data-ui="overlay"]');
const overlayKicker = document.querySelector('[data-ui="overlay-kicker"]');
const overlayTitle = document.querySelector('[data-ui="overlay-title"]');
const overlayCopy = document.querySelector('[data-ui="overlay-copy"]');
const liveRegion = document.querySelector('[data-ui="live"]');
const scoreNode = document.querySelector('[data-ui="score"]');
const livesNode = document.querySelector('[data-ui="lives"]');
const waveNode = document.querySelector('[data-ui="wave"]');
const bestNode = document.querySelector('[data-ui="best"]');
const statusNode = document.querySelector('[data-ui="status"]');
const controlButtons = document.querySelectorAll('[data-control]');

const SCREEN = { width: 480, height: 640 };
const PLAYER = { width: 38, height: 20, y: SCREEN.height - 72, speed: 280 };
const LASER_SPEED = 420;
const ENEMY_BULLET_SPEED = 180;
const INVASION_LINE = SCREEN.height - 138;

let animationFrame = 0;
let lastFrame = 0;
let deferredInstallPrompt = null;

const standaloneMedia = window.matchMedia("(display-mode: standalone)");

const inputState = {
  left: false,
  right: false,
  fire: false,
};

const stars = Array.from({ length: 36 }, (_, index) => ({
  x: (index * 97) % SCREEN.width,
  y: (index * 53) % SCREEN.height,
  speed: 8 + (index % 5) * 6,
  size: index % 3 === 0 ? 2 : 1,
}));

const game = {
  state: "ready",
  score: 0,
  bestScore: Number(localStorage.getItem(STORAGE_KEYS.bestScore) || 0),
  lives: 3,
  wave: 1,
  enemyDirection: 1,
  enemyStepDown: 18,
  enemySpeed: 24,
  enemyFireCooldown: 0.9,
  fireCooldown: 0,
  player: null,
  aliens: [],
  bullets: [],
  enemyBullets: [],
  shields: [],
  effects: [],
  statusText: "Standing by",
  overlay: {
    kicker: "Ready",
    title: "Press Start",
    copy: "Use arrow keys or touch controls to move. Fire before the invasion line breaks.",
  },
};

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setOverlay(visible, kicker, title, copy) {
  overlay.classList.toggle("is-hidden", !visible);
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
}

function announce(message) {
  liveRegion.textContent = message;
}

function syncUi() {
  scoreNode.textContent = formatScore(game.score);
  livesNode.textContent = String(game.lives);
  waveNode.textContent = String(game.wave);
  bestNode.textContent = formatScore(game.bestScore);
  statusNode.textContent = game.statusText;

  if (game.state === "running") {
    setOverlay(false, "", "", "");
  } else {
    setOverlay(true, game.overlay.kicker, game.overlay.title, game.overlay.copy);
  }
}

function resetPlayer() {
  game.player = {
    x: SCREEN.width / 2 - PLAYER.width / 2,
    y: PLAYER.y,
    width: PLAYER.width,
    height: PLAYER.height,
    speed: PLAYER.speed,
    flashTimer: 0,
  };
}

function createAliens() {
  const rows = 5;
  const cols = 8;
  const aliens = [];
  const startX = 48;
  const startY = 86;
  const gapX = 44;
  const gapY = 36;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      aliens.push({
        x: startX + col * gapX,
        y: startY + row * gapY,
        width: 26,
        height: 18,
        row,
        points: row < 1 ? 40 : row < 3 ? 20 : 10,
        wiggle: Math.random() * Math.PI * 2,
        alive: true,
      });
    }
  }

  game.aliens = aliens;
}

function createShields() {
  const shields = [];
  const shieldWidth = 72;
  const gap = 32;
  const totalWidth = shieldWidth * 3 + gap * 2;
  const startX = (SCREEN.width - totalWidth) / 2;

  for (let index = 0; index < 3; index += 1) {
    const x = startX + index * (shieldWidth + gap);
    const cells = [];

    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        if ((row === 3 && col < 2) || (row === 3 && col > 6)) {
          continue;
        }

        cells.push({
          x: x + col * 8,
          y: SCREEN.height - 180 + row * 8,
          hp: 3,
        });
      }
    }

    shields.push(cells);
  }

  game.shields = shields;
}

function resetWaveState() {
  game.enemyDirection = 1;
  game.enemyStepDown = 16 + game.wave * 1.5;
  game.enemySpeed = 24 + (game.wave - 1) * 9;
  game.enemyFireCooldown = Math.max(0.22, 0.92 - game.wave * 0.08);
  game.bullets = [];
  game.enemyBullets = [];
  game.effects = [];
  createAliens();
  createShields();
  resetPlayer();
}

function startGame() {
  game.score = 0;
  game.lives = 3;
  game.wave = 1;
  game.state = "running";
  game.statusText = "Mission active";
  game.overlay = { kicker: "Wave 1", title: "Defend Earth", copy: "Destroy the invasion before the line reaches the city." };
  resetWaveState();
  announce("Mission started");
  syncUi();
}

function pauseGame() {
  if (game.state !== "running") {
    return;
  }

  game.state = "paused";
  game.statusText = "Paused";
  game.overlay = { kicker: "Paused", title: "Transmission Hold", copy: "Press pause again or tap Start Mission to continue." };
  syncUi();
}

function resumeGame() {
  if (game.state !== "paused") {
    return;
  }

  game.state = "running";
  game.statusText = "Mission active";
  syncUi();
}

function loseLife() {
  game.lives -= 1;
  game.player.flashTimer = 0.8;
  game.bullets = [];
  game.enemyBullets = [];

  if (game.lives <= 0) {
    gameOver();
    return;
  }

  resetPlayer();
  game.statusText = "Hull hit";
  announce(`Life lost. ${game.lives} remaining.`);
  syncUi();
}

function finishWave() {
  game.wave += 1;
  game.statusText = `Wave ${game.wave} incoming`;
  game.overlay = {
    kicker: `Wave ${game.wave}`,
    title: "Alien formation inbound",
    copy: "The fleet is accelerating. Tap Start Mission to launch the next defense.",
  };
  game.state = "paused";
  resetWaveState();
  announce(`Wave ${game.wave} ready`);
  syncUi();
}

function gameOver() {
  game.state = "gameover";
  game.statusText = "Earth overrun";
  game.overlay = {
    kicker: "Game Over",
    title: "Invasion Complete",
    copy: "Press Start Mission for another run. Protect the skyline and chase a higher score.",
  };
  if (game.score > game.bestScore) {
    game.bestScore = game.score;
    localStorage.setItem(STORAGE_KEYS.bestScore, String(game.bestScore));
    announce(`New best score ${game.bestScore}`);
  } else {
    announce("Game over");
  }
  syncUi();
}

function firePlayerLaser() {
  if (game.fireCooldown > 0 || game.state !== "running") {
    return;
  }

  game.bullets.push({
    x: game.player.x + game.player.width / 2 - 2,
    y: game.player.y - 10,
    width: 4,
    height: 12,
    speed: LASER_SPEED,
  });
  game.fireCooldown = 0.32;
}

function maybeFireEnemyBullet(delta) {
  game.enemyFireCooldown -= delta;
  if (game.enemyFireCooldown > 0 || game.aliens.length === 0) {
    return;
  }

  const columns = new Map();
  for (const alien of game.aliens) {
    const key = Math.round(alien.x / 20);
    const current = columns.get(key);
    if (!current || current.y < alien.y) {
      columns.set(key, alien);
    }
  }

  const shooters = [...columns.values()];
  const shooter = shooters[Math.floor(Math.random() * shooters.length)];
  if (shooter) {
    game.enemyBullets.push({
      x: shooter.x + shooter.width / 2 - 2,
      y: shooter.y + shooter.height,
      width: 4,
      height: 12,
      speed: ENEMY_BULLET_SPEED + game.wave * 10,
    });
  }

  game.enemyFireCooldown = Math.max(0.2, 1 - game.wave * 0.06 - game.aliens.length * 0.006);
}

function collideRect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function damageShield(projectile) {
  for (const shield of game.shields) {
    for (let index = shield.length - 1; index >= 0; index -= 1) {
      const cell = shield[index];
      const block = { x: cell.x, y: cell.y, width: 8, height: 8 };
      if (collideRect(projectile, block)) {
        cell.hp -= 1;
        if (cell.hp <= 0) {
          shield.splice(index, 1);
        }
        return true;
      }
    }
  }

  return false;
}

function updateProjectiles(delta) {
  game.fireCooldown = Math.max(0, game.fireCooldown - delta);

  for (let index = game.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = game.bullets[index];
    bullet.y -= bullet.speed * delta;
    if (bullet.y + bullet.height < 0) {
      game.bullets.splice(index, 1);
      continue;
    }
    if (damageShield(bullet)) {
      game.bullets.splice(index, 1);
      continue;
    }
    for (let alienIndex = game.aliens.length - 1; alienIndex >= 0; alienIndex -= 1) {
      const alien = game.aliens[alienIndex];
      if (collideRect(bullet, alien)) {
        game.score += alien.points;
        game.effects.push({ x: alien.x + alien.width / 2, y: alien.y + alien.height / 2, ttl: 0.2 });
        game.aliens.splice(alienIndex, 1);
        game.bullets.splice(index, 1);
        if (game.score > game.bestScore) {
          game.bestScore = game.score;
          localStorage.setItem(STORAGE_KEYS.bestScore, String(game.bestScore));
        }
        syncUi();
        break;
      }
    }
  }

  for (let index = game.enemyBullets.length - 1; index >= 0; index -= 1) {
    const bullet = game.enemyBullets[index];
    bullet.y += bullet.speed * delta;
    if (bullet.y > SCREEN.height) {
      game.enemyBullets.splice(index, 1);
      continue;
    }
    if (damageShield(bullet)) {
      game.enemyBullets.splice(index, 1);
      continue;
    }
    if (collideRect(bullet, game.player)) {
      game.enemyBullets.splice(index, 1);
      loseLife();
    }
  }
}

function updatePlayer(delta) {
  if (inputState.left && !inputState.right) {
    game.player.x -= game.player.speed * delta;
  }
  if (inputState.right && !inputState.left) {
    game.player.x += game.player.speed * delta;
  }
  game.player.x = clamp(game.player.x, 18, SCREEN.width - game.player.width - 18);
  game.player.flashTimer = Math.max(0, game.player.flashTimer - delta);

  if (inputState.fire) {
    firePlayerLaser();
  }
}

function updateAliens(delta) {
  if (game.aliens.length === 0) {
    finishWave();
    return;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const speedBoost = Math.max(1, (40 - game.aliens.length) * 0.03 + 1);
  for (const alien of game.aliens) {
    alien.x += game.enemyDirection * game.enemySpeed * speedBoost * delta;
    alien.wiggle += delta * 4;
    minX = Math.min(minX, alien.x);
    maxX = Math.max(maxX, alien.x + alien.width);
    maxY = Math.max(maxY, alien.y + alien.height);
  }

  if (maxX >= SCREEN.width - 24 || minX <= 24) {
    game.enemyDirection *= -1;
    for (const alien of game.aliens) {
      alien.y += game.enemyStepDown;
    }
  }

  if (maxY >= INVASION_LINE) {
    gameOver();
    return;
  }

  maybeFireEnemyBullet(delta);
}

function updateEffects(delta) {
  for (let index = game.effects.length - 1; index >= 0; index -= 1) {
    const effect = game.effects[index];
    effect.ttl -= delta;
    if (effect.ttl <= 0) {
      game.effects.splice(index, 1);
    }
  }
}

function updateStars(delta) {
  for (const star of stars) {
    star.y += star.speed * delta;
    if (star.y > SCREEN.height) {
      star.y = -4;
      star.x = (star.x + 97) % SCREEN.width;
    }
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, SCREEN.height);
  sky.addColorStop(0, "#040910");
  sky.addColorStop(0.65, "#08101c");
  sky.addColorStop(1, "#0b2116");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);

  ctx.fillStyle = "rgba(133, 240, 255, 0.85)";
  for (const star of stars) {
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  ctx.fillStyle = "rgba(158, 255, 111, 0.12)";
  ctx.fillRect(0, INVASION_LINE, SCREEN.width, 3);

  ctx.fillStyle = "#1f3347";
  ctx.fillRect(0, SCREEN.height - 28, SCREEN.width, 28);
}

function drawPlayer() {
  ctx.save();
  if (game.player.flashTimer > 0 && Math.floor(game.player.flashTimer * 10) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  ctx.fillStyle = "#85f0ff";
  ctx.fillRect(game.player.x + 12, game.player.y, 14, 6);
  ctx.fillRect(game.player.x + 6, game.player.y + 6, 26, 6);
  ctx.fillRect(game.player.x, game.player.y + 12, 38, 8);
  ctx.restore();
}

function drawAlien(alien) {
  const wiggle = Math.sin(alien.wiggle) > 0 ? 1 : 0;
  const color = alien.row < 1 ? "#ffd166" : alien.row < 3 ? "#9eff6f" : "#ff6f91";
  ctx.fillStyle = color;
  ctx.fillRect(alien.x + 6, alien.y, 14, 4);
  ctx.fillRect(alien.x + 2, alien.y + 4, 22, 6);
  ctx.fillRect(alien.x, alien.y + 10, 26, 4);
  ctx.fillRect(alien.x + 4, alien.y + 14, 4, 4);
  ctx.fillRect(alien.x + 18, alien.y + 14, 4, 4);
  ctx.fillRect(alien.x + (wiggle ? 1 : 5), alien.y + 16, 4, 2);
  ctx.fillRect(alien.x + (wiggle ? 21 : 17), alien.y + 16, 4, 2);
}

function drawShields() {
  for (const shield of game.shields) {
    for (const cell of shield) {
      const alpha = 0.35 + cell.hp * 0.2;
      ctx.fillStyle = `rgba(158, 255, 111, ${alpha})`;
      ctx.fillRect(cell.x, cell.y, 7, 7);
    }
  }
}

function drawBullets() {
  ctx.fillStyle = "#85f0ff";
  for (const bullet of game.bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }

  ctx.fillStyle = "#ff6f91";
  for (const bullet of game.enemyBullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
}

function drawEffects() {
  for (const effect of game.effects) {
    const radius = 4 + (1 - effect.ttl / 0.2) * 10;
    ctx.strokeStyle = `rgba(255, 209, 102, ${effect.ttl / 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGroundHud() {
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fillRect(24, SCREEN.height - 16, SCREEN.width - 48, 2);
}

function render() {
  drawBackground();
  drawShields();
  for (const alien of game.aliens) {
    drawAlien(alien);
  }
  drawBullets();
  drawPlayer();
  drawEffects();
  drawGroundHud();
}

function tick(timestamp) {
  const delta = Math.min(0.032, (timestamp - lastFrame) / 1000 || 0);
  lastFrame = timestamp;

  updateStars(delta);

  if (game.state === "running") {
    updatePlayer(delta);
    updateProjectiles(delta);
    updateAliens(delta);
    updateEffects(delta);
  }

  render();
  animationFrame = window.requestAnimationFrame(tick);
}

function setControlState(control, isActive) {
  inputState[control] = isActive;
  document.querySelector(`[data-control="${control}"]`)?.classList.toggle("is-active", isActive);
}

function bindButtonHold(button, control) {
  const activate = (event) => {
    event.preventDefault();
    setControlState(control, true);
    if (control === "fire") {
      firePlayerLaser();
    }
  };

  const release = (event) => {
    event.preventDefault();
    setControlState(control, false);
  };

  button.addEventListener("pointerdown", activate);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
}

function handleKeyChange(event, isActive) {
  const key = event.key.toLowerCase();
  if (["arrowleft", "a"].includes(key)) {
    inputState.left = isActive;
    event.preventDefault();
  }
  if (["arrowright", "d"].includes(key)) {
    inputState.right = isActive;
    event.preventDefault();
  }
  if (key === " ") {
    inputState.fire = isActive;
    if (isActive) {
      firePlayerLaser();
    }
    event.preventDefault();
  }
  if (key === "enter" && isActive && ["ready", "gameover"].includes(game.state)) {
    startGame();
  }
  if (key === "p" && isActive) {
    if (game.state === "running") {
      pauseGame();
    } else if (game.state === "paused") {
      resumeGame();
    }
  }
}

function setupPwa() {
  const syncInstallVisibility = () => {
    const isStandalone = standaloneMedia.matches || window.navigator.standalone === true;
    if (isStandalone) {
      installButton.classList.add("hidden");
    }
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        game.statusText = "Offline mode unavailable";
        syncUi();
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!standaloneMedia.matches && window.navigator.standalone !== true) {
      installButton.classList.remove("hidden");
    }
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
    game.statusText = "Installed mode ready";
    syncUi();
  });

  standaloneMedia.addEventListener("change", syncInstallVisibility);
  syncInstallVisibility();
}

function setupUiEvents() {
  startButton.addEventListener("click", () => {
    if (game.state === "paused") {
      resumeGame();
      return;
    }
    startGame();
  });

  pauseButton.addEventListener("click", () => {
    if (game.state === "running") {
      pauseGame();
    } else if (game.state === "paused") {
      resumeGame();
    }
  });

  controlButtons.forEach((button) => {
    bindButtonHold(button, button.dataset.control);
  });

  canvas.addEventListener("pointerdown", () => {
    if (game.state === "ready" || game.state === "gameover") {
      startGame();
    } else if (game.state === "paused") {
      resumeGame();
    }
  });

  window.addEventListener("keydown", (event) => handleKeyChange(event, true));
  window.addEventListener("keyup", (event) => handleKeyChange(event, false));
  window.addEventListener("blur", () => {
    inputState.left = false;
    inputState.right = false;
    inputState.fire = false;
  });
}

function init() {
  ctx.imageSmoothingEnabled = false;
  canvas.width = SCREEN.width;
  canvas.height = SCREEN.height;
  resetWaveState();
  game.statusText = "Standing by";
  syncUi();
  setupUiEvents();
  setupPwa();
  animationFrame = window.requestAnimationFrame(tick);
}

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame);
});

init();