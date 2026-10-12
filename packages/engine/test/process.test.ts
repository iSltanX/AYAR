// C-12 and 9.7 at the edge of a launch (ORG-15 review of DEV-5): a stop asked before the process is launched
// launches nothing, and a stop asked while the launch is under way is acted on at once (SIGINT within the first
// moment), not one sample (2 s) later.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessSupervisor, SLEEP_GAP_MIN_MS } from '../src/executor/process.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { nodePorts } from '../src/node/ports.ts';
import type { EnginePorts } from '../src/ports/index.ts';
import { ensureDataDir } from '../src/storage/data-dir.ts';
import { openDatabase, type Db } from '../src/storage/db.ts';
import { migrate } from '../src/storage/migrations.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';

const quiet = { log: () => {}, flush: () => {} };
let root: string;
let cleanup: () => void;
let db: Db;
beforeEach(async () => {
  ({ dir: root, cleanup } = tempRoot('ayar-DEV-5-process-'));
  const { layout } = await ensureDataDir(nodeFileSystem, join(root, 'AYAR'), process.getuid!());
  db = openDatabase(layout.db);
  await migrate(db, { fs: nodeFileSystem, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
});
afterEach(() => {
  db.close();
  cleanup();
});

const spec = (marker: string) => ({
  argv: ['/bin/sh', '-c', `echo ran > "${marker}"; sleep 30`],
  cwd: root,
  env: { PATH: '/usr/bin:/bin' },
  token: `tok-${Math.random().toString(36).slice(2)}`,
  tempDir: null,
  ledger: { kind: 'check' as const, runId: null, checkRunId: null },
  timeoutMs: 60_000,
  idleTimeoutMs: null,
  onStdout: () => {},
  onStderr: () => {},
});

describe('time asleep (FR-26; AT-13 on the owner\'s Apple Silicon machine)', () => {
  it('reads a sample tick 40 s late on both clocks as a sleep gap, left out of the timeout and the duration', async () => {
    // Apple Silicon through sleep: both clocks jump, the wall clock has no lead, only the tick is late.
    const real = nodePorts.clock;
    let ticks = 0;
    const jump = () => (ticks >= 1 ? 40_000 : 0);
    const jumping = { ...real, monotonicMs: () => real.monotonicMs() + jump(), now: () => new Date(real.now().getTime() + jump()) };
    const supervisor = new ProcessSupervisor({ ports: { ...nodePorts, clock: jumping }, db, logger: quiet });
    const marker = join(root, 'marker-sleep');
    const proc = supervisor.start({ ...spec(marker), argv: ['/bin/sh', '-c', `echo ran > "${marker}"; sleep 5`], timeoutMs: 30_000, idleTimeoutMs: 20_000, onSample: () => void ticks++ });
    const r = await proc.done;
    expect(r.ended).toBe('exited');
    expect(r.sleepGaps.length).toBe(1);
    expect(r.sleepGaps[0]!.ms).toBeGreaterThan(SLEEP_GAP_MIN_MS);
    expect(r.durationMs).toBeLessThan(20_000);
  }, 30_000);
});

describe('a stop at the edge of a launch (9.7)', () => {
  it('stopped before the launch: nothing is launched, the ledger row is settled', async () => {
    const supervisor = new ProcessSupervisor({ ports: nodePorts, db, logger: quiet });
    const marker = join(root, 'marker-1');
    const proc = supervisor.start(spec(marker));
    proc.stop('cancel');
    const r = await proc.done;
    expect(r).toMatchObject({ ended: 'cancelled', pid: null, exitCode: null });
    expect(existsSync(marker)).toBe(false);
    expect(db.all<{ state: string }>('SELECT state FROM process_ledger').map((x) => x.state)).toEqual(['ended']);
  });

  it('stopped while the launch is under way: SIGINT at once, not a sample later', async () => {
    // A launch that takes a moment to report its pid (as under load): the stop arrives inside it.
    const slow: EnginePorts = {
      ...nodePorts,
      processes: {
        ...nodePorts.processes,
        start: async (...a: Parameters<EnginePorts['processes']['start']>) => {
          const started = await nodePorts.processes.start(...a);
          await new Promise((r) => setTimeout(r, 300));
          return started;
        },
      },
    };
    const supervisor = new ProcessSupervisor({ ports: slow, db, logger: quiet });
    const marker = join(root, 'marker-2');
    const t0 = Date.now();
    const proc = supervisor.start(spec(marker));
    await new Promise((r) => setTimeout(r, 150));
    proc.stop('cancel');
    const r = await proc.done;
    expect(r.ended).toBe('cancelled');
    expect(r.escalation[0]?.signal).toBe('SIGINT');
    // The first signal comes right after the launch reports (≈ 300 ms), never after a 2 s sample interval.
    expect(r.escalation[0]!.atMs).toBeLessThan(1500);
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 20_000);
});
