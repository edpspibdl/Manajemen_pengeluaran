import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false
  },
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
