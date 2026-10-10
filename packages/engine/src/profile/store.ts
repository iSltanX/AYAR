// C-09 points 2 to 5 on C-17's tables: profile versions (profiles: a version number that grows with every
// change, a content hash, the source — proposed, edited or imported — and the history), approval records per
// check instance (approvals: the approved specHash, when, the profile version, a note), and the change set: what
// is new or changed since its approval, field by field (D-08, FR-11). Only a changed specHash asks for approval.
import { canonicalJson } from '@ayar/catalog';
import type { ChangeItem, ChangeSet, CheckSpec, JsonValue } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import type { Db } from '../storage/db.ts';
import { needsApproval, type ProfileSettings } from './propose.ts';

export interface ProfileContent extends ProfileSettings {
  /** The discovery snapshot the effective specs were computed from. */
  snapshotId: string | null;
  checks: CheckSpec[];
}

export interface ProfileRow {
  id: string;
  projectId: string;
  version: number;
  content: ProfileContent;
  contentHash: string;
  source: 'proposed' | 'edited' | 'imported';
  createdAt: string;
}

export interface ApprovalRow {
  instance: string;
  specHash: string;
  profileVersion: number;
  approvedAt: string;
  note: string | null;
}

interface DbProfile {
  id: string;
  project_id: string;
  version: number;
  content_json: string;
  content_hash: string;
  source: ProfileRow['source'];
  created_at: string;
}

const toRow = (r: DbProfile): ProfileRow => ({
  id: r.id,
  projectId: r.project_id,
  version: r.version,
  content: JSON.parse(r.content_json) as ProfileContent,
  contentHash: r.content_hash,
  source: r.source,
  createdAt: r.created_at,
});

/**
 * The hash of what the profile says — settings and effective specs — without the snapshot it was computed from:
 * a new discovery that changes nothing does not make a new version (C-09 point 5: the version rises with a change).
 */
export function contentHash(content: ProfileContent): string {
  const { snapshotId: _snapshot, ...rest } = content;
  return createHash('sha256').update(canonicalJson(rest)).digest('hex');
}

export function latestProfile(db: Db, projectId: string): ProfileRow | null {
  const r = db.get<DbProfile>('SELECT * FROM profiles WHERE project_id = ? ORDER BY version DESC LIMIT 1', projectId);
  return r ? toRow(r) : null;
}

export function profileAt(db: Db, projectId: string, version: number): ProfileRow | null {
  const r = db.get<DbProfile>('SELECT * FROM profiles WHERE project_id = ? AND version = ?', projectId, version);
  return r ? toRow(r) : null;
}

/** Saves a new version, unless the content is the same as the latest version's (then nothing is written). */
export function saveProfile(db: Db, o: { id: string; projectId: string; content: ProfileContent; source: ProfileRow['source']; now: Date }): { row: ProfileRow; created: boolean } {
  const hash = contentHash(o.content);
  const latest = latestProfile(db, o.projectId);
  if (latest && latest.contentHash === hash) return { row: latest, created: false };
  const version = (latest?.version ?? 0) + 1;
  const createdAt = o.now.toISOString();
  db.run(
    'INSERT INTO profiles (id, project_id, version, content_json, content_hash, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    o.id,
    o.projectId,
    version,
    JSON.stringify(o.content),
    hash,
    o.source,
    createdAt,
  );
  return { row: { id: o.id, projectId: o.projectId, version, content: o.content, contentHash: hash, source: o.source, createdAt }, created: true };
}

export function approvalsOf(db: Db, projectId: string): Map<string, ApprovalRow> {
  const rows = db.all<{ check_id: string; component: string; spec_hash: string; profile_version: number; approved_at: string; note: string | null }>(
    'SELECT check_id, component, spec_hash, profile_version, approved_at, note FROM approvals WHERE project_id = ?',
    projectId,
  );
  return new Map(rows.map((r) => [`${r.check_id}@${r.component}`, { instance: `${r.check_id}@${r.component}`, specHash: r.spec_hash, profileVersion: r.profile_version, approvedAt: r.approved_at, note: r.note }]));
}

/** The fields compared for the per-check difference (C-09 point 4): what the specHash is made of. */
const DIFF_FIELDS: [string, (s: CheckSpec) => unknown][] = [
  ['command.argv', (s) => s.command?.argv ?? null],
  ['command.cwd', (s) => s.command?.cwd ?? null],
  ['command.script.text', (s) => s.command?.script?.text ?? null],
  ['command.script.pre', (s) => s.command?.script?.pre ?? null],
  ['command.script.post', (s) => s.command?.script?.post ?? null],
  ['tool', (s) => s.tool],
  ['env.explicit', (s) => s.env.explicit],
  ['env.allowSensitive', (s) => s.env.allowSensitive],
  ['referenceValues', (s) => s.referenceValues],
  ['customSuccess', (s) => s.customSuccess],
  ['timeoutMin', (s) => s.timeoutMin],
  ['thresholds', (s) => s.thresholds],
  ['sideEffects', (s) => s.sideEffects],
  ['network', (s) => s.network],
  ['runner', (s) => s.runner],
  ['checkVersion', (s) => s.checkVersion],
];

export function diffFields(before: CheckSpec | null, after: CheckSpec | null): ChangeItem['fields'] {
  const out: ChangeItem['fields'] = [];
  for (const [field, get] of DIFF_FIELDS) {
    const b = before ? get(before) : null;
    const a = after ? get(after) : null;
    if (canonicalJson(b) !== canonicalJson(a)) out.push({ field, before: (b ?? null) as JsonValue | null, after: (a ?? null) as JsonValue | null });
  }
  return out;
}

/**
 * The change set (FR-11): every instance that may run and whose specHash has no matching approval — added (never
 * approved) or changed (with the fields that changed, against the approved version's spec) — plus refused
 * commands (shown, never approvable) and approved instances that no longer run (removed, informational).
 */
export function changeSet(db: Db, projectId: string, specs: readonly CheckSpec[]): ChangeSet {
  const approvals = approvalsOf(db, projectId);
  const versions = new Map<number, ProfileRow | null>();
  const approvedSpec = (a: ApprovalRow): CheckSpec | null => {
    if (!versions.has(a.profileVersion)) versions.set(a.profileVersion, profileAt(db, projectId, a.profileVersion));
    return versions.get(a.profileVersion)?.content.checks.find((c) => c.instance === a.instance) ?? null;
  };
  const items: ChangeItem[] = [];
  const running = new Set<string>();
  for (const s of specs) {
    if (s.applicable && s.enabled && s.included && s.refused.length) {
      items.push({ instance: s.instance, change: approvals.has(s.instance) ? 'changed' : 'added', fields: diffFields(null, s), danger: s.danger, refused: s.refused, approveAlone: false, approvable: false, specHash: s.specHash });
      continue;
    }
    if (!needsApproval(s)) continue;
    running.add(s.instance);
    const a = approvals.get(s.instance);
    if (a && a.specHash === s.specHash) continue;
    const before = a ? approvedSpec(a) : null;
    items.push({
      instance: s.instance,
      change: a ? 'changed' : 'added',
      fields: diffFields(before, s),
      danger: s.danger,
      refused: [],
      approveAlone: s.danger.length > 0,
      approvable: true,
      specHash: s.specHash,
    });
  }
  for (const [instance, a] of approvals) {
    if (running.has(instance) || specs.some((s) => s.instance === instance && s.refused.length)) continue;
    items.push({ instance, change: 'removed', fields: diffFields(approvedSpec(a), null), danger: [], refused: [], approveAlone: false, approvable: false, specHash: null });
  }
  items.sort((x, y) => (x.instance < y.instance ? -1 : x.instance > y.instance ? 1 : 0));
  const id = `cs_${createHash('sha256').update(canonicalJson(items.map((i) => [i.instance, i.change, i.specHash]))).digest('hex').slice(0, 40)}`;
  return { id, items };
}

export function writeApprovals(db: Db, o: { projectId: string; items: readonly { instance: string; specHash: string }[]; profileVersion: number; now: Date; note: string | null; newId: () => string }): void {
  for (const it of o.items) {
    const at = it.instance.lastIndexOf('@');
    const checkId = it.instance.slice(0, at);
    const component = it.instance.slice(at + 1);
    db.run(
      `INSERT INTO approvals (id, project_id, check_id, component, spec_hash, profile_version, approved_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, check_id, component) DO UPDATE SET spec_hash = excluded.spec_hash, profile_version = excluded.profile_version, approved_at = excluded.approved_at, note = excluded.note`,
      o.newId(),
      o.projectId,
      checkId,
      component,
      it.specHash,
      o.profileVersion,
      o.now.toISOString(),
      o.note,
    );
  }
}

/** An import asks for every command to be approved again (C-09 point 6). */
export function clearApprovals(db: Db, projectId: string): number {
  return db.run('DELETE FROM approvals WHERE project_id = ?', projectId).changes;
}
