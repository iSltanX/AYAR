// C-17 «الاحتفاظ» and 14.3: the last N runs of each project are kept (evidence.retainRuns, 20 by default), and
// with them every run marked «محفوظ دائمًا», every run a round stands on, every run where a still-open finding
// was first seen (the integrity guard's basis, C-22), and anything not finished. Older runs go with their
// evidence folder; their state snapshots go when nothing else names them (a round, a review, another run); then
// the collector frees the content no snapshot references any more. The space shown per project is what its
// evidence and its snapshots' contents take on disk.
import type { Db } from '../storage/db.ts';
import type { BlobStore } from './blobs.ts';
import type { EvidenceStore } from './store.ts';

export interface RetentionDeps {
  db: Db;
  evidence: EvidenceStore;
  blobs: BlobStore;
}

/** The runs retention may delete in a project, oldest first. */
export function expiredRuns(db: Db, projectId: string, keep: number): string[] {
  const runs = db.all<{ id: string; keep_forever: number; state: string }>(
    'SELECT id, keep_forever, state FROM runs WHERE project_id = ? ORDER BY coalesce(started_at, finished_at, \'\') DESC, display_id DESC',
    projectId,
  );
  const protectedIds = new Set<string>([
    ...db.all<{ id: string }>('SELECT base_run_id AS id FROM rounds WHERE project_id = ? AND base_run_id IS NOT NULL', projectId).map((r) => r.id),
    ...db
      .all<{ id: string }>(
        "SELECT DISTINCT f.first_seen_run_id AS id FROM findings f JOIN check_runs c ON c.id = f.check_run_id JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND f.first_seen_run_id IS NOT NULL AND coalesce(f.cross_run_status, 'new') <> 'resolved'",
        projectId,
      )
      .map((r) => r.id),
  ]);
  const out: string[] = [];
  runs.forEach((r, i) => {
    if (i < keep || r.keep_forever === 1 || protectedIds.has(r.id) || !['finished', 'interrupted'].includes(r.state)) return;
    out.push(r.id);
  });
  return out.reverse();
}

/** Deletes runs with their evidence and the snapshots only they used; returns what was freed. */
export async function deleteRuns(d: RetentionDeps, projectId: string, runIds: readonly string[]): Promise<{ deleted: number; freedBytes: number }> {
  if (!runIds.length) return { deleted: 0, freedBytes: 0 };
  const marks = runIds.map(() => '?').join(',');
  const evidenceBytes = d.db.get<{ n: number | null }>(`SELECT sum(e.size) AS n FROM evidence e JOIN check_runs c ON c.id = e.check_run_id WHERE c.run_id IN (${marks})`, ...runIds)?.n ?? 0;
  const snapshots = d.db
    .all<{ a: string | null; b: string | null }>(`SELECT snapshot_start_id AS a, snapshot_end_id AS b FROM runs WHERE id IN (${marks})`, ...runIds)
    .flatMap((r) => [r.a, r.b])
    .filter((x): x is string => x !== null);
  for (const id of runIds) await d.evidence.removeRun(projectId, id);
  d.db.transaction(() => {
    d.db.run(`DELETE FROM runs WHERE id IN (${marks}) AND project_id = ?`, ...runIds, projectId);
    for (const s of new Set(snapshots)) {
      const used =
        (d.db.get<{ n: number }>('SELECT count(*) AS n FROM runs WHERE snapshot_start_id = ? OR snapshot_end_id = ?', s, s)?.n ?? 0) +
        (d.db.get<{ n: number }>('SELECT count(*) AS n FROM rounds WHERE snapshot_id = ?', s)?.n ?? 0) +
        (d.db.get<{ n: number }>('SELECT count(*) AS n FROM reviews WHERE snapshot_id = ?', s)?.n ?? 0) +
        // DEV-7: a reference image's approval state (its later differences name the lines changed since).
        (d.db.get<{ n: number }>('SELECT count(*) AS n FROM baselines WHERE snapshot_id = ?', s)?.n ?? 0);
      if (!used) d.db.run('DELETE FROM snapshots WHERE id = ?', s);
    }
  });
  purgeLedger(d.db);
  const gc = await d.blobs.collect(d.db);
  return { deleted: runIds.length, freedBytes: evidenceBytes + gc.freedBytes };
}

/**
 * The process ledger keeps a row per launch (C-12 point 4); a settled row is needed only while its run exists. Rows
 * of runs that are gone, and settled rows of setup commands older than 30 days, are deleted (never a running row:
 * the boot's reap needs it).
 */
export function purgeLedger(db: Db, now: Date = new Date()): number {
  const old = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return db.run(
    "DELETE FROM process_ledger WHERE state <> 'running' AND ((run_id IS NOT NULL AND run_id NOT IN (SELECT id FROM runs)) OR (run_id IS NULL AND created_at < ?))",
    old,
  ).changes;
}

export async function applyRetention(d: RetentionDeps, projectId: string, keep: number): Promise<{ deleted: number; freedBytes: number }> {
  return deleteRuns(d, projectId, expiredRuns(d.db, projectId, keep));
}

/** Before a project leaves AYAR (FR-02): its evidence folder; the database rows follow by cascade, then the collector. */
export async function removeProjectData(d: RetentionDeps, projectId: string): Promise<void> {
  await d.evidence.removeProject(projectId);
}

/** The space a project's evidence and snapshot contents take (compressed, each content counted once). */
export function projectSpace(d: RetentionDeps, projectId: string): number {
  const blobs =
    d.db.get<{ n: number | null }>(
      'SELECT sum(b.compressed_size) AS n FROM snapshot_blobs b WHERE b.sha256 IN (SELECT r.sha256 FROM snapshot_refs r JOIN snapshots s ON s.id = r.snapshot_id WHERE s.project_id = ?)',
      projectId,
    )?.n ?? 0;
  return d.evidence.bytesOf(projectId) + blobs;
}
