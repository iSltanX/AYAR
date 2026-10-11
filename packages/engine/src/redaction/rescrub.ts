// C-18 layer 1 after the fact [D-DEV4-07]: the values of sensitive variables become known when C-07 reads the
// login environment (at readiness, never during discovery: AT-01). Rows saved before that — discovery snapshots,
// profile versions, approval notes — are redacted again with the now complete rules, and the WAL is truncated,
// so with secure_delete no raw byte of such a value remains in the database or its journal.
import { join } from 'node:path';
import type { FileSystem, Logger } from '../ports/index.ts';
import { listBackups } from '../storage/backup.ts';
import { openDatabase, tableExists, type Db } from '../storage/db.ts';
import { contentHash, type ProfileContent } from '../profile/store.ts';
import type { RedactionCounts, Redactor } from './redactor.ts';

export function rescrub(db: Db, redactor: Redactor): { rows: number } {
  let rows = 0;
  const scrub = <T>(json: string): { value: T; changed: boolean; counts: RedactionCounts } => {
    const counts: RedactionCounts = {};
    const value = redactor.redactJson(JSON.parse(json) as T, counts);
    return { value, changed: Object.keys(counts).length > 0, counts };
  };
  // A backup may come from an older schema, or be the empty database before the first migration (G-DEV4-01).
  const has = (table: string, column?: string) => tableExists(db, table) && (!column || db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column));
  db.transaction(() => {
    for (const r of has('discovery_snapshots') ? db.all<{ id: string; facts_json: string; inventory_json: string; warnings_json: string }>('SELECT id, facts_json, inventory_json, warnings_json FROM discovery_snapshots') : []) {
      const f = scrub<{ redactions?: Record<string, number> }>(r.facts_json);
      const i = scrub<unknown>(r.inventory_json);
      const w = scrub<unknown>(r.warnings_json);
      if (!f.changed && !i.changed && !w.changed) continue;
      const redactions = { ...(f.value.redactions ?? {}) };
      for (const c of [f.counts, i.counts, w.counts]) for (const [k, n] of Object.entries(c)) redactions[k] = (redactions[k] ?? 0) + n;
      db.run('UPDATE discovery_snapshots SET facts_json = ?, inventory_json = ?, warnings_json = ? WHERE id = ?', JSON.stringify({ ...f.value, redactions }), JSON.stringify(i.value), JSON.stringify(w.value), r.id);
      rows++;
    }
    for (const r of has('profiles') ? db.all<{ id: string; content_json: string }>('SELECT id, content_json FROM profiles') : []) {
      const c = scrub<ProfileContent>(r.content_json);
      if (!c.changed) continue;
      db.run('UPDATE profiles SET content_json = ?, content_hash = ? WHERE id = ?', JSON.stringify(c.value), contentHash(c.value), r.id);
      rows++;
    }
    for (const r of has('approvals') ? db.all<{ id: string; note: string }>('SELECT id, note FROM approvals WHERE note IS NOT NULL') : []) {
      const n = redactor.redactText(r.note);
      if (n.text === r.note) continue;
      db.run('UPDATE approvals SET note = ? WHERE id = ?', n.text, r.id);
      rows++;
    }
    // DEV-5's JSON columns: a check's command and raw result (its last lines), plans, and setup previews; DEV-6's:
    // a finding's place, the reader of a check run, a reason (a tool's first error line), and the indices.
    const jsonColumns: [string, string][] = [['check_runs', 'command_json'], ['check_runs', 'raw_json'], ['check_runs', 'notes_json'], ['plans', 'plan_json'], ['setup_actions', 'preview_json'], ['findings', 'location_json'], ['check_runs', 'reader_json'], ['check_runs', 'outcome_reason'], ['runs', 'purity_json'], ['rounds', 'purity_json']];
    for (const [table, column] of jsonColumns) {
      if (!has(table, column)) continue;
      for (const r of db.all<{ rid: number; v: string }>(`SELECT rowid AS rid, ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`)) {
        const c = scrub<unknown>(r.v);
        if (!c.changed) continue;
        db.run(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`, JSON.stringify(c.value), r.rid);
        rows++;
      }
    }
    // DEV-6: the findings' texts (a tool's message, an expected and an actual value).
    const textColumns: [string, string][] = [['findings', 'message_redacted'], ['findings', 'expected_text'], ['findings', 'actual_text'], ['findings', 'tool_rule_id']];
    for (const [table, column] of textColumns) {
      if (!has(table, column)) continue;
      for (const r of db.all<{ rid: number; v: string }>(`SELECT rowid AS rid, ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`)) {
        const t = redactor.redactText(r.v);
        if (t.text === r.v) continue;
        db.run(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`, t.text, r.rid);
        rows++;
      }
    }
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return { rows };
}

/**
 * G-DEV4-01: a backup taken before a value became known as sensitive may still hold it. Each backup is redacted
 * again with the same rules, then compacted (VACUUM, with secure_delete) so the old bytes leave the file. A backup
 * that cannot be redacted is deleted rather than kept with the value: a later backup or the live database remain.
 */
export async function rescrubBackups(fs: FileSystem, dir: string, redactor: Redactor, logger: Logger): Promise<{ rewritten: number; deleted: number }> {
  let rewritten = 0;
  let deleted = 0;
  for (const name of await listBackups(fs, dir)) {
    const path = join(dir, name);
    try {
      const db = openDatabase(path, { backupCopy: true });
      try {
        if (rescrub(db, redactor).rows > 0) {
          db.exec('VACUUM');
          rewritten++;
        }
      } finally {
        db.close();
      }
    } catch (e) {
      logger.log('warn', 'a backup could not be redacted again: deleted', { backup: name, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      await fs.remove(path);
      for (const suffix of ['-wal', '-shm', '-journal']) await fs.remove(path + suffix);
      deleted++;
    }
  }
  return { rewritten, deleted };
}
