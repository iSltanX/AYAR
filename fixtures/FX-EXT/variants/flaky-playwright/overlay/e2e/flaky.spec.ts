import { expect, test } from '@playwright/test';

// يفشل في المحاولة الأولى وينجح في الإعادة: Playwright يسجله «flaky» (AT-15، beh.e2e).
test('رحلة متقطعة تنجح بعد إعادة', async ({ baseURL }, testInfo) => {
  expect(baseURL).toBeUndefined();
  expect(testInfo.retry).toBeGreaterThan(0);
});
