import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يسجل وظيفة launchd', () => {
  const r = spawnSync('sh', ['procs/launchctl-submit.sh', process.env.FX_PROC_LABEL ?? 'launchctl.label']);
  assert.equal(r.status, 0);
});
