import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: 'public',
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/**/*.test.js']
  }
})
