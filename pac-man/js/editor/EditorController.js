import { MAX_HISTORY, TILE_TYPES } from '../core/constants.js';
import { tileTypeLabel } from '../core/GridMath.js';
import { Level } from '../core/Level.js';
import { LevelSerializer } from '../core/LevelSerializer.js';
import { LevelStorage } from './LevelStorage.js';
import { ToolPalette } from './ToolPalette.js';
import { ValidationPanel } from './ValidationPanel.js';

export class EditorController {
    constructor({ root, onLevelReady }) {
        this.root = root;
        this.onLevelReady = onLevelReady;
        this.gridElement = root.querySelector('[data-role="editor-grid"]');
        this.statusElement = root.querySelector('[data-role="editor-status"]');
        this.savedLevelsElement = root.querySelector('[data-role="saved-levels"]');
        this.form = root.querySelector('[data-role="level-form"]');
        this.storage = new LevelStorage();
        this.validationPanel = new ValidationPanel(root.querySelector('[data-role="validation-panel"]'));
        this.palette = new ToolPalette(root.querySelector('[data-role="tool-palette"]'), (toolId) => {
            this.activeTool = toolId;
            this.setStatus(`${tileTypeLabel(toolId)} selected.`);
        });
        this.activeTool = TILE_TYPES.WALL;
        this.level = this.storage.loadDraft() ?? Level.createStarterLevel();
        this.undoStack = [];
        this.redoStack = [];
        this.isPainting = false;
        this.render();
        this.attachEvents();
    }

    attachEvents() {
        this.gridElement.addEventListener('pointerdown', (event) => {
            const tile = event.target.closest('[data-x]');
            if (!tile) {
                return;
            }

            this.pushUndoState();
            this.isPainting = true;
            this.paintTile(Number(tile.dataset.x), Number(tile.dataset.y));
        });

        this.gridElement.addEventListener('pointerover', (event) => {
            const tile = event.target.closest('[data-x]');
            if (!tile) {
                return;
            }

            this.gridElement.querySelectorAll('.is-hovered').forEach((element) => element.classList.remove('is-hovered'));
            tile.classList.add('is-hovered');

            if (this.isPainting) {
                this.paintTile(Number(tile.dataset.x), Number(tile.dataset.y));
            }
        });

        window.addEventListener('pointerup', () => {
            this.isPainting = false;
        });

        this.root.addEventListener('click', (event) => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) {
                return;
            }

            const actionMap = {
                'new-level': () => this.setLevel(Level.createStarterLevel()),
                'clear-level': () => this.clearLevel(),
                undo: () => this.undo(),
                redo: () => this.redo(),
                'save-level': () => this.saveLevel(),
                'load-level': () => this.loadMostRecentLevel(),
                'save-draft': () => this.saveDraft(),
                'export-level': () => LevelSerializer.download(this.level),
                'test-level': () => this.testLevel()
            };

            actionMap[action]?.();
        });

        this.root.querySelector('[data-action="import-level"]').addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }

            const text = await file.text();
            this.setLevel(LevelSerializer.deserialize(text));
            this.setStatus(`Imported ${file.name}.`);
        });

        this.form.addEventListener('input', (event) => {
            const field = event.target.dataset.field;
            if (!field) {
                return;
            }

            this.level.metadata[field] = event.target.value;
            this.storage.saveDraft(this.level);
            this.renderPanels();
        });
    }

    render() {
        this.palette.render();
        this.renderGrid();
        this.renderForm();
        this.renderPanels();
    }

    renderGrid() {
        this.gridElement.style.gridTemplateColumns = `repeat(${this.level.columns}, minmax(0, 1fr))`;
        this.gridElement.innerHTML = '';

        for (let y = 0; y < this.level.rows; y += 1) {
            for (let x = 0; x < this.level.columns; x += 1) {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'tile';
                tile.dataset.x = String(x);
                tile.dataset.y = String(y);
                tile.dataset.tile = this.level.getTile(x, y);
                tile.ariaLabel = `${tileTypeLabel(this.level.getTile(x, y))} at ${x + 1}, ${y + 1}`;
                this.gridElement.appendChild(tile);
            }
        }
    }

    renderForm() {
        this.form.querySelector('[data-field="name"]').value = this.level.metadata.name;
        this.form.querySelector('[data-field="author"]').value = this.level.metadata.author;
    }

    renderPanels() {
        const validation = this.level.validate();
        this.validationPanel.render(validation);
        this.savedLevelsElement.innerHTML = this.storage.getAllNamedLevels().map((entry) => `
            <article class="saved-level-card" data-entry-id="${entry.id}">
                <div class="saved-level-card__row">
                    <div>
                        <div class="saved-level-card__title">${entry.level.metadata.name}</div>
                        <div>${new Date(entry.savedAt).toLocaleString()}</div>
                    </div>
                </div>
                <div class="saved-level-card__actions">
                    <button class="control-button" data-action="load-saved-entry" data-entry-id="${entry.id}" type="button">Load</button>
                    <button class="control-button" data-action="overwrite-saved-entry" data-entry-id="${entry.id}" type="button">Overwrite</button>
                    <button class="control-button" data-action="delete-saved-entry" data-entry-id="${entry.id}" type="button">Delete</button>
                </div>
            </article>
        `).join('');

        this.savedLevelsElement.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const entryId = button.dataset.entryId;
                if (!entryId) {
                    return;
                }

                if (button.dataset.action === 'load-saved-entry') {
                    const entry = this.storage.getAllNamedLevels().find((item) => item.id === entryId);
                    if (entry) {
                        this.setLevel(Level.fromJSON(entry.level));
                        this.setStatus(`Loaded ${entry.level.metadata.name}.`);
                    }
                }

                if (button.dataset.action === 'overwrite-saved-entry') {
                    this.storage.replaceNamedLevel(entryId, this.level);
                    this.renderPanels();
                    this.setStatus('Saved entry updated.');
                }

                if (button.dataset.action === 'delete-saved-entry') {
                    this.storage.removeNamedLevel(entryId);
                    this.renderPanels();
                    this.setStatus('Saved entry removed.');
                }
            });
        });
    }

    paintTile(x, y) {
        const currentTile = this.level.getTile(x, y);
        if (currentTile === this.activeTool) {
            return;
        }

        this.level.setTile(x, y, this.activeTool);
        const tileElement = this.gridElement.querySelector(`[data-x="${x}"][data-y="${y}"]`);
        if (tileElement) {
            tileElement.dataset.tile = this.activeTool;
            tileElement.ariaLabel = `${tileTypeLabel(this.activeTool)} at ${x + 1}, ${y + 1}`;
        }

        this.storage.saveDraft(this.level);
        this.renderPanels();
        this.setStatus(`Painted ${tileTypeLabel(this.activeTool)} at ${x + 1}, ${y + 1}.`);
    }

    pushUndoState() {
        this.undoStack.push(this.level.toJSON());
        if (this.undoStack.length > MAX_HISTORY) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    undo() {
        const previous = this.undoStack.pop();
        if (!previous) {
            return;
        }

        this.redoStack.push(this.level.toJSON());
        this.setLevel(Level.fromJSON(previous), false);
        this.setStatus('Undo applied.');
    }

    redo() {
        const next = this.redoStack.pop();
        if (!next) {
            return;
        }

        this.undoStack.push(this.level.toJSON());
        this.setLevel(Level.fromJSON(next), false);
        this.setStatus('Redo applied.');
    }

    clearLevel() {
        this.pushUndoState();
        this.level.clear();
        this.renderGrid();
        this.storage.saveDraft(this.level);
        this.renderPanels();
        this.setStatus('Level cleared.');
    }

    saveDraft() {
        this.storage.saveDraft(this.level);
        this.setStatus('Draft saved locally.');
    }

    saveLevel() {
        const validation = this.level.validate();
        if (!validation.isValid) {
            this.setStatus('Level has blocking validation issues.');
            return;
        }

        this.storage.saveNamedLevel(this.level);
        this.renderPanels();
        this.setStatus(`Saved ${this.level.metadata.name}.`);
    }

    loadMostRecentLevel() {
        const [entry] = this.storage.getAllNamedLevels();
        if (!entry) {
            this.setStatus('No saved levels available.');
            return;
        }

        this.setLevel(Level.fromJSON(entry.level));
        this.setStatus(`Loaded ${entry.level.metadata.name}.`);
    }

    testLevel() {
        const validation = this.level.validate();
        if (!validation.isValid) {
            this.setStatus('Fix blocking validation issues before testing.');
            return;
        }

        this.onLevelReady(this.level.clone());
        this.setStatus('Launching test run.');
    }

    setLevel(level, resetHistory = true) {
        this.level = level;
        if (resetHistory) {
            this.undoStack = [];
            this.redoStack = [];
        }
        this.storage.saveDraft(this.level);
        this.render();
    }

    setStatus(message) {
        this.statusElement.textContent = message;
    }
}