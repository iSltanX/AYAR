import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('يطبع خرجًا ضخمًا', async () => {
  const line = `${'x'.repeat(1023)}\n`;
  for (let i = 0; i < 120 * 1024; i += 1) {
    if (!process.stdout.write(line)) await new Promise((resolve) => process.stdout.once('drain', resolve));
  }
  assert.ok(true);
});
