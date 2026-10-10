// PRAGMA integrity_check at boot and weekly (C-04, 14.3).
import type { Db } from './db.ts';

export interface IntegrityResult {
  ok: boolean;
  /** The first problems SQLite reported (it reports up to 100). */
  problems: string[];
}

export function integrityCheck(db: Db): IntegrityResult {
  try {
    const rows = db.all<{ integrity_check: string }>('PRAGMA integrity_check');
    const problems = rows.map((r) => r.integrity_check).filter((m) => m !== 'ok');
    return { ok: rows.length > 0 && problems.length === 0, problems: problems.slice(0, 10) };
  } catch (e) {
    return { ok: false, problems: [e instanceof Error ? e.message : String(e)] };
  }
}
