import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: [{ test: { name: 'engine-negative', root: 'packages/engine', include: ['negative/failing.test.ts'], environment: 'node' } }] },
});
