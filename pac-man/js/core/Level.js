import { GRID_COLUMNS, GRID_ROWS, GHOST_IDS, TILE_TYPES } from './constants.js';
import { isGhostTile } from './GridMath.js';

function buildStarterGrid() {
    const grid = Array.from({ length: GRID_ROWS }, (_, row) => Array.from({ length: GRID_COLUMNS }, (_, column) => {
        const isEdge = row === 0 || row === GRID_ROWS - 1 || column === 0 || column === GRID_COLUMNS - 1;
        if (isEdge) {
            return TILE_TYPES.WALL;
        }

        if ((row === 4 || row === 10 || row === 16) && column > 2 && column < GRID_COLUMNS - 3 && column !== 9) {
            return TILE_TYPES.WALL;
        }

        if ((column === 4 || column === 14) && row > 3 && row < GRID_ROWS - 4 && row !== 10) {
            return TILE_TYPES.WALL;
        }

        if (row === 10 && (column === 0 || column === GRID_COLUMNS - 1)) {
            return TILE_TYPES.EMPTY;
        }

        return TILE_TYPES.DOT;
    }));

    grid[GRID_ROWS - 3][Math.floor(GRID_COLUMNS / 2)] = TILE_TYPES.PACMAN_SPAWN;
    grid[2][2] = TILE_TYPES.POWER_PELLET;
    grid[2][GRID_COLUMNS - 3] = TILE_TYPES.POWER_PELLET;
    grid[GRID_ROWS - 3][2] = TILE_TYPES.POWER_PELLET;
    grid[GRID_ROWS - 3][GRID_COLUMNS - 3] = TILE_TYPES.POWER_PELLET;
    grid[8][8] = TILE_TYPES.GHOST_RED;
    grid[8][9] = TILE_TYPES.GHOST_PINK;
    grid[8][10] = TILE_TYPES.GHOST_BLUE;
    grid[8][11] = TILE_TYPES.GHOST_ORANGE;

    return grid;
}

export class Level {
    constructor(data = {}) {
        this.version = 1;
        this.columns = data.columns ?? GRID_COLUMNS;
        this.rows = data.rows ?? GRID_ROWS;
        this.metadata = {
            name: data.metadata?.name ?? 'Starter Level',
            author: data.metadata?.author ?? 'Pac-Man Studio',
            createdAt: data.metadata?.createdAt ?? new Date().toISOString(),
            updatedAt: data.metadata?.updatedAt ?? new Date().toISOString()
        };
        this.grid = data.grid ? data.grid.map((row) => [...row]) : buildStarterGrid();
    }

    static createStarterLevel() {
        return new Level();
    }

    static fromJSON(json) {
        return new Level({
            columns: json.columns,
            rows: json.rows,
            metadata: json.metadata,
            grid: json.grid
        });
    }

    clone() {
        return Level.fromJSON(this.toJSON());
    }

    isInBounds(x, y) {
        return y >= 0 && y < this.rows && x >= 0 && x < this.columns;
    }

    getTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return TILE_TYPES.WALL;
        }

        return this.grid[y][x];
    }

    setTile(x, y, tileType) {
        if (!this.isInBounds(x, y)) {
            return;
        }

        if (tileType === TILE_TYPES.PACMAN_SPAWN) {
            this.clearTileType(TILE_TYPES.PACMAN_SPAWN);
        }

        if (isGhostTile(tileType)) {
            this.clearTileType(tileType);
        }

        this.grid[y][x] = tileType;
        this.metadata.updatedAt = new Date().toISOString();
    }

    clearTileType(tileType) {
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                if (this.grid[y][x] === tileType) {
                    this.grid[y][x] = TILE_TYPES.EMPTY;
                }
            }
        }
    }

    clear() {
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                this.grid[y][x] = TILE_TYPES.EMPTY;
            }
        }
        this.metadata.updatedAt = new Date().toISOString();
    }

    countTiles(tileType) {
        let count = 0;

        for (const row of this.grid) {
            for (const tile of row) {
                if (tile === tileType) {
                    count += 1;
                }
            }
        }

        return count;
    }

    getPacmanSpawn() {
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                if (this.grid[y][x] === TILE_TYPES.PACMAN_SPAWN) {
                    return { x, y };
                }
            }
        }

        return null;
    }

    getGhostSpawns() {
        const spawns = [];

        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                const tile = this.grid[y][x];
                if (GHOST_IDS.includes(tile)) {
                    spawns.push({ x, y, type: tile });
                }
            }
        }

        return spawns;
    }

    getPelletCount() {
        return this.countTiles(TILE_TYPES.DOT) + this.countTiles(TILE_TYPES.POWER_PELLET);
    }

    getWalkableCount() {
        let count = 0;

        for (const row of this.grid) {
            for (const tile of row) {
                if (tile !== TILE_TYPES.WALL) {
                    count += 1;
                }
            }
        }

        return count;
    }

    validate() {
        const issues = [];
        const pacmanSpawn = this.getPacmanSpawn();
        const ghostSpawns = this.getGhostSpawns();
        const pelletCount = this.getPelletCount();
        const walkableCount = this.getWalkableCount();
        const wallCount = this.countTiles(TILE_TYPES.WALL);

        if (!pacmanSpawn) {
            issues.push({ severity: 'error', label: 'Pac-Man spawn', message: 'Add one Pac-Man spawn tile.' });
        }

        if (ghostSpawns.length === 0) {
            issues.push({ severity: 'error', label: 'Ghost spawns', message: 'Add at least one ghost spawn.' });
        }

        if (pelletCount < 20) {
            issues.push({ severity: 'warn', label: 'Pellets', message: 'Add more pellets for a fuller arcade run.' });
        }

        if (walkableCount === 0) {
            issues.push({ severity: 'error', label: 'Walkable space', message: 'Create a playable path through the maze.' });
        }

        if (wallCount > this.rows * this.columns * 0.7) {
            issues.push({ severity: 'warn', label: 'Wall density', message: 'The maze is very dense and may feel cramped.' });
        }

        for (const spawn of ghostSpawns) {
            if (spawn.x === pacmanSpawn?.x && spawn.y === pacmanSpawn?.y) {
                issues.push({ severity: 'error', label: 'Spawn overlap', message: 'Pac-Man and ghost spawn cannot share a tile.' });
            }
        }

        return {
            isValid: !issues.some((issue) => issue.severity === 'error'),
            issues,
            counts: {
                walls: wallCount,
                dots: this.countTiles(TILE_TYPES.DOT),
                powerPellets: this.countTiles(TILE_TYPES.POWER_PELLET),
                ghosts: ghostSpawns.length,
                walkable: walkableCount
            }
        };
    }

    toJSON() {
        return {
            version: this.version,
            columns: this.columns,
            rows: this.rows,
            metadata: { ...this.metadata },
            grid: this.grid.map((row) => [...row])
        };
    }
}