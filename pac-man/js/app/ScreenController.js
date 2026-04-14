export class ScreenController {
    constructor(root) {
        this.root = root;
        this.buttons = [...root.querySelectorAll('[data-action="show-screen"]')];
        this.screens = [...root.querySelectorAll('[data-screen]')].filter((element) => element.classList.contains('screen'));
        const activeScreen = this.screens.find((element) => element.classList.contains('is-active'))?.dataset.screen ?? 'home';
        this.root.dataset.activeScreen = activeScreen;
    }

    show(screenName) {
        this.root.dataset.activeScreen = screenName;
        this.screens.forEach((screen) => {
            screen.classList.toggle('is-active', screen.dataset.screen === screenName);
        });
        this.buttons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.screen === screenName);
        });
    }
}