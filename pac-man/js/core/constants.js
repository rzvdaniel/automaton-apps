export const GRID_COLUMNS = 19;
export const GRID_ROWS = 21;
export const MAX_HISTORY = 80;
export const LOCAL_STORAGE_KEYS = {
    draft: 'pacman-studio.draft',
    savedLevels: 'pacman-studio.saved-levels',
    theme: 'pacman-studio.theme'
};

export const TILE_TYPES = {
    EMPTY: 'empty',
    WALL: 'wall',
    DOT: 'dot',
    POWER_PELLET: 'power-pellet',
    PACMAN_SPAWN: 'pacman-spawn',
    GHOST_RED: 'ghost-red',
    GHOST_PINK: 'ghost-pink',
    GHOST_BLUE: 'ghost-blue',
    GHOST_ORANGE: 'ghost-orange'
};

export const TOOL_DEFINITIONS = [
    { id: TILE_TYPES.WALL, label: 'Wall', meta: 'Solid maze tile' },
    { id: TILE_TYPES.DOT, label: 'Dot', meta: 'Standard pellet' },
    { id: TILE_TYPES.POWER_PELLET, label: 'Power', meta: 'Frighten ghosts' },
    { id: TILE_TYPES.PACMAN_SPAWN, label: 'Pac-Man', meta: 'Single spawn point' },
    { id: TILE_TYPES.GHOST_RED, label: 'Blinky', meta: 'Red ghost spawn' },
    { id: TILE_TYPES.GHOST_PINK, label: 'Pinky', meta: 'Pink ghost spawn' },
    { id: TILE_TYPES.GHOST_BLUE, label: 'Inky', meta: 'Blue ghost spawn' },
    { id: TILE_TYPES.GHOST_ORANGE, label: 'Clyde', meta: 'Orange ghost spawn' },
    { id: TILE_TYPES.EMPTY, label: 'Eraser', meta: 'Clear tile' }
];

export const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

export const DIRECTION_ORDER = Object.keys(DIRECTIONS);

export const OPPOSITE_DIRECTIONS = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
};

export const GHOST_IDS = [
    TILE_TYPES.GHOST_RED,
    TILE_TYPES.GHOST_PINK,
    TILE_TYPES.GHOST_BLUE,
    TILE_TYPES.GHOST_ORANGE
];

export const THEMES = [
    { id: 'classic-pixel', label: 'Classic Pixel' },
    { id: 'sunset-arcade', label: 'Sunset Arcade' }
];

export const SCORE_VALUES = {
    dot: 10,
    powerPellet: 50,
    ghost: 200
};

export const GHOST_MODE_TIMINGS = {
    scatter: 7,
    chase: 20,
    frightened: 8
};

export const GAME_DEFAULTS = {
    lives: 3,
    pacmanSpeed: 5.4,
    ghostSpeed: 4.8,
    frightenedGhostSpeed: 3.3,
    ghostRespawnSpeed: 6.1
};