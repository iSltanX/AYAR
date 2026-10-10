import { defineConfig } from '@playwright/test';

// اختبارات الرحلات تحمّل الإضافة المبنية في dist/ داخل Chromium. شغّل `pnpm build` أولًا.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
});
