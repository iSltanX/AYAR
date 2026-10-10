import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const seconds = Number(process.env.FX_PROC_SECONDS ?? 45);

test('يحسب صامتًا', () => {
  const end = Date.now() + seconds * 1000;
  let x = 0;
  while (Date.now() < end) x = (x + Math.sqrt(x + 1)) % 1e9;
  assert.ok(Number.isFinite(x));
});
