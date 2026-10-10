import { it } from 'vitest';

it('ينتظر إلى الأبد', async () => {
  await new Promise(() => {});
});
