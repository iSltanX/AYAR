// C-04 boot order with a trial ledger (AT-48 part, G-27): ledger, then tmp/, then backup and migration.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, BOOT_STEPS, markInterrupted } from '../src/host/boot.ts';
import { LEDGER_FROZEN_COLUMNS, reapLedger } from '../src/host/ledger.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { nodePorts } from '../src/node/ports.ts';
import { nodeProcessControl } from '../src/node/processes.ts';
import { nodeRandom } from '../src/node/random.ts';
import type { EnginePorts, Logger } from '../src/ports/index.ts';
import { ensureDataDir, type DataLayout } from '../src/storage/data-dir.ts';
import { openDatabase, type Db } from '../src/storage/db.ts';
import { latestVersion, migrate, MIGRATIONS, readSchemaVersion, type Migration } from '../src/storage/migrations.ts';
import { listBackups } from '../src/storage/backup.ts';
import { alive, killQuietly, sleeper, waitUntil } from './support/processes.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';

const quiet: Logger = { log: () => {}, flush: () => {} };
// The boot is tested from a version-1 store migrating to a test version 2 (the real later migrations aside).
const V1: readonly Migration[] = MIGRATIONS.slice(0, 1);
const V2: Migration[] = [...V1, { version: 2, name: 'test-table', sql: 'CREATE TABLE v2_marker (x INTEGER) STRICT;' }];
const children: ReturnType<typeof sleeper>[] = [];
let root: string;
let cleanup: () => void;

beforeEach(() => ({ dir: root, cleanup } = tempRoot()));
afterEach(() => {
  for (const c of children.splice(0)) killQuietly(c);
  cleanup();
});

/** Real ports, with a trace of the side effects whose order the boot must respect. */
function tracedPorts(trace: string[], layout: () => DataLayout | null): EnginePorts {
  const clock = fakeClock();
  return {
    clock,
    random: nodeRandom,
    exit: () => {
      throw new Error('exit');
    },
    network: nodePorts.network,
    processes: {
      ...nodeProcessControl,
      killGroup: async (pgid, signal) => {
        trace.push(`kill:${pgid}`);
        return nodeProcessControl.killGroup(pgid, signal);
      },
      spawn: () => Promise.reject(new Error('boot spawns nothing')),
    },
    fs: {
      ...nodeFileSystem,
      remove: async (p) => {
        if (p === layout()?.tmp) trace.push('tmp.remove');
        return nodeFileSystem.remove(p);
      },
      chmod: async (p, m) => {
        if (layout() && p.startsWith(layout()!.backups + '/')) trace.push('backup.written');
        return nodeFileSystem.chmod(p, m);
      },
    },
  };
}

async function v1Store(): Promise<{ layout: DataLayout; db: Db }> {
  const { layout } = await ensureDataDir(nodeFileSystem, join(root, 'AYAR'), process.getuid!());
  const db = openDatabase(layout.db);
  await migrate(db, { fs: nodeFileSystem, clock: fakeClock('2026-10-01T00:00:00.000Z'), backupsDir: layout.backups, appVersion: '0.1.0', migrations: V1 });
  return { layout, db };
}

function ledgerRow(db: Db, id: string, pid: number, start: string, state = 'running', tempDir: string | null = null): void {
  db.run(
    'INSERT INTO process_ledger (id, check_run_id, pid, pgid, os_start_time, command_digest, check_token, temp_dir, state, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, pid, pid, start, 'sha256:x', `tok-${id}`, tempDir, state, '2026-10-09T23:00:00.000Z',
  );
}

describe('a setup action an unexpected stop cut short (independent review of DEV-5)', () => {
  it('ends «failed» with its reason at the next boot, never stays «running»', async () => {
    const { dir, cleanup } = tempRoot('ayar-DEV-5-boot-setup-');
    try {
      const { layout } = await ensureDataDir(nodeFileSystem, join(dir, 'AYAR'), process.getuid!());
      const db = openDatabase(layout.db);
      await migrate(db, { fs: nodeFileSystem, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
      db.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p', 'P', '/p', '/p', 'x')");
      db.run("INSERT INTO setup_actions (id, project_id, kind, preview_json, state) VALUES ('a-run', 'p', 'install_tool', '{}', 'running'), ('a-done', 'p', 'install_tool', '{}', 'done')");
      expect(markInterrupted(db, new Date('2026-10-10T00:00:00Z'))).toMatchObject({ setupActions: 1 });
      expect(db.all('SELECT id, state, reasons_json AS r FROM setup_actions ORDER BY id')).toEqual([
        { id: 'a-done', state: 'done', r: null },
        { id: 'a-run', state: 'failed', r: '[{"key":"setup.failed.interrupted"}]' },
      ]);
      db.close();
    } finally {
      cleanup();
    }
  });
});

describe('boot order (C-04, G-27)', () => {
  it('settles the ledger, then deletes tmp/, then backs up and migrates, then marks interrupted runs', async () => {
    const { layout, db } = await v1Store();
    const ours = sleeper();
    const reused = sleeper();
    children.push(ours, reused);
    const oursStart = await nodeProcessControl.startTime(ours.pid!);
    expect(oursStart).not.toBeNull();
    ledgerRow(db, 'l-ours', ours.pid!, oursStart!, 'running', join(layout.tmp, 'check-1'));
    ledgerRow(db, 'l-reused', reused.pid!, 'Thu Jan  1 00:00:00 1970'); // same pid, other start time: not ours
    ledgerRow(db, 'l-gone', 999_999, 'Thu Jan  1 00:00:00 1970');
    ledgerRow(db, 'l-old', 999_998, 'x', 'reaped');
    db.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p', 'P', '/p', '/p', 'x')");
    db.run("INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, state) VALUES ('r', 'RUN-1', 'p', 'full', '{}', '{}', 'running')");
    db.run("INSERT INTO check_runs (id, run_id, check_id, component, state) VALUES ('c-run', 'r', 'beh.unit', 'root', 'running'), ('c-done', 'r', 'code.lint', 'root', 'finished')");
    db.close();
    mkdirSync(join(layout.tmp, 'check-1'));
    writeFileSync(join(layout.tmp, 'check-1', 'raw-report.json'), '{"MY_API_TOKEN":"raw"}');

    const r = await boot({ dataDir: layout.root, ports: tracedPorts([], () => layout), logger: quiet, appVersion: '0.2.0', migrations: V2 });
    expect(r.state).toBe('ready');
    expect(r.steps.map((s) => s.step)).toEqual([...BOOT_STEPS]);
    expect(r.steps.every((s) => s.ok)).toBe(true);
    expect(r.steps.find((s) => s.step === 'ledger.reap')?.detail).toMatchObject({ running: 3, killed: 1, notOurs: 2, marked: 3 });

    // Effects: our orphan group is gone, the process with a reused pid is untouched.
    expect(await waitUntil(() => !alive(ours.pid!))).toBe(true);
    expect(alive(reused.pid!)).toBe(true);
    expect(readdirSync(layout.tmp)).toEqual([]);
    expect(readSchemaVersion(r.db!)).toBe(2);
    const states = Object.fromEntries(r.db!.all<{ id: string; state: string }>('SELECT id, state FROM process_ledger').map((x) => [x.id, x.state]));
    expect(states).toEqual({ 'l-ours': 'reaped', 'l-reused': 'reaped', 'l-gone': 'reaped', 'l-old': 'reaped' });
    expect(r.db!.all('SELECT id, outcome, state FROM check_runs ORDER BY id')).toEqual([
      { id: 'c-done', outcome: null, state: 'finished' },
      { id: 'c-run', outcome: 'interrupted', state: 'finished' },
    ]);
    expect(r.db!.get<{ state: string }>("SELECT state FROM runs WHERE id = 'r'")?.state).toBe('interrupted');

    // The pre-migration backup already holds the settled ledger: the ledger step ran before it.
    const backups = await listBackups(nodeFileSystem, layout.backups);
    const pre = backups.find((n) => n.includes('pre-v1-to-v2'));
    expect(pre).toBeDefined();
    const copy = openDatabase(join(layout.backups, pre!), { readOnly: true });
    expect(readSchemaVersion(copy)).toBe(1);
    expect(copy.get<{ n: number }>("SELECT count(*) AS n FROM process_ledger WHERE state = 'running'")?.n).toBe(0);
    copy.close();
    r.db!.close();
  });

  it('records each side effect in that order', async () => {
    const { layout, db } = await v1Store();
    const ours = sleeper();
    children.push(ours);
    ledgerRow(db, 'l-ours', ours.pid!, (await nodeProcessControl.startTime(ours.pid!))!);
    db.close();
    const trace: string[] = [];
    const r = await boot({ dataDir: layout.root, ports: tracedPorts(trace, () => layout), logger: quiet, appVersion: '0.2.0', migrations: V2 });
    expect(trace).toEqual([`kill:${ours.pid}`, 'tmp.remove', 'backup.written']);
    r.db!.close();
  });

  it('a new database: no ledger yet, then the whole schema after a backup', async () => {
    const trace: string[] = [];
    const dataDir = join(root, 'fresh');
    const r = await boot({ dataDir, ports: tracedPorts(trace, () => null), logger: quiet, appVersion: '0.1.0' });
    expect(r.state).toBe('ready');
    expect(r.schemaVersion).toBe(latestVersion());
    expect(r.steps.find((s) => s.step === 'ledger.reap')?.detail).toMatchObject({ running: 0 });
    expect(r.steps.find((s) => s.step === 'db.migrate')?.detail).toMatchObject({ from: 0, to: latestVersion(), backup: true });
    r.db!.close();
  });

  it('a database from a newer AYAR: safety steps run, nothing is written, the engine is degraded', async () => {
    const { layout, db } = await v1Store();
    const ours = sleeper();
    children.push(ours);
    ledgerRow(db, 'l-ours', ours.pid!, (await nodeProcessControl.startTime(ours.pid!))!);
    db.run("UPDATE schema_meta SET value = '99' WHERE key = 'schema_version'");
    db.close();
    writeFileSync(join(layout.tmp, 'raw.json'), 'raw');
    const before = await listBackups(nodeFileSystem, layout.backups);
    const r = await boot({ dataDir: layout.root, ports: tracedPorts([], () => layout), logger: quiet, appVersion: '0.1.0' });
    expect(r).toMatchObject({ state: 'degraded', reason: 'db_newer_than_app', db: null });
    expect(await waitUntil(() => !alive(ours.pid!))).toBe(true);
    expect(readdirSync(layout.tmp)).toEqual([]);
    expect(await listBackups(nodeFileSystem, layout.backups)).toEqual(before);
    const check = openDatabase(layout.db, { readOnly: true });
    expect(readSchemaVersion(check)).toBe(99);
    expect(check.get<{ state: string }>('SELECT state FROM process_ledger')?.state).toBe('running');
    check.close();
  });

  it('a damaged database: degraded with db_corrupt, tmp/ still cleaned, no migration', async () => {
    const { layout } = await ensureDataDir(nodeFileSystem, join(root, 'AYAR'), process.getuid!());
    writeFileSync(layout.db, Buffer.alloc(16_384, 0x41)); // not a database
    writeFileSync(join(layout.tmp, 'raw.json'), 'raw');
    const r = await boot({ dataDir: layout.root, ports: tracedPorts([], () => layout), logger: quiet, appVersion: '0.1.0' });
    expect(r).toMatchObject({ state: 'degraded', reason: 'db_corrupt' });
    expect(readdirSync(layout.tmp)).toEqual([]);
    expect(r.steps.map((s) => s.step)).not.toContain('db.migrate');
  });

  it('an unsafe data folder: nothing at all is done', async () => {
    const dataDir = join(root, 'AYAR');
    writeFileSync(dataDir, 'a file where the folder should be');
    const r = await boot({ dataDir, ports: tracedPorts([], () => null), logger: quiet, appVersion: '0.1.0' });
    expect(r).toMatchObject({ state: 'degraded', reason: 'data_dir_unsafe', layout: null });
    expect(r.steps).toHaveLength(1);
  });
});

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('no write before the checks pass (C-04, NFR-02)', () => {
  it('leaves a newer database byte for byte untouched, even in rollback-journal mode', async () => {
    const { layout } = await ensureDataDir(nodeFileSystem, join(root, 'AYAR'), process.getuid!());
    const raw = new DatabaseSync(layout.db);
    raw.exec("PRAGMA journal_mode = DELETE; CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO schema_meta VALUES ('schema_version', '99');");
    raw.close();
    const before = sha(layout.db);
    const r = await boot({ dataDir: layout.root, ports: tracedPorts([], () => layout), logger: quiet, appVersion: '0.1.0' });
    expect(r).toMatchObject({ state: 'degraded', reason: 'db_newer_than_app' });
    expect(sha(layout.db)).toBe(before);
    expect(existsSync(`${layout.db}-wal`)).toBe(false);
  });

  it('leaves a database that opens but fails integrity_check untouched, and says db_corrupt', async () => {
    const { layout, db } = await v1Store();
    db.transaction(() => {
      for (let i = 0; i < 400; i++) db.run('INSERT INTO audit_log (id, at, actor, action) VALUES (?, ?, ?, ?)', `a${i}`, 'now', 'test', 'x'.repeat(200));
    });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    const size = statSync(layout.db).size;
    const fd = openSync(layout.db, 'r+');
    writeSync(fd, Buffer.alloc(4096, 0xa5), 0, 4096, Math.floor(size / 2 / 4096) * 4096);
    closeSync(fd);
    const before = sha(layout.db);
    const r = await boot({ dataDir: layout.root, ports: tracedPorts([], () => layout), logger: quiet, appVersion: '0.1.0' });
    expect(r).toMatchObject({ state: 'degraded', reason: 'db_corrupt' });
    expect(r.steps.find((s) => s.step === 'db.open')?.ok).toBe(true);
    expect(r.steps.find((s) => s.step === 'db.integrity')?.ok).toBe(false);
    expect(sha(layout.db)).toBe(before);
  });
});

describe('operational faults degrade or log, never crash the boot (C-04)', () => {
  it('a failing weekly backup only logs', async () => {
    const { layout, db } = await v1Store();
    db.close();
    const ports = tracedPorts([], () => layout);
    const clock = fakeClock('2026-12-31T00:00:00.000Z'); // the v1 backup is months old: the weekly one is due
    const failing: EnginePorts = {
      ...ports,
      clock,
      fs: { ...ports.fs, chmod: (p, m) => (p.startsWith(layout.backups + '/') ? Promise.reject(new Error('ENOSPC')) : ports.fs.chmod(p, m)) },
    };
    // No migration is pending (V1), so the only backup the boot attempts is the weekly one.
    const r = await boot({ dataDir: layout.root, ports: failing, logger: quiet, appVersion: '0.1.0', migrations: V1 });
    expect(r.state).toBe('ready');
    expect(r.steps.find((s) => s.step === 'db.weekly_backup')).toMatchObject({ ok: false });
    r.db!.close();
  });

  it('a ledger kill that fails (EPERM) is counted, the row settled, and the boot goes on', async () => {
    const { layout, db } = await v1Store();
    ledgerRow(db, 'l-eperm', 4242, 'Mon Oct  5 10:00:00 2026');
    ledgerRow(db, 'l-self', process.pid, 'whatever');
    db.close();
    const ports = tracedPorts([], () => layout);
    const signalled: number[] = [];
    const eperm: EnginePorts = {
      ...ports,
      processes: {
        ...nodeProcessControl,
        currentUid: () => process.getuid!(),
        startTime: (pid) => Promise.resolve(pid === 4242 ? 'Mon Oct  5 10:00:00 2026' : 'whatever'),
        killGroup: (pgid) => {
          signalled.push(pgid);
          return Promise.reject(Object.assign(new Error('kill EPERM'), { code: 'EPERM' }));
        },
        spawn: () => Promise.reject(new Error('boot spawns nothing')),
      },
    };
    const r = await boot({ dataDir: layout.root, ports: eperm, logger: quiet, appVersion: '0.1.0' });
    expect(r.state).toBe('ready');
    expect(r.steps.find((s) => s.step === 'ledger.reap')?.detail).toMatchObject({ running: 2, failed: 1, notOurs: 1, marked: 2 });
    expect(signalled).toEqual([4242]); // never the engine's own pid, even when a row names it
    r.db!.close();
  });
});

describe('ledger stability (G-27)', () => {
  it('the frozen ledger columns exist in the latest schema', async () => {
    const { db } = await v1Store();
    const cols = db.all<{ name: string }>('PRAGMA table_info(process_ledger)').map((c) => c.name);
    for (const c of LEDGER_FROZEN_COLUMNS) expect(cols).toContain(c);
    db.close();
  });

  it('reads a ledger that a later version extended with new columns', async () => {
    const { db, layout } = await v1Store();
    db.exec('ALTER TABLE process_ledger ADD COLUMN future_note TEXT');
    ledgerRow(db, 'l', 999_997, 'x');
    const r = await reapLedger(db, nodeProcessControl, { writable: false, tmpRoot: layout.tmp, now: () => new Date() });
    expect(r).toMatchObject({ running: 1, killed: 0, notOurs: 1, marked: 0, failed: 0, error: null });
    db.close();
  });
});
