import { GHOST_MODE_TIMINGS } from '../core/constants.js';

export class GhostDirector {
    constructor(options = {}) {
        this.mode = 'scatter';
        this.patternMode = 'scatter';
        this.modeTimer = 0;
        this.frightenedTimer = 0;
        this.frightenedDuration = options.frightenedDuration ?? GHOST_MODE_TIMINGS.frightened;
    }

    update(deltaSeconds) {
        if (this.frightenedTimer > 0) {
            this.frightenedTimer -= deltaSeconds;
            if (this.frightenedTimer <= 0) {
                this.mode = this.patternMode;
                this.modeTimer = 0;
            }
            return this.mode;
        }

        this.modeTimer += deltaSeconds;
        if (this.patternMode === 'scatter' && this.modeTimer >= GHOST_MODE_TIMINGS.scatter) {
            this.patternMode = 'chase';
            this.modeTimer = 0;
        } else if (this.patternMode === 'chase' && this.modeTimer >= GHOST_MODE_TIMINGS.chase) {
            this.patternMode = 'scatter';
            this.modeTimer = 0;
        }

        this.mode = this.patternMode;

        return this.mode;
    }

    frighten() {
        this.mode = 'frightened';
        this.frightenedTimer = this.frightenedDuration;
    }

    isFrightenedFlashing() {
        return this.mode === 'frightened' && this.frightenedTimer > 0 && this.frightenedTimer <= GHOST_MODE_TIMINGS.frightenedFlashStart;
    }

    updateDifficulty(options = {}) {
        this.frightenedDuration = options.frightenedDuration ?? this.frightenedDuration;
    }
}