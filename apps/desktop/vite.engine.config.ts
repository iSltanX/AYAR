// Engine bundle for Electron's utilityProcess (C-04). The engine package never imports electron (D-19);
// its utility entry only uses the parentPort message channel.
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    ssr: true,
    outDir: fileURLToPath(new URL('./dist/engine', import.meta.url)),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: { engine: fileURLToPath(new URL('../../packages/engine/src/bin/utility.ts', import.meta.url)) },
      // electron is deliberately NOT external: an electron import in the engine fails this build.
      external: [/^node:/, ...nodeBuiltins],
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
    },
  },
  ssr: { noExternal: true },
});
