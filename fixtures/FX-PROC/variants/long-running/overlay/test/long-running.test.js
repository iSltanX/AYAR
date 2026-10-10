import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const seconds = Number(process.env.FX_PROC_SECONDS ?? 60);

test('يعمل طويلًا مع تقدم', async () => {
  for (let i = 0; i < seconds / 2; i += 1) {
    console.log(`progress ${i + 1}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(true);
});
