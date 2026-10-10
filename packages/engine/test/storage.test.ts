// Storage integration tests (C-17 part 1): WAL, the 14.1 schema in one migration, a backup before every
// migration (NFR-02, G-11), refusal of a newer database, integrity_check, and 0700 folders (NFR-03).
import { chmodSync, existsSync, mkdirSync, openSync, readdirSync, statSync, symlinkSync, writeFileSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { settingDefaults } from '@ayar/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeFileSystem as fs } from '../src/node/fs.ts';
import { backupDatabase, listBackups, weeklyBackupIfDue, WEEK_MS } from '../src/storage/backup.ts';
import { cleanTmp, ensureDataDir, SUBDIRS } from '../src/storage/data-dir.ts';
import { openDatabase, type Db } from '../src/storage/db.ts';
import { integrityCheck } from '../src/storage/integrity.ts';
import { latestVersion, migrate, MIGRATIONS, readSchemaVersion, type Migration } from '../src/storage/migrations.ts';
import { readSettings, writeSetting } from '../src/storage/settings.ts';
import { StorageError } from '../src/storage/errors.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';
import { PLAN_INDEXES, PLAN_TABLES } from './support/plan-schema.ts';

const mode = (p: string) => statSync(p).mode & 0o777;
const uid = process.getuid!();
let root: string;
let cleanup: () => void;
const open: Db[] = [];
const openDb = (p: string) => {
  const db = openDatabase(p);
  open.push(db);
  return db;
};

beforeEach(() => {
  ({ dir: root, cleanup } = tempRoot());
});
afterEach(() => {
  for (const db of open.splice(0)) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
  chmodSync(root, 0o700);
  cleanup();
});

async function freshStore() {
  const { layout } = await ensureDataDir(fs, join(root, 'AYAR'), uid);
  const db = openDb(layout.db);
  return { layout, db };
}

describe('data folder (NFR-03, T10)', () => {
  it('creates the folder and every subfolder of C-17 with 0700', async () => {
    const { layout, created } = await ensureDataDir(fs, join(root, 'AYAR'), uid);
    expect(mode(layout.root)).toBe(0o700);
    for (const sub of SUBDIRS) expect(mode(join(layout.root, sub)), sub).toBe(0o700);
    expect(created).toHaveLength(SUBDIRS.length + 1);
  });

  it('tightens a folder that is wider than 0700', async () => {
    const dir = join(root, 'AYAR');
    mkdirSync(join(dir, 'logs'), { recursive: true, mode: 0o755 });
    chmodSync(dir, 0o755);
    chmodSync(join(dir, 'logs'), 0o777);
    const { tightened } = await ensureDataDir(fs, dir, uid);
    expect(tightened.sort()).toEqual([dir, join(dir, 'logs')].sort());
    expect(mode(dir)).toBe(0o700);
    expect(mode(join(dir, 'logs'))).toBe(0o700);
  });

  it('refuses a symbolic link where a folder is expected, and writes nothing through it', async () => {
    const dir = join(root, 'AYAR');
    mkdirSync(dir, { mode: 0o700 });
    mkdirSync(join(root, 'elsewhere'));
    symlinkSync(join(root, 'elsewhere'), join(dir, 'evidence'));
    await expect(ensureDataDir(fs, dir, uid)).rejects.toMatchObject({ code: 'data_dir_unsafe', details: { reason: 'symlink' } });
    expect(readdirSync(join(root, 'elsewhere'))).toEqual([]);
  });

  it('refuses a file where a folder is expected, and a folder owned by someone else', async () => {
    const dir = join(root, 'AYAR');
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, 'tmp'), 'x');
    await expect(ensureDataDir(fs, dir, uid)).rejects.toMatchObject({ code: 'data_dir_unsafe', details: { reason: 'not_a_directory' } });
    await expect(ensureDataDir(fs, join(root, 'other'), uid)).resolves.toBeTruthy();
    await expect(ensureDataDir(fs, join(root, 'other'), uid + 1)).rejects.toMatchObject({ code: 'data_dir_unsafe', details: { reason: 'owner' } });
  });

  it('cleans tmp/ entirely without following a symbolic link out of it', async () => {
    const { layout } = await ensureDataDir(fs, join(root, 'AYAR'), uid);
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    mkdirSync(join(layout.tmp, 'check-1', 'reports'), { recursive: true });
    writeFileSync(join(layout.tmp, 'check-1', 'reports', 'raw.json'), '{"token":"raw"}');
    symlinkSync(outside, join(layout.tmp, 'link'));
    const r = await cleanTmp(fs, layout);
    expect(r.removedEntries).toBe(2);
    expect(readdirSync(layout.tmp)).toEqual([]);
    expect(mode(layout.tmp)).toBe(0o700);
    expect(readdirSync(outside)).toEqual(['keep.txt']);
  });
});

describe('database (E-03 settings)', () => {
  it('opens in WAL with foreign keys on and synchronous NORMAL', async () => {
    const { db } = await freshStore();
    expect(db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode).toBe('wal');
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1);
    expect(db.get<{ synchronous: number }>('PRAGMA synchronous')?.synchronous).toBe(1);
  });

  it('rolls a failed transaction back', async () => {
    const { db, layout } = await freshStore();
    await migrate(db, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO settings (key, value_json) VALUES ('ui.theme', '\"dark\"')");
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.get('SELECT * FROM settings')).toBeUndefined();
  });
});

describe('migrations (14.1, 14.3, NFR-02, G-11)', () => {
  it('creates the whole 14.1 schema in the first migration, after a backup', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    const r = await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.1.0' });
    expect(r).toMatchObject({ from: 0, to: 1, applied: ['1-initial-schema'] });
    expect(r.backup).not.toBeNull();
    expect(existsSync(r.backup!)).toBe(true);
    expect(mode(r.backup!)).toBe(0o600);
    expect(readSchemaVersion(db)).toBe(1);

    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((t) => t.name);
    expect(tables).toEqual(Object.keys(PLAN_TABLES).sort());
    for (const [table, columns] of Object.entries(PLAN_TABLES)) {
      const actual = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
      expect(actual.sort(), table).toEqual([...columns].sort());
    }
    for (const [table, cols] of PLAN_INDEXES) {
      const indexes = db.all<{ name: string }>(`PRAGMA index_list(${table})`).map((i) => i.name);
      const match = indexes.some((name) => db.all<{ name: string }>(`PRAGMA index_info(${name})`).map((c) => c.name).join(',') === cols.join(','));
      expect(match, `${table}(${cols.join(', ')})`).toBe(true);
    }
    const meta = Object.fromEntries(db.all<{ key: string; value: string }>('SELECT key, value FROM schema_meta').map((r) => [r.key, r.value]));
    expect(meta).toMatchObject({ schema_version: '1', app_version: '0.1.0', created_at: '2026-10-10T08:00:00.000Z' });
  });

  it('enforces foreign keys and the plan vocabularies', async () => {
    const { db, layout } = await freshStore();
    await migrate(db, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
    expect(() => db.run("INSERT INTO check_runs (id, run_id, check_id, component, state) VALUES ('c1', 'missing', 'x', 'root', 'queued')")).toThrow(/FOREIGN KEY/);
    db.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p1', 'P', '/p', '/p', 'now')");
    db.run("INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, state) VALUES ('r1', 'RUN-20261010-001', 'p1', 'full', '{}', '{}', 'running')");
    db.run("INSERT INTO check_runs (id, run_id, check_id, component, state) VALUES ('c1', 'r1', 'x', 'root', 'running')");
    const finding = (severity: string) =>
      db.run(
        "INSERT INTO findings (id, check_run_id, fingerprint, display_id, check_id, component, severity, proof, origin, title_key) VALUES (?, 'c1', 'f', 'AYR-SEC-PERM-0001', 'x', 'root', ?, 'proven', 'project', 't')",
        `f-${severity}`,
        severity,
      );
    expect(() => finding('high')).not.toThrow();
    expect(() => finding('catastrophic')).toThrow(/CHECK/);
    expect(() => db.run("INSERT INTO settings (key, value_json) VALUES ('k', '{not json')")).toThrow(/CHECK/);
  });

  it('backs up the current data before a later migration, and only then migrates', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.1.0' });
    writeSetting(db, { key: 'ui.language', value: 'ar' });
    clock.advance(60_000);
    const v2: Migration[] = [...MIGRATIONS, { version: 2, name: 'test-table', sql: 'CREATE TABLE v2_marker (x INTEGER) STRICT;' }];
    const r = await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.2.0', migrations: v2 });
    expect(r).toMatchObject({ from: 1, to: 2, applied: ['2-test-table'] });
    expect(r.backup).toMatch(/pre-v1-to-v2\.db$/);
    expect(readSchemaVersion(db)).toBe(2);

    const backup = openDatabase(r.backup!, { readOnly: true });
    open.push(backup);
    expect(readSchemaVersion(backup)).toBe(1);
    expect(backup.get<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE name = 'v2_marker'")?.n).toBe(0);
    expect(readSettings(backup, ['ui.language'])).toEqual({ 'ui.language': 'ar' });
  });

  it('does not migrate when the backup cannot be written', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.1.0' });
    chmodSync(layout.backups, 0o500);
    try {
      const v2: Migration[] = [...MIGRATIONS, { version: 2, name: 'test-table', sql: 'CREATE TABLE v2_marker (x INTEGER) STRICT;' }];
      await expect(migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.2.0', migrations: v2 })).rejects.toThrow();
      expect(readSchemaVersion(db)).toBe(1);
      expect(db.get<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE name = 'v2_marker'")?.n).toBe(0);
    } finally {
      chmodSync(layout.backups, 0o700);
    }
  });

  it('refuses a database written by a newer AYAR, without a backup or any change', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.1.0' });
    db.run("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'", String(latestVersion() + 1));
    const before = await listBackups(fs, layout.backups);
    const err = await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: '0.1.0' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(err).toMatchObject({ code: 'db_newer_than_app', details: { dbVersion: latestVersion() + 1, appSchemaVersion: latestVersion() } });
    expect(await listBackups(fs, layout.backups)).toEqual(before);
    expect(readSchemaVersion(db)).toBe(latestVersion() + 1);
  });
});

describe('integrity_check (C-04, 14.3)', () => {
  it('reports ok on a healthy database', async () => {
    const { db, layout } = await freshStore();
    await migrate(db, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
    expect(integrityCheck(db)).toEqual({ ok: true, problems: [] });
  });

  it('reports a damaged database', async () => {
    const { db, layout } = await freshStore();
    await migrate(db, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
    db.transaction(() => {
      for (let i = 0; i < 400; i++) db.run('INSERT INTO audit_log (id, at, actor, action) VALUES (?, ?, ?, ?)', `a${i}`, 'now', 'test', 'x'.repeat(200));
    });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    open.splice(open.indexOf(db), 1);
    // Overwrite the middle of the file: b-tree pages that integrity_check walks.
    const size = statSync(layout.db).size;
    const fd = openSync(layout.db, 'r+');
    writeSync(fd, Buffer.alloc(8192, 0xa5), 0, 8192, Math.floor(size / 2 / 4096) * 4096);
    closeSync(fd);
    let result;
    try {
      result = integrityCheck(openDb(layout.db));
    } catch (e) {
      result = { ok: false, problems: [String(e)] }; // SQLite may refuse to open it at all
    }
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });
});

describe('backups (14.3)', () => {
  it('keeps the last three', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    const made: string[] = [];
    for (let i = 0; i < 5; i++) {
      made.push(await backupDatabase(db, fs, layout.backups, 'weekly', clock));
      clock.advance(1000);
    }
    expect((await listBackups(fs, layout.backups)).map((n) => join(layout.backups, n))).toEqual(made.slice(2));
  });

  it('makes the weekly backup only when the newest is a week old', async () => {
    const { db, layout } = await freshStore();
    const clock = fakeClock();
    expect(await weeklyBackupIfDue(db, fs, layout.backups, clock)).not.toBeNull();
    clock.advance(WEEK_MS - 1000);
    expect(await weeklyBackupIfDue(db, fs, layout.backups, clock)).toBeNull();
    clock.advance(2000);
    expect(await weeklyBackupIfDue(db, fs, layout.backups, clock)).not.toBeNull();
  });
});

describe('settings (14.1)', () => {
  it('returns defaults, stores values, and falls back when a stored value is no longer valid', async () => {
    const { db, layout } = await freshStore();
    await migrate(db, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
    expect(readSettings(db)).toEqual(settingDefaults());
    expect(readSettings(db)).toMatchObject({ 'ui.language': 'system', 'ui.theme': 'system', 'environment.timeoutSeconds': 10, 'discovery.maxDepth': 12 });
    writeSetting(db, { key: 'ui.theme', value: 'dark' });
    expect(readSettings(db, ['ui.theme'])).toEqual({ 'ui.theme': 'dark' });
    db.run("UPDATE settings SET value_json = '\"sepia\"' WHERE key = 'ui.theme'");
    expect(readSettings(db, ['ui.theme'])).toEqual({ 'ui.theme': 'system' });
  });
});
