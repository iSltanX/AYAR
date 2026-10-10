import { test } from 'node:test';

test('ينتظر إلى الأبد', async () => {
  await new Promise(() => {});
});
