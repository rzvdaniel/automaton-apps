import { DIRECTIONS, DIRECTION_ORDER, GHOST_IDS, OPPOSITE_DIRECTIONS, TILE_TYPES } from './constants.js';

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function wrapColumn(column, totalColumns) {
    if (column < 0) {
        return totalColumns - 1;
    }

    if (column >= totalColumns) {
        return 0;
    }

    return column;
}

export function wrapPositionColumn(column, totalColumns) {
    if (column < 0) {
        return totalColumns + column;
    }

    if (column >= totalColumns) {
        return column - totalColumns;
    }

    return column;
}

export function isGhostTile(tileType) {
    return GHOST_IDS.includes(tileType);
}

export function isWalkable(tileType) {
    return tileType !== TILE_TYPES.WALL;
}

export function isConsumable(tileType) {
    return tileType === TILE_TYPES.DOT || tileType === TILE_TYPES.POWER_PELLET;
}

export function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapToCenter(position) {
    return {
        x: Math.round(position.x * 1000) / 1000,
        y: Math.round(position.y * 1000) / 1000
    };
}

export function isNearCenter(position, tolerance = 0.12) {
    return Math.abs(position.x - Math.round(position.x)) < tolerance && Math.abs(position.y - Math.round(position.y)) < tolerance;
}

export function getTileAhead(position, direction) {
    const vector = DIRECTIONS[direction] ?? { x: 0, y: 0 };
    return {
        x: Math.round(position.x) + vector.x,
        y: Math.round(position.y) + vector.y
    };
}

export function getTurnOptions(level, position, previousDirection, allowReverse = false) {
    const options = [];

    for (const direction of DIRECTION_ORDER) {
        if (!allowReverse && previousDirection && OPPOSITE_DIRECTIONS[previousDirection] === direction) {
            continue;
        }

        const vector = DIRECTIONS[direction];
        const nextX = wrapColumn(Math.round(position.x) + vector.x, level.columns);
        const nextY = Math.round(position.y) + vector.y;

        if (!level.isInBounds(nextX, nextY)) {
            continue;
        }

        if (isWalkable(level.getTile(nextX, nextY))) {
            options.push(direction);
        }
    }

    return options;
}

export function tileTypeLabel(tileType) {
    const labels = {
        [TILE_TYPES.EMPTY]: 'Empty',
        [TILE_TYPES.WALL]: 'Wall',
        [TILE_TYPES.DOT]: 'Dot',
        [TILE_TYPES.POWER_PELLET]: 'Power Pellet',
        [TILE_TYPES.PACMAN_SPAWN]: 'Pac-Man Spawn',
        [TILE_TYPES.GHOST_RED]: 'Blinky Spawn',
        [TILE_TYPES.GHOST_PINK]: 'Pinky Spawn',
        [TILE_TYPES.GHOST_BLUE]: 'Inky Spawn',
        [TILE_TYPES.GHOST_ORANGE]: 'Clyde Spawn'
    };

    return labels[tileType] ?? tileType;
}