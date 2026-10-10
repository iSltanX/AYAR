// The boot order of C-04, with G-27 settled:
//   data folder → open ayar.db READ-ONLY → integrity_check → schema version check → reopen for writing →
//   settle the process ledger → delete tmp/ → back up and migrate → load the catalog → mark interrupted
//   runs → weekly backup if due.
// Nothing touches the database file (not even the WAL pragma) before integrity_check and the version check
// pass. The ledger is read before migrating (its frozen columns make that safe on any schema). A damaged
// database, or one newer than this app, still gets the safety steps (ledger kills, tmp/ deletion) through
// the read-only connection, but no write: the engine comes up "degraded". Each later step either degrades
// the engine (tmp/, migration, catalog) or only logs (interrupted runs, weekly backup); none crashes it.
import { CatalogError, loadCatalog, type Catalog, type LoadResult } from '@ayar/catalog';
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

/** Loads and validates the catalog (C-08). Throws CatalogError when it is invalid: the engine then stays degraded. */
export type CatalogLoader = (now: Date) => LoadResult | Promise<LoadResult>;

/** The catalog shipped with this engine (packages/catalog), validated at load exactly as at build. */
export const builtinCatalog: CatalogLoader = (now) => loadCatalog(undefined, { now });

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
  catalog: Catalog | null;
  steps: BootStep[];
}

/**
 * Marks what an unexpected stop left unfinished as interrupted (FR-25, 7.5, G-DEV3-04): a running check is
 * «انقطع»; a check of that run that had not started is «انقطع» too (the run was), and the run is «interrupted»,
 * so «أعد غير المكتمل» finds them all. A run still waiting in the queue was never started: interrupted as well.
 */
export function markInterrupted(db: Db, now: Date): { checkRuns: number; runs: number } {
  return db.transaction(() => {
    const at = now.toISOString();
    const stopped = JSON.stringify({ key: 'run.reason.engineStopped' });
    const notStarted = JSON.stringify({ key: 'run.reason.runInterrupted' });
    let checkRuns = db.run(
      "UPDATE check_runs SET outcome = 'interrupted', auto_outcome = 'interrupted', outcome_reason = coalesce(outcome_reason, ?), state = 'finished', finished_at = ? WHERE state IN ('running', 'cancelling')",
      stopped,
      at,
    ).changes;
    checkRuns += db.run(
      "UPDATE check_runs SET outcome = 'interrupted', auto_outcome = 'interrupted', outcome_reason = ?, state = 'finished', finished_at = ? WHERE state IN ('planned', 'queued') AND run_id IN (SELECT id FROM runs WHERE state IN ('queued', 'running', 'cancelling'))",
      notStarted,
      at,
    ).changes;
    const runs = db.run("UPDATE runs SET state = 'interrupted', finished_at = ? WHERE state IN ('queued', 'running', 'cancelling')", at).changes;
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
  let catalog: Catalog | null = null;
  const result = (state: BootResult['state'], reason: ErrorCode | null, layout: DataLayout | null, db: Db | null, schemaVersion: number | null): BootResult => ({
    state,
    reason,
    layout,
    db,
    schemaVersion,
    catalog,
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

  // 5. The catalog (C-08): validated at load; an invalid catalog keeps the engine from serving (degraded),
  //    and an entry verified more than 180 days ago only warns (NFR-06). Its version and hash are recorded.
  try {
    const loaded = await (o.catalog ?? builtinCatalog)(clock.now());
    catalog = loaded.catalog;
    for (const s of loaded.stale) o.logger.log('warn', 'catalog entry is stale', { kind: s.kind, id: s.id, verifiedAt: s.verifiedAt, ageDays: s.ageDays });
    db.run(
      'INSERT INTO catalog_meta (version, hash, loaded_at) VALUES (?, ?, ?) ON CONFLICT (version) DO UPDATE SET hash = excluded.hash, loaded_at = excluded.loaded_at',
      catalog.version,
      catalog.hash,
      clock.now().toISOString(),
    );
    record('catalog.load', true, { version: catalog.version, hash: catalog.hash.slice(0, 16), checks: catalog.checks.length, stale: loaded.stale.length });
  } catch (e) {
    const invalid = e instanceof CatalogError;
    record('catalog.load', false, { error: invalid ? 'catalog_invalid' : 'internal', issues: invalid ? e.issues.length : null, message: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    catalog = null;
    db.close();
    return result('degraded', invalid ? 'catalog_invalid' : 'internal', layout, null, schemaVersion);
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
