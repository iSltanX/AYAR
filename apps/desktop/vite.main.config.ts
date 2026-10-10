// Main-process bundle (C-01). entry.ts is the first module evaluated: it holds the remote-debugging guard
// (D-52) and imports nothing but electron and Node built-ins before loading the rest.
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    ssr: true,
    outDir: fileURLToPath(new URL('./dist/main', import.meta.url)),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: { entry: fileURLToPath(new URL('./src/main/entry.ts', import.meta.url)) },
      external: ['electron', /^node:/, ...nodeBuiltins],
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
  ssr: { noExternal: true },
});
