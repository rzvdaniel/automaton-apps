import { GAME_DEFAULTS, GHOST_IDS, TILE_TYPES } from '../core/constants.js';
import { distanceBetween } from '../core/GridMath.js';
import { GameSession } from './GameSession.js';
import { Ghost } from './Ghost.js';
import { GhostDirector } from './GhostDirector.js';
import { InputController } from './InputController.js';
import { MazeRenderer } from './MazeRenderer.js';
import { PacMan } from './PacMan.js';

export class GameEngine {
    constructor({ root }) {
        this.root = root;
        this.canvas = root.querySelector('[data-role="game-canvas"]');
        this.scoreElement = root.querySelector('[data-role="score-value"]');
        this.livesElement = root.querySelector('[data-role="lives-value"]');
        this.pelletsElement = root.querySelector('[data-role="pellets-value"]');
        this.modeElement = root.querySelector('[data-role="mode-value"]');
        this.message = root.querySelector('[data-role="play-message"]');
        this.messageTitle = root.querySelector('[data-role="play-message-title"]');
        this.messageSubtitle = root.querySelector('[data-role="play-message-subtitle"]');
        this.messageActions = root.querySelector('[data-role="play-message-actions"]');
        this.renderer = new MazeRenderer(this.canvas);
        this.input = new InputController(root, (direction) => this.pacman?.setNextDirection(direction));
        this.input.attach();
        this.animationFrame = null;
        this.lastTimestamp = 0;
        this.level = null;
        this.session = null;
        this.ghostDirector = null;
        this.pacman = null;
        this.ghosts = [];
        this.pauseRequested = false;
        this.freezeGameplay = false;
        this.resumeTimer = null;
    }

    loadLevel(level) {
        this.level = level.clone();
        this.session = new GameSession(this.level);
        this.pauseRequested = false;
        this.ghostDirector = new GhostDirector();
        this.createActors();
        this.pauseForMessage('Ready!', { state: 'ready' });
        this.lastTimestamp = 0;
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = requestAnimationFrame((timestamp) => this.loop(timestamp));
        this.updateHud();
    }

    createActors() {
        const pacmanSpawn = this.level.getPacmanSpawn() ?? { x: 1, y: this.level.rows - 2 };
        this.pacman = new PacMan({ x: pacmanSpawn.x, y: pacmanSpawn.y, speed: GAME_DEFAULTS.pacmanSpeed, direction: 'left' });
        this.ghosts = this.level.getGhostSpawns().map((spawn) => new Ghost({
            x: spawn.x,
            y: spawn.y,
            speed: GAME_DEFAULTS.ghostSpeed,
            direction: 'left',
            id: spawn.type
        }));

        if (this.ghosts.length === 0) {
            this.ghosts = GHOST_IDS.slice(0, 1).map((ghostId) => new Ghost({
                x: Math.floor(this.level.columns / 2),
                y: Math.floor(this.level.rows / 2),
                speed: GAME_DEFAULTS.ghostSpeed,
                direction: 'left',
                id: ghostId
            }));
        }
    }

    loop(timestamp) {
        if (!this.level || !this.session) {
            return;
        }

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, 0.033);
        this.lastTimestamp = timestamp;

        if (!this.pauseRequested && !this.freezeGameplay && this.session.status !== 'game-over' && this.session.status !== 'won') {
            this.update(deltaSeconds);
        }

        this.renderer.render(this.level, this.pacman, this.ghosts);
        this.updateHud();
        this.animationFrame = requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
    }

    update(deltaSeconds) {
        const mode = this.ghostDirector.update(deltaSeconds);
        this.pacman.update(this.level, deltaSeconds);
        const consumedTile = this.pacman.consume(this.level);
        if (consumedTile) {
            this.session.addConsumable(consumedTile);
            if (consumedTile === TILE_TYPES.POWER_PELLET) {
                this.ghostDirector.frighten();
            }
        }

        for (const ghost of this.ghosts) {
            ghost.update(this.level, deltaSeconds, this.pacman, this.ghostDirector.mode);
        }

        this.checkGhostCollisions();

        if (this.level.getPelletCount() === 0) {
            this.session.win();
            this.showMessage('Stage Clear', {
                state: 'won',
                subtitle: 'The maze is clear. Run it again or head back home.',
                actions: [
                    { label: 'Play Again', action: 'restart-game', variant: 'primary' },
                    { label: 'Home', action: 'show-screen', screen: 'home' }
                ]
            });
        }

        if (this.session.status === 'resetting') {
            this.resetRound();
        }
    }

    checkGhostCollisions() {
        let ghostMultiplier = 1;
        for (const ghost of this.ghosts) {
            const collisionDistance = this.pacman.radius + ghost.radius;
            if (distanceBetween(this.pacman.position, ghost.position) > collisionDistance) {
                continue;
            }

            if (ghost.mode === 'frightened') {
                ghost.isEaten = true;
                this.session.addGhostBonus(ghostMultiplier);
                ghostMultiplier += 1;
                continue;
            }

            if (!ghost.isEaten) {
                this.session.loseLife();
                if (this.session.status === 'game-over') {
                    this.showMessage('Game Over', {
                        state: 'game-over',
                        subtitle: 'Jump back into the maze or return to the home screen.',
                        actions: [
                            { label: 'Play Again', action: 'restart-game', variant: 'primary' },
                            { label: 'Home', action: 'show-screen', screen: 'home' }
                        ]
                    });
                }
                break;
            }
        }
    }

    resetRound() {
        this.pacman.reset();
        this.ghosts.forEach((ghost) => ghost.reset());
        this.session.status = 'ready';
        this.pauseForMessage(this.session.lastMessage, { state: 'message' });
    }

    updateHud() {
        if (!this.session) {
            return;
        }
        this.scoreElement.textContent = String(this.session.score);
        this.livesElement.textContent = String(this.session.lives);
        this.pelletsElement.textContent = String(this.level.getPelletCount());
        this.modeElement.textContent = this.pauseRequested ? 'Paused' : this.ghostDirector.mode;
    }

    showMessage(message, options = {}) {
        const { state = 'message', subtitle = '', actions = [] } = options;
        if (!this.message || !this.messageTitle || !this.messageSubtitle || !this.messageActions) {
            return;
        }

        const actionsMarkup = actions.length
            ? actions.map((item) => `
                <button class="${item.variant === 'primary' ? 'cta-button' : 'control-button'}" data-action="${item.action}"${item.screen ? ` data-screen="${item.screen}"` : ''} type="button">${item.label}</button>
            `).join('')
            : '';

        this.message.dataset.state = state;
        this.messageTitle.textContent = message;
        this.messageSubtitle.textContent = subtitle;
        this.messageSubtitle.classList.toggle('is-hidden', !subtitle);
        this.messageActions.innerHTML = actionsMarkup;
        this.messageActions.classList.toggle('is-hidden', !actions.length);
        this.message.classList.remove('is-hidden');
    }

    hideMessage() {
        if (!this.message) {
            return;
        }

        this.message.classList.add('is-hidden');
        this.message.dataset.state = '';
    }

    pauseForMessage(message, options = {}, durationMs = 1000) {
        window.clearTimeout(this.resumeTimer);
        this.freezeGameplay = true;
        this.showMessage(message, options);
        this.resumeTimer = window.setTimeout(() => {
            this.freezeGameplay = false;
            this.hideMessage();
        }, durationMs);
    }

    restart() {
        if (this.level) {
            this.loadLevel(this.level);
        }
    }

    togglePause() {
        this.pauseRequested = !this.pauseRequested;
        if (this.pauseRequested) {
            this.showMessage('Paused', {
                state: 'paused',
                subtitle: 'Press Pause again to resume.'
            });
        } else {
            if (!this.freezeGameplay) {
                this.hideMessage();
            }
        }
    }
}