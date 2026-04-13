import { GAME_DEFAULTS, OPPOSITE_DIRECTIONS, TILE_TYPES } from '../core/constants.js';
import { distanceBetween, getTurnOptions, wrapColumn } from '../core/GridMath.js';
import { Entity } from './Entity.js';

const CORNERS = {
    [TILE_TYPES.GHOST_RED]: { x: 17, y: 1 },
    [TILE_TYPES.GHOST_PINK]: { x: 1, y: 1 },
    [TILE_TYPES.GHOST_BLUE]: { x: 17, y: 19 },
    [TILE_TYPES.GHOST_ORANGE]: { x: 1, y: 19 }
};

export class Ghost extends Entity {
    constructor({ x, y, speed, id, direction = 'left' }) {
        super({ x, y, speed, direction });
        this.id = id;
        this.mode = 'scatter';
        this.isEaten = false;
    }

    reset() {
        super.reset();
        this.mode = 'scatter';
        this.isEaten = false;
    }

    update(level, deltaSeconds, pacman, mode) {
        this.mode = this.isEaten ? 'respawn' : mode;
        this.speed = this.mode === 'frightened'
            ? GAME_DEFAULTS.frightenedGhostSpeed
            : this.mode === 'respawn'
                ? GAME_DEFAULTS.ghostRespawnSpeed
                : GAME_DEFAULTS.ghostSpeed;

        if (Math.abs(this.position.x - Math.round(this.position.x)) < 0.12 && Math.abs(this.position.y - Math.round(this.position.y)) < 0.12) {
            this.chooseDirection(level, pacman);
        }

        super.update(level, deltaSeconds);

        if (this.isEaten && distanceBetween(this.position, this.spawn) < 0.45) {
            this.isEaten = false;
        }
    }

    chooseDirection(level, pacman) {
        const allowReverse = this.mode === 'frightened';
        const options = getTurnOptions(level, this.position, this.direction, allowReverse);
        if (options.length === 0) {
            this.direction = OPPOSITE_DIRECTIONS[this.direction] ?? 'left';
            return;
        }

        if (this.mode === 'frightened') {
            const randomDirection = options[Math.floor(Math.random() * options.length)];
            this.nextDirection = randomDirection;
            this.direction = randomDirection;
            return;
        }

        const target = this.getTarget(pacman);
        const ranked = options.map((direction) => {
            const vector = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
            const candidate = {
                x: wrapColumn(Math.round(this.position.x) + vector[0], level.columns),
                y: Math.round(this.position.y) + vector[1]
            };
            return {
                direction,
                distance: distanceBetween(candidate, target)
            };
        }).sort((left, right) => left.distance - right.distance);

        this.nextDirection = ranked[0].direction;
        this.direction = ranked[0].direction;
    }

    getTarget(pacman) {
        if (this.mode === 'respawn') {
            return this.spawn;
        }

        if (this.mode === 'scatter') {
            return CORNERS[this.id] ?? this.spawn;
        }

        if (this.id === TILE_TYPES.GHOST_RED) {
            return pacman.position;
        }

        if (this.id === TILE_TYPES.GHOST_PINK) {
            return { x: pacman.position.x + 2, y: pacman.position.y - 2 };
        }

        if (this.id === TILE_TYPES.GHOST_BLUE) {
            return { x: pacman.position.x + 1, y: pacman.position.y + 2 };
        }

        const distance = distanceBetween(this.position, pacman.position);
        return distance > 4 ? pacman.position : CORNERS[this.id];
    }
}