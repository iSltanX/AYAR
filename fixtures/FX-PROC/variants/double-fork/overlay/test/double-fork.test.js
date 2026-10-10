import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يطلق شبحًا بتفرع مزدوج', () => {
  const r = spawnSync('python3', ['procs/double_fork.py'], { env: { ...process.env, FX_PROC_PIDS: process.env.FX_PROC_PIDS ?? '' } });
  assert.equal(r.status, 0);
});
