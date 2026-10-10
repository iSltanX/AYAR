import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يترك عملية منفصلة بجلسة جديدة', () => {
  const child = spawn(process.execPath, ['procs/sleeper.mjs'], { detached: true, stdio: 'ignore' });
  child.unref();
  assert.ok(child.pid > 0);
});
