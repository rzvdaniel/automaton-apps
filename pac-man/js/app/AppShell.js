import { LOCAL_STORAGE_KEYS } from '../core/constants.js';
import { Level } from '../core/Level.js';
import { PublishedLevelCatalog } from '../core/PublishedLevelCatalog.js';
import { EditorController } from '../editor/EditorController.js';
import { GameEngine } from '../game/GameEngine.js';
import { ThemeRegistry } from '../themes/ThemeRegistry.js';
import { ScreenController } from './ScreenController.js';

export class AppShell {
    constructor(root) {
        this.root = root;
        this.currentLevel = Level.createStarterLevel();
        this.catalog = new PublishedLevelCatalog();
        this.catalogData = null;
        this.publishedLevels = [];
        this.randomPoolLevels = [];
        this.lastRandomLevelId = null;
        this.selectedPublishedLevelId = null;
        this.screenController = new ScreenController(root);
        this.themeRegistry = new ThemeRegistry();
        this.publishedLevelSelect = root.querySelector('[data-role="published-level-select"]');
        this.publishedLevelName = root.querySelector('[data-role="published-level-name"]');
        this.publishedLevelDescription = root.querySelector('[data-role="published-level-description"]');
        this.publishedLevelDifficulty = root.querySelector('[data-role="published-level-difficulty"]');
        this.publishedLevelFlags = root.querySelector('[data-role="published-level-flags"]');
        this.publishedLevelCount = root.querySelector('[data-role="published-level-count"]');
        this.publishedLevelStatus = root.querySelector('[data-role="published-level-status"]');
        this.brandTitle = root.querySelector('[data-role="brand-title"]');
        this.brandSubtitle = root.querySelector('[data-role="brand-subtitle"]');
        const editorScreen = root.querySelector('.screen[data-screen="editor"]');
        const playScreen = root.querySelector('.screen[data-screen="play"]');
        this.editor = new EditorController({
            root: editorScreen,
            onLevelReady: (level) => this.playLevel(level)
        });
        this.game = new GameEngine({ root: playScreen });
        this.bindShellEvents();
    }

    async initialize() {
        const themeSelect = this.root.querySelector('[data-role="theme-select"]');
        this.themeRegistry.hydrateSelect(themeSelect);
        await this.hydratePublishedLevels();
        this.updateHeaderBrand();
    }

    bindShellEvents() {
        this.root.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action]');
            if (!target) {
                return;
            }

            void this.handleAction(target);
        });

        this.publishedLevelSelect?.addEventListener('change', (event) => {
            this.setSelectedPublishedLevelId(event.target.value);
            this.renderPublishedLevelSummary('Ready to launch selected maze.');
        });
    }

    async handleAction(target) {
        const { action } = target.dataset;

        if (action === 'show-screen') {
            this.screenController.show(target.dataset.screen);
            this.updateHeaderBrand();
        }

        if (action === 'go-home') {
            this.screenController.show('home');
            this.updateHeaderBrand();
        }

        if (action === 'play-current-level') {
            this.playLevel(this.currentLevel.clone(), true);
        }

        if (action === 'play-default-level') {
            await this.playDefaultPublishedLevel();
        }

        if (action === 'play-featured-level') {
            await this.playFeaturedPublishedLevel();
        }

        if (action === 'play-selected-level') {
            await this.playSelectedPublishedLevel();
        }

        if (action === 'play-random-level') {
            await this.playRandomPublishedLevel();
        }

        if (action === 'restart-game') {
            this.game.restart();
        }

        if (action === 'pause-game') {
            this.game.togglePause();
        }

        if (action === 'toggle-difficulty') {
            this.game.toggleDifficulty();
        }
    }

    playLevel(level, jumpToPlay = true) {
        this.currentLevel = level.clone();
        this.game.loadLevel(this.currentLevel);
        if (jumpToPlay) {
            this.screenController.show('play');
        }
        this.updateHeaderBrand();
    }

    updateHeaderBrand() {
        if (!this.brandTitle || !this.brandSubtitle) {
            return;
        }

        if (this.root.dataset.activeScreen === 'play') {
            this.brandTitle.textContent = this.currentLevel?.metadata?.name ?? 'Arcade Run';
            this.brandSubtitle.textContent = 'Arcade run';
            return;
        }

        this.brandTitle.textContent = 'Pac-Man Studio';
        this.brandSubtitle.textContent = 'Editor and arcade runtime';
    }

    async hydratePublishedLevels() {
        try {
            const catalog = await this.catalog.loadCatalog();
            this.catalogData = catalog;
            this.publishedLevels = await this.catalog.listPublishedLevels();
            this.randomPoolLevels = await this.catalog.listRandomPoolLevels();
            this.renderPublishedLevelOptions();

            let entry = null;
            let level = null;
            const preferredLevelId = localStorage.getItem(LOCAL_STORAGE_KEYS.selectedPublishedLevel);

            if (preferredLevelId && this.publishedLevels.some((item) => item.id === preferredLevelId)) {
                try {
                    level = await this.catalog.loadLevelById(preferredLevelId);
                    entry = this.publishedLevels.find((item) => item.id === preferredLevelId) ?? null;
                } catch {
                    localStorage.removeItem(LOCAL_STORAGE_KEYS.selectedPublishedLevel);
                }
            }

            if (!entry || !level) {
                const safeDefault = await this.catalog.loadSafeDefaultLevel();
                entry = safeDefault.entry ?? this.publishedLevels.find((item) => item.id === catalog.defaultLevelId) ?? null;
                level = safeDefault.level;
            }

            this.setSelectedPublishedLevelId(entry?.id ?? null);
            this.playLevel(level, false);
            this.renderPublishedLevelSummary('Published maze rotation ready.');
        } catch (error) {
            this.currentLevel = Level.createStarterLevel();
            this.playLevel(this.currentLevel.clone(), false);
            this.renderPublishedLevelOptions();
            this.renderPublishedLevelSummary(error instanceof Error ? error.message : 'Published levels are unavailable.');
        }
    }

    getCatalogEntry(levelId) {
        return this.catalogData?.levels.find((item) => item.id === levelId) ?? null;
    }

    renderPublishedLevelOptions() {
        if (!this.publishedLevels.length) {
            if (this.publishedLevelSelect) {
                this.publishedLevelSelect.innerHTML = '<option value="">No published mazes available</option>';
                this.publishedLevelSelect.disabled = true;
            }
            if (this.publishedLevelCount) {
                this.publishedLevelCount.textContent = '0 published mazes';
            }
            return;
        }

        if (this.publishedLevelSelect) {
            this.publishedLevelSelect.disabled = false;
            this.publishedLevelSelect.innerHTML = this.publishedLevels.map((entry) => `
                <option value="${entry.id}">${entry.title}</option>
            `).join('');

            if (this.selectedPublishedLevelId) {
                this.publishedLevelSelect.value = this.selectedPublishedLevelId;
            }
        }

        if (this.publishedLevelCount) {
            this.publishedLevelCount.textContent = `${this.publishedLevels.length} listed · ${this.randomPoolLevels.length} random pool`;
        }
    }

    renderPublishedLevelSummary(message = '') {
        const entry = this.getCatalogEntry(this.selectedPublishedLevelId);

        if (this.publishedLevelName) {
            this.publishedLevelName.textContent = entry?.title ?? 'Starter Level fallback';
        }

        if (this.publishedLevelDescription) {
            this.publishedLevelDescription.textContent = entry?.description ?? 'Using the built-in fallback maze because the published catalog is unavailable.';
        }

        if (this.publishedLevelDifficulty) {
            this.publishedLevelDifficulty.textContent = entry?.difficulty ?? 'Fallback';
        }

        if (this.publishedLevelFlags) {
            const flags = this.buildPublishedLevelFlags(entry);
            this.publishedLevelFlags.innerHTML = flags.map((flag) => `<span class="published-level-tag">${flag}</span>`).join('');
        }

        if (this.publishedLevelStatus) {
            this.publishedLevelStatus.textContent = message || 'Choose a published maze or launch a random run.';
        }
    }

    buildPublishedLevelFlags(entry) {
        if (!entry) {
            return ['Fallback'];
        }

        const flags = [];

        if (entry.id === this.catalogData?.defaultLevelId) {
            flags.push('Default Opening');
        }

        if (entry.isFeatured) {
            flags.push('Featured');
        }

        flags.push(entry.isListed === false ? 'Hidden From Picker' : 'Listed');
        flags.push(entry.includeInRandom === false ? 'Manual Only' : 'Random Pool');

        return flags;
    }

    setSelectedPublishedLevelId(levelId) {
        this.selectedPublishedLevelId = levelId;
        if (levelId) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.selectedPublishedLevel, levelId);
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEYS.selectedPublishedLevel);
        }

        if (this.publishedLevelSelect && levelId) {
            this.publishedLevelSelect.value = levelId;
        }
    }

    async playDefaultPublishedLevel() {
        try {
            const { entry, level } = await this.catalog.loadSafeDefaultLevel();
            this.setSelectedPublishedLevelId(entry?.id ?? null);
            this.renderPublishedLevelSummary(`Loaded default opening maze: ${entry?.title ?? level.metadata.name}.`);
            this.playLevel(level, true);
        } catch (error) {
            this.renderPublishedLevelSummary(error instanceof Error ? error.message : 'Unable to load the default opening maze.');
        }
    }

    async playFeaturedPublishedLevel() {
        try {
            const { entry, level } = await this.catalog.loadFeaturedLevel();
            this.setSelectedPublishedLevelId(entry.id);
            this.renderPublishedLevelSummary(`Loaded featured maze: ${entry.title}.`);
            this.playLevel(level, true);
        } catch (error) {
            this.renderPublishedLevelSummary(error instanceof Error ? error.message : 'Unable to load the featured maze.');
        }
    }

    async playSelectedPublishedLevel() {
        const entry = this.publishedLevels.find((item) => item.id === this.selectedPublishedLevelId);
        if (!entry) {
            this.renderPublishedLevelSummary('Choose a published maze before launching it.');
            return;
        }

        try {
            const level = await this.catalog.loadLevelById(entry.id);
            this.renderPublishedLevelSummary(`Loaded ${entry.title}.`);
            this.playLevel(level, true);
        } catch (error) {
            this.renderPublishedLevelSummary(error instanceof Error ? error.message : 'Unable to load the selected maze.');
        }
    }

    async playRandomPublishedLevel() {
        try {
            const excludeLevelIds = [this.lastRandomLevelId, this.selectedPublishedLevelId].filter(Boolean);
            const { entry, level } = await this.catalog.loadRandomLevel(excludeLevelIds);
            this.lastRandomLevelId = entry.id;
            this.setSelectedPublishedLevelId(entry.id);
            this.renderPublishedLevelSummary(`Random pick: ${entry.title}.`);
            this.playLevel(level, true);
        } catch (error) {
            this.renderPublishedLevelSummary(error instanceof Error ? error.message : 'Random play is unavailable right now.');
        }
    }
}