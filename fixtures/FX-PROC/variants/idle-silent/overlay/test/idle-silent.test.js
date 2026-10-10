import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const seconds = Number(process.env.FX_PROC_SECONDS ?? 120);

test('ينام صامتًا بلا حساب', async () => {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  assert.ok(true);
});
