import { AppShell } from './app/AppShell.js';

const root = document.querySelector('#app');

if (root) {
    new AppShell(root);
}