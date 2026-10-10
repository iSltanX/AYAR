// The boot order of C-04, with G-27 settled:
//   data folder → open ayar.db READ-ONLY → integrity_check → schema version check → reopen for writing →
//   settle the process ledger → delete tmp/ → back up and migrate → load the catalog → mark interrupted
//   runs → weekly backup if due.
// Nothing touches the database file (not even the WAL pragma) before integrity_check and the version check
// pass. The ledger is read before migrating (its frozen columns make that safe on any schema). A damaged
// database, or one newer than this app, still gets the safety steps (ledger kills, tmp/ deletion) through
// the read-only connection, but no write: the engine comes up "degraded". Each later step either degrades
// the engine (tmp/, migration, catalog) or only logs (interrupted runs, weekly backup); none crashes it.
import type { ErrorCode } from '@ayar/protocol';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { weeklyBackupIfDue } from '../storage/backup.ts';
import { cleanTmp, ensureDataDir, type DataLayout } from '../storage/data-dir.ts';
import { openDatabase, type Db } from '../storage/db.ts';
import { StorageError } from '../storage/errors.ts';
import { integrityCheck } from '../storage/integrity.ts';
import { assertNotNewer, migrate, MIGRATIONS, readSchemaVersion, type Migration } from '../storage/migrations.ts';
import { reapLedger } from './ledger.ts';

export const BOOT_STEPS = [
  'data_dir',
  'db.open',
  'db.integrity',
  'db.version',
  'db.writable',
  'ledger.reap',
  'tmp.clean',
  'db.migrate',
  'catalog.load',
  'runs.interrupted',
  'db.weekly_backup',
] as const;
export type BootStepName = (typeof BOOT_STEPS)[number];

export interface BootStep {
  step: BootStepName;
  ok: boolean;
  detail: Record<string, string | number | boolean | null>;
}

export type CatalogLoader = () => Promise<{ loaded: boolean; detail: string }>;

/** DEV-4 replaces this with the real catalog (C-08) and its schema validation. */
export const noCatalog: CatalogLoader = () => Promise.resolve({ loaded: false, detail: 'not_implemented: the catalog arrives in DEV-4' });

export interface BootOptions {
  dataDir: string;
  ports: EnginePorts;
  logger: Logger;
  appVersion: string;
  migrations?: readonly Migration[];
  catalog?: CatalogLoader;
}

export interface BootResult {
  state: 'ready' | 'degraded';
  reason: ErrorCode | null;
  layout: DataLayout | null;
  db: Db | null;
  schemaVersion: number | null;
  steps: BootStep[];
}

/** Marks what an unexpected stop left running as interrupted (FR-25, 7.5). DEV-5 owns the full vocabulary. */
export function markInterrupted(db: Db, now: Date): { checkRuns: number; runs: number } {
  return db.transaction(() => {
    const at = now.toISOString();
    const checkRuns = db.run(
      "UPDATE check_runs SET outcome = 'interrupted', state = 'finished', finished_at = ? WHERE state IN ('running', 'cancelling')",
      at,
    ).changes;
    const runs = db.run("UPDATE runs SET state = 'interrupted', finished_at = ? WHERE state IN ('running', 'cancelling')", at).changes;
    return { checkRuns, runs };
  });
}

export async function boot(o: BootOptions): Promise<BootResult> {
  const { fs, clock, processes } = o.ports;
  const steps: BootStep[] = [];
  const record = (step: BootStepName, ok: boolean, detail: BootStep['detail'] = {}) => {
    steps.push({ step, ok, detail });
    o.logger.log(ok ? 'info' : 'warn', `boot ${step}`, detail);
  };
  const result = (state: BootResult['state'], reason: ErrorCode | null, layout: DataLayout | null, db: Db | null, schemaVersion: number | null): BootResult => ({
    state,
    reason,
    layout,
    db,
    schemaVersion,
    steps,
  });

  // 0. The data folder: nothing is written unless it is safe.
  let layout: DataLayout;
  try {
    const r = await ensureDataDir(fs, o.dataDir, processes.currentUid());
    layout = r.layout;
    record('data_dir', true, { created: r.created.length, tightened: r.tightened.length });
  } catch (e) {
    const code = e instanceof StorageError ? e.code : 'internal';
    record('data_dir', false, { error: code });
    return result('degraded', code, null, null, null);
  }

  // 1. Probe the database READ-ONLY: no pragma, no journal change, no write until integrity and version pass.
  let probe: Db | null = null;
  let reason: ErrorCode | null = null;
  let schemaVersion: number | null = null;
  const exists = (await fs.lstat(layout.db)) !== null;
  if (!exists) {
    record('db.open', true, { exists: false });
    record('db.integrity', true, { skipped: 'new database' });
    record('db.version', true, { schemaVersion: 0 });
    schemaVersion = 0;
  } else {
    try {
      probe = openDatabase(layout.db, { readOnly: true });
      record('db.open', true, { exists: true, readOnly: true });
    } catch (e) {
      reason = 'db_corrupt';
      record('db.open', false, { error: e instanceof Error ? e.message : String(e) });
    }
    // 1b. Integrity, before any write.
    if (probe) {
      const integrity = integrityCheck(probe);
      record('db.integrity', integrity.ok, { problems: integrity.problems.length });
      if (!integrity.ok) reason = 'db_corrupt';
    }
    // 1c. A database from a newer AYAR is left untouched.
    if (probe && !reason) {
      try {
        schemaVersion = assertNotNewer(probe, o.migrations ?? MIGRATIONS);
        record('db.version', true, { schemaVersion });
      } catch (e) {
        reason = e instanceof StorageError ? e.code : 'db_corrupt';
        record('db.version', false, { error: reason });
      }
    }
  }

  // 1d. Only a healthy, compatible (or new) database is opened for writing, with the E-03 settings.
  let db: Db | null = null;
  if (!reason) {
    try {
      probe?.close();
      probe = null;
      db = openDatabase(layout.db);
      await fs.chmod(layout.db, 0o600);
      record('db.writable', true);
    } catch (e) {
      reason = 'db_corrupt';
      record('db.writable', false, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 2. Settle the ledger: kill orphaned groups (always), mark entries (only on a healthy database).
  const ledger = await reapLedger(db ?? probe, processes, { writable: db !== null, tmpRoot: layout.tmp, now: () => clock.now() });
  record('ledger.reap', ledger.error === null && ledger.failed === 0, { ...ledger });

  // 3. Delete tmp/ now that no ledger process can still write into it. If that fails, raw reports may remain:
  //    the engine does not go on to serve (degraded), and the next boot tries again.
  try {
    record('tmp.clean', true, await cleanTmp(fs, layout));
  } catch (e) {
    record('tmp.clean', false, { error: e instanceof Error ? e.message : String(e) });
    reason ??= 'internal';
  }

  if (reason || !db) {
    probe?.close();
    db?.close();
    return result('degraded', reason ?? 'db_corrupt', layout, null, schemaVersion);
  }

  // 4. Back up, then migrate (a failed backup stops here: the engine comes up degraded, unmigrated).
  try {
    const m = await migrate(db, { fs, clock, backupsDir: layout.backups, appVersion: o.appVersion, ...(o.migrations ? { migrations: o.migrations } : {}) });
    schemaVersion = readSchemaVersion(db);
    record('db.migrate', true, { from: m.from, to: m.to, backup: m.backup !== null, applied: m.applied.join(',') });
  } catch (e) {
    const code = e instanceof StorageError ? e.code : 'internal';
    record('db.migrate', false, { error: code, message: e instanceof Error ? e.message : String(e) });
    db.close();
    return result('degraded', code, layout, null, readSchemaVersionSafe(layout));
  }

  // 5. Catalog and knowledge base (C-08, DEV-4): without a valid catalog no check can run.
  try {
    record('catalog.load', true, await (o.catalog ?? noCatalog)());
  } catch (e) {
    record('catalog.load', false, { error: e instanceof Error ? e.message : String(e) });
    db.close();
    return result('degraded', 'internal', layout, null, schemaVersion);
  }

  // 5b. Runs that an unexpected stop left running. A failure only logs: the next boot tries again.
  try {
    record('runs.interrupted', true, markInterrupted(db, clock.now()));
  } catch (e) {
    record('runs.interrupted', false, { error: e instanceof Error ? e.message : String(e) });
  }

  // 6. The weekly backup (14.3), when the newest backup is a week old. Optional: a failure only logs.
  try {
    const weekly = await weeklyBackupIfDue(db, fs, layout.backups, clock);
    record('db.weekly_backup', true, { made: weekly !== null });
  } catch (e) {
    record('db.weekly_backup', false, { error: e instanceof Error ? e.message : String(e) });
  }

  return result('ready', null, layout, db, schemaVersion);
}

function readSchemaVersionSafe(layout: DataLayout): number | null {
  try {
    const db = openDatabase(layout.db, { readOnly: true });
    try {
      return readSchemaVersion(db);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
