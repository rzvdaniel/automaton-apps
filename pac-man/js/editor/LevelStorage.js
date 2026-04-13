import { LOCAL_STORAGE_KEYS } from '../core/constants.js';
import { Level } from '../core/Level.js';

export class LevelStorage {
    saveDraft(level) {
        localStorage.setItem(LOCAL_STORAGE_KEYS.draft, JSON.stringify(level.toJSON()));
    }

    loadDraft() {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.draft);
        return raw ? Level.fromJSON(JSON.parse(raw)) : null;
    }

    saveNamedLevel(level) {
        const collection = this.getAllNamedLevels();
        const entry = {
            id: crypto.randomUUID(),
            savedAt: new Date().toISOString(),
            level: level.toJSON()
        };
        collection.unshift(entry);
        localStorage.setItem(LOCAL_STORAGE_KEYS.savedLevels, JSON.stringify(collection.slice(0, 12)));
        return entry;
    }

    replaceNamedLevel(id, level) {
        const collection = this.getAllNamedLevels().map((entry) => (entry.id === id
            ? { ...entry, savedAt: new Date().toISOString(), level: level.toJSON() }
            : entry));
        localStorage.setItem(LOCAL_STORAGE_KEYS.savedLevels, JSON.stringify(collection));
    }

    removeNamedLevel(id) {
        const nextCollection = this.getAllNamedLevels().filter((entry) => entry.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEYS.savedLevels, JSON.stringify(nextCollection));
    }

    getAllNamedLevels() {
        return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.savedLevels) ?? '[]');
    }
}