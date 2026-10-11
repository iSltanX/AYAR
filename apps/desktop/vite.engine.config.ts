// Engine bundle for Electron's utilityProcess (C-04). The engine package never imports electron (D-19);
// its utility entry only uses the parentPort message channel. DEV-7 (C-14, E-11): the web probe is a second
// utilityProcess with an entry of its own (probe.mjs). playwright-core is not bundled — it reads its own package files
// (package.json, browsers.json, a wasm codec) beside its code — so it ships as it is published, in
// dist/engine/node_modules/playwright-core, where the probe's import finds it; axe-core's script ships beside them
// (axe.min.js), read by the probe from there.
import { defineConfig, type Plugin } from 'vite';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const probeEntry = fileURLToPath(new URL('../../packages/probe/src/bin/utility.ts', import.meta.url));
const outDir = fileURLToPath(new URL('./dist/engine', import.meta.url));
const probeFiles: Plugin = {
  name: 'ayar-probe-files',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'axe.min.js', source: readFileSync(createRequire(probeEntry).resolve('axe-core/axe.min.js'), 'utf8') });
  },
  writeBundle() {
    const pkg = dirname(createRequire(probeEntry).resolve('playwright-core/package.json'));
    const dest = join(outDir, 'node_modules', 'playwright-core');
    rmSync(dest, { recursive: true, force: true });
    // The published package minus its type declarations (its licence and notices stay with it).
    cpSync(pkg, dest, { recursive: true, filter: (src) => !src.startsWith(join(pkg, 'types')) && !src.endsWith('.d.ts') });
  },
};

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    ssr: true,
    outDir,
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: { engine: fileURLToPath(new URL('../../packages/engine/src/bin/utility.ts', import.meta.url)), probe: probeEntry },
      // electron is deliberately NOT external: an electron import in the engine fails this build.
      external: [/^node:/, ...nodeBuiltins, /^playwright-core(\/|$)/],
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
    },
  },
  ssr: { noExternal: true },
  plugins: [probeFiles],
});
