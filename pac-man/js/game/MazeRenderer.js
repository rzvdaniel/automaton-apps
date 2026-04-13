import { TILE_TYPES } from '../core/constants.js';

const GHOST_COLORS = {
    [TILE_TYPES.GHOST_RED]: 'var(--theme-red)',
    [TILE_TYPES.GHOST_PINK]: 'var(--theme-pink)',
    [TILE_TYPES.GHOST_BLUE]: 'var(--theme-blue)',
    [TILE_TYPES.GHOST_ORANGE]: 'var(--theme-orange)'
};

export class MazeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.tileSize = 32;
    }

    resize(level) {
        const container = this.canvas.parentElement;
        const measuredWidth = container?.clientWidth ?? 0;
        const fallbackWidth = this.canvas.width || 760;
        const usableWidth = measuredWidth > 24 ? measuredWidth - 12 : fallbackWidth;
        const width = Math.max(level.columns, Math.min(usableWidth, 760));
        const tileSize = Math.max(1, Math.floor(width / level.columns));
        this.tileSize = tileSize;
        this.canvas.width = tileSize * level.columns;
        this.canvas.height = tileSize * level.rows;
    }

    render(level, pacman, ghosts) {
        this.resize(level);
        const context = this.context;
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        context.fillStyle = getComputedStyle(document.body).getPropertyValue('--theme-bg') || '#040713';
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let y = 0; y < level.rows; y += 1) {
            for (let x = 0; x < level.columns; x += 1) {
                this.drawTile(level.getTile(x, y), x, y);
            }
        }

        ghosts.forEach((ghost) => this.drawGhost(ghost));
        this.drawPacman(pacman);
    }

    drawTile(tileType, x, y) {
        const context = this.context;
        const size = this.tileSize;
        const px = x * size;
        const py = y * size;

        if (tileType === TILE_TYPES.WALL) {
            context.fillStyle = getComputedStyle(document.body).getPropertyValue('--theme-maze') || '#2140e8';
            context.fillRect(px + 1, py + 1, size - 2, size - 2);
            context.strokeStyle = getComputedStyle(document.body).getPropertyValue('--theme-wall-shadow') || '#10217f';
            context.lineWidth = 2;
            context.strokeRect(px + 2, py + 2, size - 4, size - 4);
            return;
        }

        if (tileType === TILE_TYPES.DOT) {
            context.fillStyle = getComputedStyle(document.body).getPropertyValue('--theme-pellet') || '#f4efe1';
            context.beginPath();
            context.arc(px + size / 2, py + size / 2, size * 0.1, 0, Math.PI * 2);
            context.fill();
            return;
        }

        if (tileType === TILE_TYPES.POWER_PELLET) {
            context.fillStyle = getComputedStyle(document.body).getPropertyValue('--theme-power') || '#ffd25f';
            context.beginPath();
            context.arc(px + size / 2, py + size / 2, size * 0.2, 0, Math.PI * 2);
            context.fill();
            return;
        }
    }

    drawPacman(pacman) {
        const context = this.context;
        const size = this.tileSize;
        const x = pacman.position.x * size + size / 2;
        const y = pacman.position.y * size + size / 2;
        const mouthAngles = [0.18, 0.28, 0.14, 0.04];
        const mouth = mouthAngles[pacman.animationFrame] * Math.PI;
        const directions = {
            right: 0,
            left: Math.PI,
            up: -Math.PI / 2,
            down: Math.PI / 2
        };
        const rotation = directions[pacman.direction] ?? 0;

        context.save();
        context.translate(x, y);
        context.rotate(rotation);
        context.fillStyle = getComputedStyle(document.body).getPropertyValue('--theme-pacman') || '#f8d84e';
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, size * 0.36, mouth, Math.PI * 2 - mouth);
        context.closePath();
        context.fill();
        context.restore();
    }

    drawGhost(ghost) {
        const context = this.context;
        const size = this.tileSize;
        const x = ghost.position.x * size + size / 2;
        const y = ghost.position.y * size + size / 2;

        if (ghost.mode === 'respawn' || ghost.isEaten) {
            this.drawGhostEyes(x, y, size);
            return;
        }

        const frightenedColor = '#8fc9ff';
        const fill = ghost.mode === 'frightened' ? frightenedColor : (GHOST_COLORS[ghost.id] || '#ff5b6b');

        context.save();
        context.fillStyle = fill;
        context.beginPath();
        context.arc(x, y - size * 0.06, size * 0.3, Math.PI, 0);
        context.lineTo(x + size * 0.3, y + size * 0.23);
        context.lineTo(x + size * 0.16, y + size * 0.12);
        context.lineTo(x, y + size * 0.23);
        context.lineTo(x - size * 0.16, y + size * 0.12);
        context.lineTo(x - size * 0.3, y + size * 0.23);
        context.closePath();
        context.fill();

        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(x - size * 0.1, y - size * 0.03, size * 0.07, 0, Math.PI * 2);
        context.arc(x + size * 0.1, y - size * 0.03, size * 0.07, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#111827';
        context.beginPath();
        context.arc(x - size * 0.08, y - size * 0.03, size * 0.035, 0, Math.PI * 2);
        context.arc(x + size * 0.12, y - size * 0.03, size * 0.035, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    drawGhostEyes(x, y, size) {
        const context = this.context;

        context.save();
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(x - size * 0.1, y - size * 0.03, size * 0.09, 0, Math.PI * 2);
        context.arc(x + size * 0.1, y - size * 0.03, size * 0.09, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#2d7ff9';
        context.beginPath();
        context.arc(x - size * 0.07, y - size * 0.01, size * 0.045, 0, Math.PI * 2);
        context.arc(x + size * 0.13, y - size * 0.01, size * 0.045, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}