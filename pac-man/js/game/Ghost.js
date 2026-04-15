import { GAME_DEFAULTS, OPPOSITE_DIRECTIONS, TILE_TYPES } from '../core/constants.js';
import { distanceBetween, getTurnOptions, wrapColumn } from '../core/GridMath.js';
import { Entity } from './Entity.js';

const DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

const CORNERS = {
    [TILE_TYPES.GHOST_RED]: { x: 17, y: 1 },
    [TILE_TYPES.GHOST_PINK]: { x: 1, y: 1 },
    [TILE_TYPES.GHOST_BLUE]: { x: 17, y: 19 },
    [TILE_TYPES.GHOST_ORANGE]: { x: 1, y: 19 }
};

export class Ghost extends Entity {
    constructor({ x, y, speed, id, direction = 'left', speedProfile = {} }) {
        super({ x, y, speed, direction });
        this.id = id;
        this.mode = 'scatter';
        this.isEaten = false;
        this.speedProfile = {
            ghostSpeed: speedProfile.ghostSpeed ?? GAME_DEFAULTS.ghostSpeed,
            frightenedGhostSpeed: speedProfile.frightenedGhostSpeed ?? GAME_DEFAULTS.frightenedGhostSpeed,
            ghostRespawnSpeed: speedProfile.ghostRespawnSpeed ?? GAME_DEFAULTS.ghostRespawnSpeed
        };
    }

    reset() {
        super.reset();
        this.mode = 'scatter';
        this.isEaten = false;
    }

    update(level, deltaSeconds, pacman, ghosts, director) {
        this.mode = this.isEaten ? 'respawn' : director.mode;
        this.speed = this.mode === 'frightened'
            ? this.speedProfile.frightenedGhostSpeed
            : this.mode === 'respawn'
                ? this.speedProfile.ghostRespawnSpeed
                : this.speedProfile.ghostSpeed;

        if (Math.abs(this.position.x - Math.round(this.position.x)) < 0.12 && Math.abs(this.position.y - Math.round(this.position.y)) < 0.12) {
            this.chooseDirection(level, pacman, ghosts);
        }

        super.update(level, deltaSeconds);

        if (this.isEaten && distanceBetween(this.position, this.spawn) < 0.45) {
            this.isEaten = false;
        }
    }

    chooseDirection(level, pacman, ghosts) {
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

        const target = this.getTarget(pacman, ghosts, level);
        const ranked = options.map((direction) => {
            const vector = DIRECTION_VECTORS[direction];
            const candidate = {
                x: wrapColumn(Math.round(this.position.x) + vector.x, level.columns),
                y: Math.round(this.position.y) + vector.y
            };
            return {
                direction,
                distance: distanceBetween(candidate, target)
            };
        }).sort((left, right) => left.distance - right.distance);

        this.nextDirection = ranked[0].direction;
        this.direction = ranked[0].direction;
    }

    getTarget(pacman, ghosts, level) {
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
            return this.projectFromPacman(pacman, level, 4);
        }

        if (this.id === TILE_TYPES.GHOST_BLUE) {
            const blinky = ghosts.find((ghost) => ghost.id === TILE_TYPES.GHOST_RED && ghost !== this);
            const ambushPoint = this.projectFromPacman(pacman, level, 2);
            if (!blinky) {
                return ambushPoint;
            }

            return {
                x: wrapColumn(ambushPoint.x + (ambushPoint.x - blinky.position.x), level.columns),
                y: ambushPoint.y + (ambushPoint.y - blinky.position.y)
            };
        }

        const distance = distanceBetween(this.position, pacman.position);
        return distance > 6 ? pacman.position : CORNERS[this.id];
    }

    projectFromPacman(pacman, level, distance) {
        const direction = pacman.nextDirection ?? pacman.direction;
        const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.left;
        return {
            x: wrapColumn(Math.round(pacman.position.x + vector.x * distance), level.columns),
            y: Math.round(pacman.position.y + vector.y * distance)
        };
    }
}