// AT-36's app measurements (DEV-13), run on demand: not part of `npm run test:e2e`. One file, one app at a time.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'desktop-perf',
    include: ['test/perf/**/*.perf.ts'],
    environment: 'node',
    testTimeout: 600_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
