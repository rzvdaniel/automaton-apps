export class InputController {
    constructor(root, onDirection) {
        this.root = root;
        this.onDirection = onDirection;
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    attach() {
        window.addEventListener('keydown', this.handleKeyDown);
        this.root.querySelectorAll('[data-action="move"]').forEach((button) => {
            button.addEventListener('click', () => this.onDirection(button.dataset.direction));
        });
    }

    detach() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
        const map = {
            ArrowUp: 'up',
            KeyW: 'up',
            ArrowDown: 'down',
            KeyS: 'down',
            ArrowLeft: 'left',
            KeyA: 'left',
            ArrowRight: 'right',
            KeyD: 'right'
        };
        const direction = map[event.code];
        if (direction) {
            event.preventDefault();
            this.onDirection(direction);
        }
    }
}