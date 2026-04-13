import { GAME_DEFAULTS, SCORE_VALUES, TILE_TYPES } from '../core/constants.js';

export class GameSession {
    constructor(level) {
        this.level = level;
        this.score = 0;
        this.lives = GAME_DEFAULTS.lives;
        this.status = 'ready';
        this.lastMessage = 'Ready!';
    }

    addConsumable(tileType) {
        if (tileType === TILE_TYPES.DOT) {
            this.score += SCORE_VALUES.dot;
        }

        if (tileType === TILE_TYPES.POWER_PELLET) {
            this.score += SCORE_VALUES.powerPellet;
        }
    }

    addGhostBonus(multiplier = 1) {
        this.score += SCORE_VALUES.ghost * multiplier;
    }

    loseLife() {
        this.lives -= 1;
        this.lastMessage = this.lives > 0 ? 'Caught by a ghost.' : 'Game over.';
        this.status = this.lives > 0 ? 'resetting' : 'game-over';
    }

    win() {
        this.status = 'won';
        this.lastMessage = 'Board cleared.';
    }
}