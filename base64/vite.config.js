import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    base: './',
    plugins: [tailwindcss(), viteSingleFile()],
    build: {
        // Inline all assets; single-file plugin handles the rest
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
    },
});
