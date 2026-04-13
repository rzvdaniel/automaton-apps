import { TILE_TYPES } from '../core/constants.js';
import { Entity } from './Entity.js';

export class PacMan extends Entity {
    constructor(options) {
        super(options);
        this.mouthTimer = 0;
        this.animationFrame = 0;
    }

    update(level, deltaSeconds) {
        super.update(level, deltaSeconds);
        this.mouthTimer += deltaSeconds;
        if (this.mouthTimer > 0.1) {
            this.animationFrame = (this.animationFrame + 1) % 4;
            this.mouthTimer = 0;
        }
    }

    consume(level) {
        const tileX = Math.round(this.position.x);
        const tileY = Math.round(this.position.y);
        const tile = level.getTile(tileX, tileY);
        if (tile === TILE_TYPES.DOT || tile === TILE_TYPES.POWER_PELLET) {
            level.setTile(tileX, tileY, TILE_TYPES.EMPTY);
            return tile;
        }

        return null;
    }
}