import { DIRECTIONS } from '../core/constants.js';
import { getTileAhead, isNearCenter, isWalkable, snapToCenter, wrapColumn, wrapPositionColumn } from '../core/GridMath.js';

export class Entity {
    constructor({ x, y, speed, direction = 'left' }) {
        this.position = { x, y };
        this.spawn = { x, y };
        this.speed = speed;
        this.direction = direction;
        this.nextDirection = direction;
        this.radius = 0.36;
    }

    reset() {
        this.position = { ...this.spawn };
        this.direction = 'left';
        this.nextDirection = 'left';
    }

    setNextDirection(direction) {
        if (DIRECTIONS[direction]) {
            this.nextDirection = direction;
        }
    }

    update(level, deltaSeconds) {
        let remainingDistance = this.speed * deltaSeconds;

        while (remainingDistance > 0) {
            if (isNearCenter(this.position, 0.001)) {
                this.position = snapToCenter({ x: Math.round(this.position.x), y: Math.round(this.position.y) });
            }

            const atCenter = Number.isInteger(this.position.x) && Number.isInteger(this.position.y);
            if (atCenter) {
                if (this.canMove(level, this.nextDirection)) {
                    this.direction = this.nextDirection;
                } else if (!this.canMove(level, this.direction)) {
                    return;
                }
            }

            const vector = DIRECTIONS[this.direction] ?? { x: 0, y: 0 };
            const distanceToCenter = this.getDistanceToNextCenter(vector);
            const stepDistance = Math.min(remainingDistance, distanceToCenter);
            this.position = {
                x: wrapPositionColumn(this.position.x + vector.x * stepDistance, level.columns),
                y: this.position.y + vector.y * stepDistance
            };
            remainingDistance -= stepDistance;

            if (stepDistance === distanceToCenter) {
                this.position = snapToCenter({ x: Math.round(this.position.x), y: Math.round(this.position.y) });
            } else {
                break;
            }
        }
    }

    canMove(level, direction) {
        const target = getTileAhead(this.position, direction);
        const wrappedX = wrapColumn(target.x, level.columns);

        if (!level.isInBounds(wrappedX, target.y)) {
            return false;
        }

        return isWalkable(level.getTile(wrappedX, target.y));
    }

    getDistanceToNextCenter(vector) {
        if (vector.x > 0) {
            return Number.isInteger(this.position.x) ? 1 : Math.ceil(this.position.x) - this.position.x;
        }

        if (vector.x < 0) {
            return Number.isInteger(this.position.x) ? 1 : this.position.x - Math.floor(this.position.x);
        }

        if (vector.y > 0) {
            return Number.isInteger(this.position.y) ? 1 : Math.ceil(this.position.y) - this.position.y;
        }

        if (vector.y < 0) {
            return Number.isInteger(this.position.y) ? 1 : this.position.y - Math.floor(this.position.y);
        }

        return 0;
    }
}