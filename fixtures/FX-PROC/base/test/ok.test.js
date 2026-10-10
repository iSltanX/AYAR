import assert from 'node:assert/strict';
import { test } from 'node:test';

test('اختبار عادي ينجح ولا يترك شيئًا', () => {
  assert.equal(1 + 1, 2);
});
