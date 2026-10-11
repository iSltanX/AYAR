// Forward-only migrations, each preceded by a backup (NFR-02, G-11, 14.3). An older app refuses a newer
// database with a clear error and touches nothing. schema_meta holds the schema and app versions (14.1).
import type { Clock, FileSystem } from '../ports/index.ts';
import { backupDatabase } from './backup.ts';
import { tableExists, type Db } from './db.ts';
import { StorageError } from './errors.ts';
import { INITIAL_SCHEMA } from './schema/0001-initial.ts';
import { RUNS_SCHEMA } from './schema/0002-runs.ts';
import { VERDICTS_SCHEMA } from './schema/0003-verdicts.ts';
import { PROBE_SCHEMA } from './schema/0004-probe.ts';
import { REPORTS_SCHEMA } from './schema/0005-reports.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial-schema', sql: INITIAL_SCHEMA },
  // DEV-5: plans (G-24), accepted tool versions (G-25), and the columns of the executor and evidence store.
  { version: 2, name: 'runs-and-evidence', sql: RUNS_SCHEMA },
  // DEV-6: the findings' tool rule and effect, the check runs' counts and reader, and the rounds' members.
  { version: 3, name: 'verdicts', sql: VERDICTS_SCHEMA },
  // DEV-7: the snapshot a reference image was approved on (C-14, C-17).
  { version: 4, name: 'probe-baselines', sql: PROBE_SCHEMA },
  // DEV-9: reports, reviews, the task lifecycle, model checks and the integrity checks (C-21 to C-25).
  { version: 5, name: 'reports-reviews-claims', sql: REPORTS_SCHEMA },
];

export function latestVersion(migrations: readonly Migration[] = MIGRATIONS): number {
  return migrations.at(-1)?.version ?? 0;
}

/** 0 for a new database (no schema_meta yet). */
export function readSchemaVersion(db: Db): number {
  if (!tableExists(db, 'schema_meta')) return 0;
  const row = db.get<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'schema_version'");
  const v = Number(row?.value ?? 0);
  if (!Number.isInteger(v) || v < 0) throw new StorageError('db_corrupt', 'schema_version is not a number', { value: row?.value ?? null });
  return v;
}

/** Throws db_newer_than_app when the database was written by a newer AYAR. */
export function assertNotNewer(db: Db, migrations: readonly Migration[] = MIGRATIONS): number {
  const current = readSchemaVersion(db);
  const latest = latestVersion(migrations);
  if (current > latest) {
    throw new StorageError('db_newer_than_app', 'the database is newer than this app', { dbVersion: current, appSchemaVersion: latest });
  }
  return current;
}

export interface MigrationReport {
  from: number;
  to: number;
  backup: string | null;
  applied: string[];
}

export interface MigrateOptions {
  fs: FileSystem;
  clock: Clock;
  backupsDir: string;
  appVersion: string;
  migrations?: readonly Migration[];
}

export async function migrate(db: Db, o: MigrateOptions): Promise<MigrationReport> {
  const migrations = o.migrations ?? MIGRATIONS;
  const from = assertNotNewer(db, migrations);
  const pending = migrations.filter((m) => m.version > from);
  const to = latestVersion(migrations);
  if (!pending.length) return { from, to: from, backup: null, applied: [] };
  // The backup comes first; if it fails, the error propagates and no migration runs.
  const backup = await backupDatabase(db, o.fs, o.backupsDir, `pre-v${from}-to-v${to}`, o.clock);
  const applied: string[] = [];
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      const now = o.clock.now().toISOString();
      const upsert = 'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value';
      db.run(upsert, 'schema_version', String(m.version));
      db.run(upsert, 'app_version', o.appVersion);
      db.run(upsert, 'migrated_at', now);
      if (m.version === 1) db.run(upsert, 'created_at', now);
    });
    applied.push(`${m.version}-${m.name}`);
  }
  return { from, to, backup, applied };
}
