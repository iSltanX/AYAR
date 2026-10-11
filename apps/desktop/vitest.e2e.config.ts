// The Electron tests on the development build (AT-30 part, AT-13 part): run with `npm run test:e2e`, which
// builds first. One file at a time: each test launches the app. With AYAR_E2E_APP=<derived .app> (DEV-13, D-51)
// the same tests run on the derived test package; the two gallery files stay out then, because the release
// renderer has no gallery (DEV-10 task 5: the gallery is development-only).
import { defineConfig } from 'vitest/config';

const packaged = Boolean(process.env.AYAR_E2E_APP);

export default defineConfig({
  test: {
    name: packaged ? 'desktop-e2e-packaged' : 'desktop-e2e',
    include: ['test/e2e/**/*.e2e.ts'],
    exclude: packaged ? ['**/node_modules/**', 'test/e2e/gallery.e2e.ts', 'test/e2e/components.e2e.ts'] : ['**/node_modules/**'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
