import { test } from '@playwright/test';

test('ينتظر إلى الأبد', async () => {
  test.setTimeout(0);
  await new Promise(() => {});
});
