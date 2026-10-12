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

describe('time asleep (FR-26; AT-13 on the owner\'s Apple Silicon machine; DEV-13 review R3-01 to R3-03)', () => {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Ports whose n-th listProcesses call (1: the launch baseline, 2: the first sample, …) waits, or never answers. */
  const slowList = (slowAt: (n: number) => number | 'hang'): EnginePorts => {
    let n = 0;
    return {
      ...nodePorts,
      processes: {
        ...nodePorts.processes,
        listProcesses: async () => {
          const s = slowAt(++n);
          if (s === 'hang') await new Promise(() => {});
          else if (s > 0) await delay(s);
          return nodePorts.processes.listProcesses();
        },
      },
    };
  };

  it('reads a sample timer that fires 40 s late as a sleep gap, left out of the timeout and the duration', async () => {
    // Apple Silicon through sleep: both clocks move on 40 s while the sample timer waits (a second after the first sample).
    const real = nodePorts.clock;
    let sampledAt: number | undefined;
    const offset = () => (sampledAt !== undefined && real.monotonicMs() >= sampledAt + 1000 ? 40_000 : 0);
    const clock = { now: () => new Date(real.now().getTime() + offset()), monotonicMs: () => real.monotonicMs() + offset() };
    const supervisor = new ProcessSupervisor({ ports: { ...nodePorts, clock }, db, logger: quiet });
    const marker = join(root, 'marker-sleep');
    const onSample = () => void (sampledAt ??= real.monotonicMs());
    const r = await supervisor.start({ ...spec(marker), argv: ['/bin/sh', '-c', `echo ran > "${marker}"; sleep 5`], timeoutMs: 30_000, idleTimeoutMs: 20_000, onSample }).done;
    expect(r.ended).toBe('exited');
    expect(r.sleepGaps.length).toBe(1);
    expect(r.sleepGaps[0]!.ms).toBeGreaterThan(SLEEP_GAP_MIN_MS);
    expect(r.durationMs).toBeLessThan(20_000);
  }, 30_000);

  it('R3-01: a sample that takes 6.5 s is not a sleep gap', async () => {
    const supervisor = new ProcessSupervisor({ ports: slowList((n) => (n === 2 ? 6500 : 0)), db, logger: quiet });
    const r = await supervisor.start({ ...spec(join(root, 'm1')), argv: ['/bin/sh', '-c', 'sleep 12'], timeoutMs: 60_000 }).done;
    expect(r.ended).toBe('exited');
    expect(r.sleepGaps).toEqual([]);
    expect(r.durationMs).toBeGreaterThan(11_000);
  }, 60_000);

  it('R3-03: a wall-clock jump alone (NTP, by hand) is not sleep, and the duration is never negative', async () => {
    const real = nodePorts.clock;
    let ticks = 0;
    const clock = { now: () => new Date(real.now().getTime() + (ticks >= 1 ? 600_000 : 0)), monotonicMs: () => real.monotonicMs() };
    const supervisor = new ProcessSupervisor({ ports: { ...nodePorts, clock }, db, logger: quiet });
    const r = await supervisor.start({ ...spec(join(root, 'm2')), argv: ['/bin/sh', '-c', 'sleep 5'], timeoutMs: 60_000, onSample: () => void ticks++ }).done;
    expect(r.ended).toBe('exited');
    expect(r.sleepGaps).toEqual([]);
    expect(r.durationMs).toBeGreaterThanOrEqual(4_000);
  }, 30_000);

  it('R3-02: a cancel is acted on while a sample hangs', async () => {
    const supervisor = new ProcessSupervisor({ ports: slowList((n) => (n === 3 ? 'hang' : 0)), db, logger: quiet });
    const proc = supervisor.start({ ...spec(join(root, 'm3')), argv: ['/bin/sh', '-c', 'sleep 120'], timeoutMs: 60_000 });
    await delay(6000);
    const t0 = Date.now();
    proc.stop('cancel');
    const r = await Promise.race([proc.done, delay(15_000).then(() => null)]);
    expect(r).not.toBeNull();
    expect(r!.ended).toBe('cancelled');
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 40_000);
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
