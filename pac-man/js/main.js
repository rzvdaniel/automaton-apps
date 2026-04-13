import { AppShell } from './app/AppShell.js';

const root = document.querySelector('#app');

if (root) {
    const app = new AppShell(root);
    await app.initialize();
}