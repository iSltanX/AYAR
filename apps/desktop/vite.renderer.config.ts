// Renderer bundle, served from app://ayar/ under the strict CSP (15.2). The release build has one entry, the
// UI mount point. AYAR_GALLERY=1 adds the development-only component gallery (DEV-10, task 5) at
// gallery/index.html; the release build never sets it (npm run build), and `npm run package` rebuilds first.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./src/renderer', import.meta.url));
export const GALLERY = process.env.AYAR_GALLERY === '1';

export default defineConfig({
  root,
  base: '/',
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome146',
    // No inline module-preload polyfill or inline assets: everything stays a 'self' file under the CSP.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: GALLERY ? { index: `${root}/index.html`, gallery: `${root}/gallery/index.html` } : { index: `${root}/index.html` },
    },
  },
});
