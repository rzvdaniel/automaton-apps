import { AppShell } from './app/AppShell.js?v=20260414-7';

const root = document.querySelector('#app');

if (root) {
    const app = new AppShell(root);
    await app.initialize();
}