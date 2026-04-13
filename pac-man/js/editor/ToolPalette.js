import { TOOL_DEFINITIONS } from '../core/constants.js';

export class ToolPalette {
    constructor(container, onSelect) {
        this.container = container;
        this.onSelect = onSelect;
        this.activeTool = TOOL_DEFINITIONS[0].id;
    }

    render() {
        if (!this.container) {
            throw new Error('ToolPalette container not found. Check the editor screen mount element.');
        }

        this.container.innerHTML = '<div class="tool-palette"></div>';
        const palette = this.container.firstElementChild;

        for (const tool of TOOL_DEFINITIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `tool-button${tool.id === this.activeTool ? ' is-active' : ''}`;
            button.dataset.action = 'select-tool';
            button.dataset.tool = tool.id;
            button.innerHTML = `
                <span class="tool-button__label">${tool.label}</span>
                <span class="tool-button__meta">${tool.meta}</span>
            `;
            button.addEventListener('click', () => this.setActiveTool(tool.id));
            palette.appendChild(button);
        }
    }

    setActiveTool(toolId) {
        this.activeTool = toolId;
        this.render();
        this.onSelect(toolId);
    }
}