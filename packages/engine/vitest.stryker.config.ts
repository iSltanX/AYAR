// The tests StrykerJS runs against each mutant (packages/engine/stryker.config.mjs): those of the four components.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: 'packages/engine',
    include: ['test/classify.test.ts', 'test/purity.test.ts', 'test/redaction.test.ts', 'test/planner.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
