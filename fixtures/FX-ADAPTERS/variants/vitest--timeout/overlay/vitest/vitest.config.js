import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.js'], testTimeout: 3_600_000 },
});
