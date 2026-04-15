import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function copyStaticAssets() {
    return {
        name: 'copy-static-assets',
        closeBundle() {
            const sourceDir = resolve(__dirname, 'assets');
            const targetDir = resolve(__dirname, 'dist', 'assets');

            if (!existsSync(sourceDir)) {
                return;
            }

            mkdirSync(targetDir, { recursive: true });

            for (const entry of readdirSync(sourceDir)) {
                const sourcePath = resolve(sourceDir, entry);
                const targetPath = resolve(targetDir, entry);

                rmSync(targetPath, { recursive: true, force: true });
                cpSync(sourcePath, targetPath, { recursive: true });
            }
        }
    };
}

export default defineConfig({
    base: './',
    publicDir: false,
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    plugins: [copyStaticAssets()]
});