// The Electron tests on the development build (AT-30 part, AT-13 part): run with `npm run test:e2e`, which
// builds first. One file at a time: each test launches the app.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'desktop-e2e',
    include: ['test/e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
