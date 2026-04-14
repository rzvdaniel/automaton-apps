import { Level } from './Level.js';

const CATALOG_PATH = './assets/levels/catalog.json';

export class PublishedLevelCatalog {
    constructor() {
        this.catalog = null;
        this.levelCache = new Map();
    }

    shuffleEntries(entries) {
        const shuffled = [...entries];

        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }

        return shuffled;
    }

    async loadFirstAvailableEntry(entries) {
        let lastError = null;

        for (const entry of entries) {
            if (!entry) {
                continue;
            }

            try {
                return {
                    entry,
                    level: await this.loadLevelById(entry.id)
                };
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError ?? new Error('No published levels are currently available.');
    }

    async loadCatalog() {
        if (this.catalog) {
            return this.catalog;
        }

        const response = await fetch(CATALOG_PATH);
        if (!response.ok) {
            throw new Error('Unable to load published level catalog.');
        }

        const catalog = await response.json();
        if (!catalog?.defaultLevelId || !Array.isArray(catalog?.levels)) {
            throw new Error('Published level catalog is malformed.');
        }

        this.catalog = catalog;
        return this.catalog;
    }

    async listPublishedLevels() {
        const catalog = await this.loadCatalog();
        return catalog.levels.filter((entry) => entry.isListed !== false);
    }

    async listRandomPoolLevels() {
        const catalog = await this.loadCatalog();
        return catalog.levels.filter((entry) => entry.includeInRandom !== false);
    }

    async getFeaturedEntry() {
        const catalog = await this.loadCatalog();
        return catalog.levels.find((entry) => entry.isFeatured) ?? catalog.levels.find((entry) => entry.id === catalog.defaultLevelId) ?? null;
    }

    async loadDefaultLevel() {
        const catalog = await this.loadCatalog();
        return this.loadLevelById(catalog.defaultLevelId);
    }

    async loadFeaturedLevel() {
        const catalog = await this.loadCatalog();
        const entry = await this.getFeaturedEntry();
        if (!entry && !catalog.levels.length) {
            throw new Error('No featured published level is configured.');
        }

        return this.loadFirstAvailableEntry([
            entry,
            catalog.levels.find((item) => item.id === catalog.defaultLevelId),
            ...catalog.levels.filter((item) => item.id !== entry?.id && item.id !== catalog.defaultLevelId)
        ]);
    }

    async loadLevelById(levelId) {
        if (this.levelCache.has(levelId)) {
            return this.levelCache.get(levelId).clone();
        }

        const catalog = await this.loadCatalog();
        const entry = catalog.levels.find((item) => item.id === levelId);
        if (!entry) {
            throw new Error(`Published level '${levelId}' was not found.`);
        }

        const response = await fetch(entry.assetPath);
        if (!response.ok) {
            throw new Error(`Unable to load level asset for '${entry.title}'.`);
        }

        const json = await response.json();
        const level = Level.fromJSON(json);
        const validation = level.validate();

        if (!validation.isValid) {
            throw new Error(`Published level '${entry.title}' has validation errors.`);
        }

        this.levelCache.set(levelId, level);
        return level.clone();
    }

    async loadRandomLevel(excludeLevelIds = []) {
        const catalog = await this.loadCatalog();
        const pool = catalog.levels.filter((entry) => entry.includeInRandom !== false);
        if (!pool.length) {
            throw new Error('No published levels are available for random play.');
        }

        const excluded = new Set(excludeLevelIds.filter(Boolean));
        const preferredPool = pool.filter((entry) => !excluded.has(entry.id));
        const candidatePool = preferredPool.length ? preferredPool : pool;

        return this.loadFirstAvailableEntry(this.shuffleEntries(candidatePool));
    }

    async loadSafeDefaultLevel() {
        const catalog = await this.loadCatalog();

        try {
            return {
                entry: catalog.levels.find((item) => item.id === catalog.defaultLevelId) ?? null,
                level: await this.loadLevelById(catalog.defaultLevelId)
            };
        } catch (error) {
            const fallbackEntry = catalog.levels.find((item) => item.id !== catalog.defaultLevelId);
            if (!fallbackEntry) {
                throw error;
            }

            return {
                entry: fallbackEntry,
                level: await this.loadLevelById(fallbackEntry.id)
            };
        }
    }
}