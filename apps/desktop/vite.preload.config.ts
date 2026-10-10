// Preload bundle (C-02): a single CommonJS file, because sandboxed preloads cannot load other modules.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    outDir: fileURLToPath(new URL('./dist/preload', import.meta.url)),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/preload/preload.ts', import.meta.url)),
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: { external: ['electron'] },
  },
});
