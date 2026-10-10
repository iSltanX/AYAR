import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يطلق عملية بلا بيئة منفصلة', () => {
  const child = spawn('/usr/bin/env', ['-i', process.execPath, 'procs/sleeper.mjs', process.env.FX_PROC_PIDS ?? 'env-cleared.pids'], { detached: true, stdio: 'ignore', env: {} });
  child.unref();
  assert.ok(child.pid > 0);
});
