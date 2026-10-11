// Unit, property and integration tests for every workspace (Vitest, E-13). The Electron security and
// supervisor tests need a build and run separately: npm run test:e2e (apps/desktop/vitest.e2e.config.ts).
import { defineConfig } from 'vitest/config';

const project = (name: string, root: string, timeout = 10_000) => ({
  test: { name, root, include: ['test/**/*.test.ts'], environment: 'node' as const, testTimeout: timeout, hookTimeout: timeout },
});

export default defineConfig({
  test: {
    projects: [
      project('protocol', 'packages/protocol'),
      project('i18n', 'packages/i18n'),
      project('catalog', 'packages/catalog'),
      // DEV-6: the adapters (C-15) and the analyzers (C-13).
      project('adapters', 'packages/adapters', 30_000),
      project('analyzers', 'packages/analyzers', 30_000),
      // DEV-7: the web probe (C-14), its contract, judges and comparison; its browser runs in the engine's tests.
      project('probe', 'packages/probe', 60_000),
      project('engine', 'packages/engine', 30_000),
      project('cli', 'tools/cli', 30_000),
      project('desktop', 'apps/desktop', 30_000),
    ],
  },
});
