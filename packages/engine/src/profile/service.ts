// C-09: the profile service — proposal from the latest snapshot, versions, edits with validation, approval of a
// change set (a dangerous command alone, a refused one never), the «مشروع غير موثوق» flag (G-20), export after
// a preview of the differences, and import (which asks for every command to be approved again).
import type { Catalog } from '@ayar/catalog';
import { canonicalJson } from '@ayar/catalog';
import {
  ExportedProfile,
  type CheckOverride,
  type CheckSpec,
  type DiscoverySnapshot,
  type ExportPreview,
  type ProfilePatch,
  type ProfileView,
} from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts } from '../ports/index.ts';
import { classifyEnvName } from '../redaction/names.ts';
import type { RedactionService } from '../redaction/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import { hmacHex, type HmacKey } from '../storage/hmac-key.ts';
import { lineDiff } from './diff.ts';
import { argvText, compilePolicy, judgeCommand } from './policy.ts';
import { emptySettings, proposeChecks, type ProfileSettings } from './propose.ts';
import { approvalsOf, changeSet, clearApprovals, latestProfile, saveProfile, writeApprovals, type ProfileContent, type ProfileRow } from './store.ts';

const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
const MAX_PROFILE_DEPTH = 64;

/** The nesting depth of a JSON value, iteratively (no recursion to exhaust). */
export function jsonDepth(value: unknown): number {
  let max = 0;
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    max = Math.max(max, d);
    if (max > 1000) return max;
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) stack.push([x, d + 1]);
  }
  return max;
}

export interface ProfileServiceOptions {
  db: Db;
  catalog: Catalog;
  hmacKey: HmacKey;
  ports: EnginePorts;
  redaction: RedactionService;
}

const invalid = (rule: string, details: Record<string, string> = {}) => new CommandError('profile_invalid', { rule, ...details });

export function loadSnapshot(db: Db, snapshotId: string): DiscoverySnapshot | null {
  const r = db.get<{ id: string; project_id: string; created_at: string; scanner_version: string; partial: number; facts_json: string; inventory_json: string; warnings_json: string; spec_fingerprints_json: string }>(
    'SELECT * FROM discovery_snapshots WHERE id = ?',
    snapshotId,
  );
  if (!r) return null;
  const facts = JSON.parse(r.facts_json) as Pick<DiscoverySnapshot, 'components' | 'facts' | 'redactions'>;
  const warnings = JSON.parse(r.warnings_json) as Pick<DiscoverySnapshot, 'warnings' | 'partialReasons' | 'durationMs'>;
  return {
    id: r.id,
    projectId: r.project_id,
    createdAt: r.created_at,
    scannerVersion: r.scanner_version,
    durationMs: warnings.durationMs,
    partial: r.partial === 1,
    partialReasons: warnings.partialReasons,
    components: facts.components,
    facts: facts.facts,
    inventory: JSON.parse(r.inventory_json) as DiscoverySnapshot['inventory'],
    warnings: warnings.warnings,
    specFingerprints: JSON.parse(r.spec_fingerprints_json) as Record<string, string>,
    redactions: facts.redactions,
  };
}

export function latestSnapshot(db: Db, projectId: string): DiscoverySnapshot | null {
  const r = db.get<{ id: string }>('SELECT id FROM discovery_snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId);
  return r ? loadSnapshot(db, r.id) : null;
}

export class ProfileService {
  readonly #o: ProfileServiceOptions;

  constructor(o: ProfileServiceOptions) {
    this.#o = o;
  }

  hash = (canonical: string): string => hmacHex(this.#o.hmacKey, canonical);

  settingsOf(projectId: string): ProfileSettings {
    const latest = latestProfile(this.#o.db, projectId);
    if (!latest) return emptySettings();
    const { context, references, overrides, custom, untrusted } = latest.content;
    return { schema: 'ayar-profile/1', context, references, overrides, custom, untrusted };
  }

  /** The effective specs for a snapshot and settings (C-09 point 1). */
  specs(snapshot: DiscoverySnapshot, settings: ProfileSettings): CheckSpec[] {
    const reviews = (this.#o.db.get<{ n: number }>('SELECT count(*) AS n FROM reviews WHERE project_id = ?', snapshot.projectId)?.n ?? 0) > 0;
    return proposeChecks({ catalog: this.#o.catalog, components: snapshot.components, facts: snapshot.facts, settings, state: { reviews }, hash: this.hash });
  }

  /** Recomputes the profile from a snapshot and saves a version when it changed (C-09 point 5). */
  regenerate(projectId: string, snapshot: DiscoverySnapshot, source: ProfileRow['source'], settings = this.settingsOf(projectId)): { row: ProfileRow; specs: CheckSpec[] } {
    const specs = this.specs(snapshot, settings);
    const content: ProfileContent = { ...settings, snapshotId: snapshot.id, checks: specs };
    const { row } = saveProfile(this.#o.db, { id: newId(this.#o.ports.random, 'prf'), projectId, content, source, now: this.#o.ports.clock.now() });
    return { row, specs };
  }

  #snapshotOrThrow(projectId: string): DiscoverySnapshot {
    const s = latestSnapshot(this.#o.db, projectId);
    if (!s) throw new CommandError('not_found', { reason: 'no_snapshot' });
    return s;
  }

  view(projectId: string): ProfileView {
    let row = latestProfile(this.#o.db, projectId);
    if (!row) row = this.regenerate(projectId, this.#snapshotOrThrow(projectId), 'proposed').row;
    const c = row.content;
    return {
      projectId,
      version: row.version,
      contentHash: row.contentHash,
      source: row.source,
      createdAt: row.createdAt,
      snapshotId: c.snapshotId,
      untrusted: c.untrusted,
      context: c.context,
      references: c.references,
      custom: c.custom,
      checks: c.checks,
      pending: changeSet(this.#o.db, projectId, c.checks),
      approvals: [...approvalsOf(this.#o.db, projectId).values()].map((a) => ({ instance: a.instance, specHash: a.specHash, approvedAt: a.approvedAt, profileVersion: a.profileVersion })).sort((a, b) => (a.instance < b.instance ? -1 : 1)),
    };
  }

  propose(projectId: string): ProfileView {
    this.regenerate(projectId, this.#snapshotOrThrow(projectId), 'proposed');
    return this.view(projectId);
  }

  /** C-09 point 7: schema (the protocol), the consistency rule, sudo refused, no secret in a profile. */
  validate(settings: ProfileSettings, specs: readonly CheckSpec[]): void {
    const policy = compilePolicy(this.#o.catalog.commandPolicy);
    const names = this.#o.redaction.names();
    const known = new Set(this.#o.catalog.checks.map((c) => c.id));
    for (const [instance, o] of Object.entries(settings.overrides)) {
      const checkId = instance.slice(0, instance.indexOf('@'));
      if (!known.has(checkId) && !(checkId.startsWith('custom.') && settings.custom[checkId.slice('custom.'.length)])) throw invalid('unknown_check', { instance });
      if (o.argv && judgeCommand(policy, [argvText(o.argv)]).refused.length) throw invalid('sudo', { instance });
      for (const name of Object.keys(o.explicitEnv ?? {})) if (classifyEnvName(name, names) === 'sensitive') throw invalid('explicit_sensitive', { instance, name });
      if (o.enabled === false && o.required === true) throw invalid('consistency', { instance });
      const spec = specs.find((s) => s.instance === instance);
      if (o.included === false && (o.required === true || (o.required === undefined && spec?.required === true && o.enabled !== false))) throw invalid('consistency', { instance });
    }
    for (const [name, c] of Object.entries(settings.custom)) {
      if (judgeCommand(policy, [argvText(c.argv)]).refused.length) throw invalid('sudo', { instance: `custom.${name}@.` });
    }
    // Nothing is saved before C-18: a profile that holds a secret (in a command, a variable, a reference) is
    // refused rather than stored; a secret reaches a check only as an allowed variable, by name (D-47).
    const second = this.#o.redaction.redactor().secondPass(JSON.stringify({ context: settings.context, references: settings.references, overrides: settings.overrides, custom: settings.custom }));
    if (!second.ok) throw invalid('secret_in_profile', { rules: second.rules.join(',') });
  }

  update(projectId: string, patch: ProfilePatch): ProfileView {
    const snapshot = this.#snapshotOrThrow(projectId);
    const s = this.settingsOf(projectId);
    const next: ProfileSettings = {
      ...s,
      context: { ...s.context, ...patch.context },
      references: { ...s.references },
      overrides: { ...s.overrides },
      custom: { ...s.custom },
    };
    for (const [k, v] of Object.entries(patch.references ?? {})) {
      if (v === null) delete next.references[k as keyof typeof next.references];
      else next.references[k as keyof typeof next.references] = v;
    }
    for (const [instance, o] of Object.entries(patch.checks ?? {})) {
      if (o === null) delete next.overrides[instance];
      else next.overrides[instance] = Object.fromEntries(Object.entries({ ...next.overrides[instance], ...o }).filter(([, v]) => v !== undefined));
    }
    for (const [name, c] of Object.entries(patch.custom ?? {})) {
      if (c === null) delete next.custom[name];
      else next.custom[name] = c;
    }
    this.validate(next, this.specs(snapshot, { ...next, overrides: {} }));
    this.#o.db.transaction(() => {
      this.regenerate(projectId, snapshot, 'edited', next);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'profile.updated', projectId, details: { context: Object.keys(patch.context ?? {}), checks: Object.keys(patch.checks ?? {}), custom: Object.keys(patch.custom ?? {}), references: Object.keys(patch.references ?? {}) } });
    });
    return this.view(projectId);
  }

  /** FR-11: approve the change set the user saw; a dangerous command alone, never in «اعتمد الكل» (FR-56). */
  approve(projectId: string, changeSetId: string, instances: readonly string[] | undefined, note: string | undefined): { approved: string[]; skipped: string[]; profile: ProfileView } {
    const row = latestProfile(this.#o.db, projectId);
    if (!row) throw new CommandError('not_found', { reason: 'no_profile' });
    const cs = changeSet(this.#o.db, projectId, row.content.checks);
    if (cs.id !== changeSetId) throw new CommandError('stale_change_set', { expected: cs.id });
    const approvable = cs.items.filter((i) => i.approvable);
    let targets: typeof approvable;
    let skipped: string[] = [];
    if (instances) {
      targets = [];
      for (const inst of instances) {
        const item = cs.items.find((i) => i.instance === inst);
        if (!item || !item.approvable) throw invalid(item?.refused.length ? 'sudo' : 'not_pending', { instance: inst });
        targets.push(item);
      }
      if (targets.length > 1 && targets.some((t) => t.approveAlone)) throw invalid('approve_alone', { instance: targets.find((t) => t.approveAlone)!.instance });
    } else {
      targets = approvable.filter((i) => !i.approveAlone);
      skipped = approvable.filter((i) => i.approveAlone).map((i) => i.instance);
    }
    this.#o.db.transaction(() => {
      writeApprovals(this.#o.db, { projectId, items: targets.map((t) => ({ instance: t.instance, specHash: t.specHash! })), profileVersion: row.version, now: this.#o.ports.clock.now(), note: note ?? null, newId: () => newId(this.#o.ports.random, 'apr') });
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'profile.approved', projectId, details: { profileVersion: row.version, instances: targets.map((t) => t.instance), dangerous: targets.filter((t) => t.approveAlone).map((t) => t.instance) } });
    });
    return { approved: targets.map((t) => t.instance), skipped, profile: this.view(projectId) };
  }

  /** FR-55 (G-20): the flag lives in the profile; the registry mirrors it for the project list. */
  setUntrusted(projectId: string, untrusted: boolean): void {
    const snapshot = latestSnapshot(this.#o.db, projectId);
    const s = { ...this.settingsOf(projectId), untrusted };
    this.#o.db.transaction(() => {
      if (snapshot) this.regenerate(projectId, snapshot, 'edited', s);
      this.#o.db.run('UPDATE projects SET trusted = ? WHERE id = ?', untrusted ? 0 : 1, projectId);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'project.trustChanged', projectId, details: { untrusted } });
    });
  }

  untrusted(projectId: string): boolean {
    const latest = latestProfile(this.#o.db, projectId);
    if (latest) return latest.content.untrusted;
    return this.#o.db.get<{ trusted: number }>('SELECT trusted FROM projects WHERE id = ?', projectId)?.trusted === 0;
  }

  /** The exported text of the current profile version: deterministic, no secrets, no local-only fields. */
  exportText(projectId: string): string {
    const row = latestProfile(this.#o.db, projectId);
    if (!row) throw new CommandError('not_found', { reason: 'no_profile' });
    const c = row.content;
    const checks: Record<string, Omit<CheckOverride, 'toolPath'>> = {};
    for (const s of c.checks.filter((x) => x.applicable && !x.instance.startsWith('custom.'))) {
      const o = c.overrides[s.instance] ?? {};
      checks[s.instance] = {
        enabled: s.enabled,
        required: s.required,
        blocking: s.blocking,
        included: s.included,
        ...(o.argv ? { argv: o.argv } : {}),
        ...(o.cwd ? { cwd: o.cwd } : {}),
        ...(o.timeoutMin ? { timeoutMin: o.timeoutMin } : {}),
        warningsPolicy: s.warningsPolicy,
        flakyPolicy: s.flakyPolicy,
        ...(s.thresholds ? { thresholds: s.thresholds } : {}),
        ...(s.env.allowSensitive.length ? { allowSensitive: s.env.allowSensitive } : {}),
        ...(Object.keys(s.env.explicit).length ? { explicitEnv: s.env.explicit } : {}),
      };
    }
    const exported: ExportedProfile = { schema: 'ayar-profile/1', savedAt: row.createdAt, catalogVersion: this.#o.catalog.version, profileVersion: row.version, context: c.context, references: c.references, checks, custom: c.custom };
    const text = `${JSON.stringify(JSON.parse(canonicalJson(exported)), null, 2)}\n`;
    // The second pass (C-18) before anything leaves AYAR: a high-confidence secret stops the export.
    const second = this.#o.redaction.redactor().secondPass(text);
    if (!second.ok) throw invalid('secret_in_export', { rules: second.rules.join(',') });
    return text;
  }

  exportPreview(projectId: string, existing: string | null): ExportPreview {
    const text = this.exportText(projectId);
    return { projectId, previewDigest: createHash('sha256').update(text).digest('hex'), text, existing: existing !== null, diff: lineDiff(existing ?? '', text) };
  }

  async exportTo(projectId: string, destination: string, previewDigest: string | undefined): Promise<{ written: true; bytes: number; digest: string }> {
    if (!previewDigest) throw new CommandError('preview_required');
    const text = this.exportText(projectId);
    const digest = createHash('sha256').update(text).digest('hex');
    if (digest !== previewDigest) throw new CommandError('stale_change_set', { reason: 'preview_changed' });
    const data = new TextEncoder().encode(text);
    await this.#o.ports.fs.writeFileAtomic(destination, data, 0o644);
    recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'profile.exported', projectId, details: { bytes: data.length, digest } });
    return { written: true, bytes: data.length, digest };
  }

  /** C-09 point 6: an imported profile replaces the user's choices, and every command needs approval again. */
  importText(projectId: string, text: string, from: 'file' | 'repository'): ProfileView {
    if (new TextEncoder().encode(text).length > MAX_PROFILE_BYTES) throw invalid('too_large');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw invalid('not_json');
    }
    // A file from a repository is hostile until proven otherwise: a nesting deep enough to exhaust the stack is
    // refused before any recursive step touches it (review M4).
    if (jsonDepth(raw) > MAX_PROFILE_DEPTH) throw invalid('too_deep');
    const parsed = ExportedProfile.safeParse(raw);
    if (!parsed.success) throw invalid('schema', { path: parsed.error.issues[0]?.path.join('.') ?? '' });
    const p = parsed.data;
    const snapshot = this.#snapshotOrThrow(projectId);
    const current = this.settingsOf(projectId);
    const next: ProfileSettings = { schema: 'ayar-profile/1', context: p.context, references: p.references, overrides: { ...p.checks }, custom: p.custom, untrusted: current.untrusted };
    this.validate(next, this.specs(snapshot, { ...next, overrides: {} }));
    this.#o.db.transaction(() => {
      this.regenerate(projectId, snapshot, 'imported', next);
      const cleared = clearApprovals(this.#o.db, projectId);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'profile.imported', projectId, details: { from, profileVersion: p.profileVersion, approvalsCleared: cleared } });
    });
    return this.view(projectId);
  }
}
