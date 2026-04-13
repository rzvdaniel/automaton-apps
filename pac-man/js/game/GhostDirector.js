import { GHOST_MODE_TIMINGS } from '../core/constants.js';

export class GhostDirector {
    constructor() {
        this.mode = 'scatter';
        this.modeTimer = 0;
        this.frightenedTimer = 0;
    }

    update(deltaSeconds) {
        if (this.frightenedTimer > 0) {
            this.frightenedTimer -= deltaSeconds;
            if (this.frightenedTimer <= 0) {
                this.mode = 'scatter';
                this.modeTimer = 0;
            }
            return this.mode;
        }

        this.modeTimer += deltaSeconds;
        if (this.mode === 'scatter' && this.modeTimer >= GHOST_MODE_TIMINGS.scatter) {
            this.mode = 'chase';
            this.modeTimer = 0;
        } else if (this.mode === 'chase' && this.modeTimer >= GHOST_MODE_TIMINGS.chase) {
            this.mode = 'scatter';
            this.modeTimer = 0;
        }

        return this.mode;
    }

    frighten() {
        this.mode = 'frightened';
        this.frightenedTimer = GHOST_MODE_TIMINGS.frightened;
    }
}