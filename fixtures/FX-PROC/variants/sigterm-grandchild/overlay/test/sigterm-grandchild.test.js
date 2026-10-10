import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يطلق حفيدًا يتجاهل SIGTERM ثم ينتظر', async () => {
  spawn(process.execPath, ['procs/spawn-grandchild.mjs'], { stdio: 'ignore' });
  await new Promise(() => {});
  assert.ok(true);
});
