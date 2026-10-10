import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '../../src/ports/index.ts';

/** A fresh folder under the system temp dir (APFS on the owner's Mac, so permission bits are real). */
export function tempRoot(prefix = 'ayar-test-'): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A controllable clock (plan 19: "ساعة قابلة للتحكم"). */
export function fakeClock(start = '2026-10-10T08:00:00.000Z'): Clock & { advance(ms: number): void; set(iso: string): void } {
  let now = new Date(start).getTime();
  let mono = 1000;
  return {
    now: () => new Date(now),
    monotonicMs: () => mono,
    advance(ms) {
      now += ms;
      mono += ms;
    },
    set(iso) {
      now = new Date(iso).getTime();
    },
  };
}
