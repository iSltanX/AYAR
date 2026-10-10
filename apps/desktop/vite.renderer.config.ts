// Renderer bundle: the empty Svelte mount point (task 9). Served from app://ayar/ under the strict CSP (15.2).
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: '/',
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome146',
    // No inline module-preload polyfill or inline assets: everything stays a 'self' file under the CSP.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
