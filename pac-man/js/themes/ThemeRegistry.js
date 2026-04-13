import { LOCAL_STORAGE_KEYS, THEMES } from '../core/constants.js';

export class ThemeRegistry {
    constructor() {
        this.themes = THEMES;
        this.activeTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.theme) ?? THEMES[0].id;
        document.body.dataset.theme = this.activeTheme;
    }

    hydrateSelect(selectElement, onChange) {
        selectElement.innerHTML = this.themes.map((theme) => `<option value="${theme.id}">${theme.label}</option>`).join('');
        selectElement.value = this.activeTheme;
        selectElement.addEventListener('change', () => {
            this.setTheme(selectElement.value);
            onChange?.(this.activeTheme);
        });
    }

    setTheme(themeId) {
        this.activeTheme = themeId;
        document.body.dataset.theme = themeId;
        localStorage.setItem(LOCAL_STORAGE_KEYS.theme, themeId);
    }
}