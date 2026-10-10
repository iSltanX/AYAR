import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('ينتظر إلى الأبد', async () => {
  await new Promise(() => {});
  assert.ok(true);
});
