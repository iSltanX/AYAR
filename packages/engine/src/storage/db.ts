// The access layer (E-03, A-09): the engine talks to this interface, so better-sqlite3 can replace node:sqlite
// behind it if ever needed. The engine is the single writer of ayar.db (6.3).
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type SqlValue = SQLInputValue;

export interface Db {
  readonly path: string;
  exec(sql: string): void;
  run(sql: string, ...params: SqlValue[]): { changes: number };
  get<T>(sql: string, ...params: SqlValue[]): T | undefined;
  all<T>(sql: string, ...params: SqlValue[]): T[];
  /** BEGIN IMMEDIATE … COMMIT, or ROLLBACK when fn throws. Every state transition is one of these (C-17). */
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface OpenOptions {
  readOnly?: boolean;
  /**
   * A backup copy (VACUUM INTO): writable, secure_delete on, but its journal mode is left as it is, so no WAL
   * files appear next to it (G-DEV4-01: backups are redacted again in place).
   */
  backupCopy?: boolean;
}

/**
 * Opens ayar.db with the settings E-03 validated: WAL, synchronous NORMAL, foreign keys on, a busy timeout.
 * wal_autocheckpoint stays at SQLite's default of 1000 pages [D-DEV3-06].
 */
export function openDatabase(path: string, options: OpenOptions = {}): Db {
  const db = new DatabaseSync(path, { readOnly: options.readOnly ?? false, enableForeignKeyConstraints: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    if (options.backupCopy) db.exec('PRAGMA secure_delete = ON');
    else if (!options.readOnly) {
      const mode = db.prepare('PRAGMA journal_mode = WAL').get() as { journal_mode: string } | undefined;
      if (mode?.journal_mode !== 'wal') throw new Error(`WAL not enabled (journal_mode=${mode?.journal_mode ?? '?'})`);
      db.exec('PRAGMA synchronous = NORMAL');
      // Deleted and overwritten content is zeroed on disk [D-DEV4-07]: when C-18 re-redacts a stored row (a value
      // that became known as sensitive), the old bytes do not survive in free pages.
      db.exec('PRAGMA secure_delete = ON');
    }
  } catch (e) {
    db.close();
    throw e;
  }
  return wrap(db, path);
}

function wrap(db: DatabaseSync, path: string): Db {
  let depth = 0;
  return {
    path,
    exec: (sql) => db.exec(sql),
    run: (sql, ...params) => {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    get: <T>(sql: string, ...params: SqlValue[]) => db.prepare(sql).get(...params) as T | undefined,
    all: <T>(sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params) as T[],
    transaction<T>(fn: () => T): T {
      if (depth > 0) throw new Error('nested transactions are not supported');
      db.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}

/** True when the table exists (used before migrations, when the schema may be anything). */
export function tableExists(db: Db, name: string): boolean {
  return db.get<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", name)?.n === 1;
}
