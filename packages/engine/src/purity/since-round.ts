// 13.5 and D-31 (DEV-11): is the project's state still the one the latest complete round read? The same rule as
// continuing a round (9.12 point 4): no change outside the declared outputs between the round's snapshot and the
// run's. The results page and the overview mark the round «قديم» and ask for a full scan on «changed».
import type { EvidenceService } from '../evidence/service.ts';
import { diffManifests, underAny } from '../evidence/snapshot.ts';
import { latestSnapshot } from '../profile/service.ts';
import { latestProfile } from '../profile/store.ts';
import type { Db } from '../storage/db.ts';

export type SinceRound = 'same' | 'changed';

/** The state of a run against the latest complete round of its project; null when there is nothing to compare. */
export async function stateSinceRound(db: Db, evidence: EvidenceService, run: { project_id: string; snapshot_start_id: string | null }): Promise<SinceRound | null> {
  const round = db.get<{ id: string; snapshot_id: string | null }>(
    "SELECT r.id, r.snapshot_id FROM rounds r JOIN runs b ON b.id = r.base_run_id WHERE r.project_id = ? AND b.cancel_reason IS NULL ORDER BY coalesce(b.started_at, '') DESC LIMIT 1",
    run.project_id,
  );
  if (!round?.snapshot_id || !run.snapshot_start_id) return null;
  if (round.snapshot_id === run.snapshot_start_id) return 'same';
  const [a, b] = await Promise.all([evidence.snapshots.load(round.snapshot_id).catch(() => null), evidence.snapshots.load(run.snapshot_start_id).catch(() => null)]);
  if (!a || !b) return null;
  const raw = latestProfile(db, run.project_id)?.content.references.outputs;
  const outputs = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : typeof raw === 'string' ? [raw] : [];
  const declared = underAny([...outputs, ...(latestSnapshot(db, run.project_id)?.inventory.outputDirs.map((d) => d.path) ?? [])]);
  const d = diffManifests(a, b, { declared, tracked: null });
  return d.truncated || [...d.created, ...d.modified, ...d.deleted].some((p) => !declared(p)) ? 'changed' : 'same';
}
