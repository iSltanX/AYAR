import { expect, test } from '@playwright/test';

// اختبار بلا متصفح: يكفي لتجربة المحول دون تنزيل Chromium.
test('يجمع عددين', () => {
  expect(2 + 3).toBe(6);
});
