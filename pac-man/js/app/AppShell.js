import { Level } from '../core/Level.js';
import { EditorController } from '../editor/EditorController.js';
import { GameEngine } from '../game/GameEngine.js';
import { ThemeRegistry } from '../themes/ThemeRegistry.js';
import { ScreenController } from './ScreenController.js';

export class AppShell {
    constructor(root) {
        this.root = root;
        this.currentLevel = Level.createStarterLevel();
        this.screenController = new ScreenController(root);
        this.themeRegistry = new ThemeRegistry();
        const editorScreen = root.querySelector('.screen[data-screen="editor"]');
        const playScreen = root.querySelector('.screen[data-screen="play"]');
        this.editor = new EditorController({
            root: editorScreen,
            onLevelReady: (level) => this.playLevel(level)
        });
        this.game = new GameEngine({ root: playScreen });
        this.bindShellEvents();
        this.themeRegistry.hydrateSelect(root.querySelector('[data-role="theme-select"]'));
        this.playLevel(this.currentLevel.clone(), false);
    }

    bindShellEvents() {
        this.root.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action]');
            if (!target) {
                return;
            }

            const { action } = target.dataset;

            if (action === 'show-screen') {
                this.screenController.show(target.dataset.screen);
            }

            if (action === 'go-home') {
                this.screenController.show('home');
            }

            if (action === 'play-current-level') {
                this.playLevel(this.editor.level.clone(), true);
            }

            if (action === 'restart-game') {
                this.game.restart();
            }

            if (action === 'pause-game') {
                this.game.togglePause();
            }
        });
    }

    playLevel(level, jumpToPlay = true) {
        this.currentLevel = level.clone();
        this.game.loadLevel(this.currentLevel);
        if (jumpToPlay) {
            this.screenController.show('play');
        }
    }
}