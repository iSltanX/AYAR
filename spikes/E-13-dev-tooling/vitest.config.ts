import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'engine', root: 'packages/engine', include: ['test/**/*.test.ts'], exclude: ['**/*.node.test.ts'], environment: 'node' } },
      'apps/desktop/vite.config.ts',
    ],
  },
});
