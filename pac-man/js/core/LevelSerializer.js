import { Level } from './Level.js';

export class LevelSerializer {
    static serialize(level) {
        return JSON.stringify(level.toJSON(), null, 2);
    }

    static deserialize(text) {
        const parsed = JSON.parse(text);
        return Level.fromJSON(parsed);
    }

    static download(level) {
        const blob = new Blob([LevelSerializer.serialize(level)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeName = (level.metadata.name || 'pacman-level').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        link.href = url;
        link.download = `${safeName}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
}