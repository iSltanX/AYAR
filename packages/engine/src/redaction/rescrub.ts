// C-18 layer 1 after the fact [D-DEV4-07]: the values of sensitive variables become known when C-07 reads the
// login environment (at readiness, never during discovery: AT-01). Rows saved before that — discovery snapshots,
// profile versions, approval notes — are redacted again with the now complete rules, and the WAL is truncated,
// so with secure_delete no raw byte of such a value remains in the database or its journal.
import type { Db } from '../storage/db.ts';
import { contentHash, type ProfileContent } from '../profile/store.ts';
import type { RedactionCounts, Redactor } from './redactor.ts';

export function rescrub(db: Db, redactor: Redactor): { rows: number } {
  let rows = 0;
  const scrub = <T>(json: string): { value: T; changed: boolean; counts: RedactionCounts } => {
    const counts: RedactionCounts = {};
    const value = redactor.redactJson(JSON.parse(json) as T, counts);
    return { value, changed: Object.keys(counts).length > 0, counts };
  };
  db.transaction(() => {
    for (const r of db.all<{ id: string; facts_json: string; inventory_json: string; warnings_json: string }>('SELECT id, facts_json, inventory_json, warnings_json FROM discovery_snapshots')) {
      const f = scrub<{ redactions?: Record<string, number> }>(r.facts_json);
      const i = scrub<unknown>(r.inventory_json);
      const w = scrub<unknown>(r.warnings_json);
      if (!f.changed && !i.changed && !w.changed) continue;
      const redactions = { ...(f.value.redactions ?? {}) };
      for (const c of [f.counts, i.counts, w.counts]) for (const [k, n] of Object.entries(c)) redactions[k] = (redactions[k] ?? 0) + n;
      db.run('UPDATE discovery_snapshots SET facts_json = ?, inventory_json = ?, warnings_json = ? WHERE id = ?', JSON.stringify({ ...f.value, redactions }), JSON.stringify(i.value), JSON.stringify(w.value), r.id);
      rows++;
    }
    for (const r of db.all<{ id: string; content_json: string }>('SELECT id, content_json FROM profiles')) {
      const c = scrub<ProfileContent>(r.content_json);
      if (!c.changed) continue;
      db.run('UPDATE profiles SET content_json = ?, content_hash = ? WHERE id = ?', JSON.stringify(c.value), contentHash(c.value), r.id);
      rows++;
    }
    for (const r of db.all<{ id: string; note: string }>('SELECT id, note FROM approvals WHERE note IS NOT NULL')) {
      const n = redactor.redactText(r.note);
      if (n.text === r.note) continue;
      db.run('UPDATE approvals SET note = ? WHERE id = ?', n.text, r.id);
      rows++;
    }
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return { rows };
}
