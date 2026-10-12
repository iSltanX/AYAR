// C-22 in the engine (D-12, D-42, 10.3 «النزاهة», 11.4 rules 6 to 9): the four integrity checks of a run, outside the
// index, each able to keep the verdict away from «نقي»:
//
// - integ.guard runs at the start of every run that has a base — the last full round's snapshot, and the start
//   snapshot of the run each instance's previous comparable execution belongs to — and compares the project's state
//   with it (guard.ts). Its effects are attached to the checks they touch before those checks are judged (7.3 rule 8),
//   and all of them are the guard's own findings. A first round has no base: «اجتاز (لا أساس للمقارنة)», with the
//   markers that exist recorded as evidence. A base that existed and is gone is «يحتاج مراجعة» (C-22 «الأخطاء»).
// - integ.state compares the run's two snapshots (C-17): a source file changed outside the declared outputs is a
//   finding per file, and the check «يحتاج مراجعة»; the verdict then cannot be «نقي» (11.4 rule 8).
// - integ.reviews reads the project's recorded reviews and checks that the files of each one's scope are as they were
//   when it was recorded (11.4 rule 6); an expired review is a finding, and its check goes back to «يحتاج مراجعة».
// - integ.model-claims matches the open model claims (C-25) with this run's findings: a claim a local check proved
//   becomes a normal finding's source and the claim «proven»; what no check proved stays an open claim, a finding of
//   this check, and «يحتاج مراجعة» until the owner decides («حوّل إلى بطاقة» or «ليس مشكلة», 12.7).
//
// Nothing here changes the outcome of another check except by the guard's attached findings (7.3 rule 8) and the
// reviews' expiry (11.4 rule 6); a model claim never changes a result (D-41).
//
// G-DEV12-05 (DEV-13): the base of a new round is the last round's snapshot, which already holds every change the
// guard flagged in that round. So an effect nobody reviewed is carried forward: the effects of the project's last
// integ.guard execution come back as findings of this run while the marker they point at is still in the file (or
// the file is still gone or still changed) and no accept review on the touched check, recorded after the effect was
// first seen, still holds. A review that holds settles the effect; one that expired brings it back with the review.
import type { Catalog } from '@ayar/catalog';
import type { CheckOutcome, CheckSpec, FindingLocation, JsonValue, ParsedFinding, ParsedReport, PlanItem, Reason } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import type { WeighedFinding } from '../classifier/classify.ts';
import type { EvidenceService } from '../evidence/service.ts';
import type { InventoryGaps, Manifest, ManifestEntry } from '../evidence/snapshot.ts';
import type { Logger } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';
import { fingerprintOf, type JudgedFinding, type Judgement, type VerdictService } from '../verdict/service.ts';
import { bounded, guard, markersIn, type GuardFinding, type GuardMarker, type GuardResult } from './guard.ts';

export const INTEGRITY_RUNNERS = ['integrity-guard', 'state-snapshot', 'model-claims', 'reviews'] as const;
export const INTEGRITY_VERSION = '1.0.0';
/** At most this many findings per integrity check are kept as rows. */
const MAX_FINDINGS = 500;

export interface GuardContext {
  /** The snapshots compared against (the round's, the previous executions' runs'), or none for a first round. */
  baseSnapshotIds: string[];
  /** A base existed (a round or a previous execution) but its snapshot could not be loaded. */
  baseLost: boolean;
  result: GuardResult | null;
  /** The markers that exist now (the first round's inventory, 10.3). */
  markers: GuardMarker[];
  /** The guard's effects by the instance they touch (C-22 «الربط»). */
  byInstance: Map<string, GuardFinding[]>;
  /** Effects whose check is unknown: the round's summary («ما لا يُعرف فحصه»). */
  unattributed: GuardFinding[];
  /** How many of the effects were carried from the previous guard execution, unreviewed (G-DEV12-05). */
  carried: number;
  /** 11.4 rule 6: reviews on a check instance whose scope changed since: the instance goes back to «يحتاج مراجعة». */
  expiredReviews: Map<string, { reviewId: string; changed: string[] }>;
}

export interface IntegrityOptions {
  db: Db;
  catalog: Catalog;
  logger: Logger;
  evidence: EvidenceService;
  verdict: VerdictService;
  /** Reads a stored evidence file (the previous guard execution's integrity.json, G-DEV12-05). */
  readFile: (path: string) => Promise<Uint8Array>;
}

/** The anchor of an integrity finding: a text anchor, as jobs.ts hashes one (C-15). */
export const integrityAnchor = (value: string): string => createHash('sha256').update(`text\n${value}`).digest('hex');

/** A guard effect as a finding of the check it touches, or of integ.guard itself. */
export function guardAsFinding(f: GuardFinding): { finding: ParsedFinding; anchor: string } {
  const location: FindingLocation = { path: f.path, ...(f.line ? { line: f.line } : {}) };
  const value = `guard|${f.rule}|${f.path}|${f.line ?? ''}|${f.anchor}`;
  return {
    finding: { rule: f.rule, toolRule: null, severity: null, proof: null, level: null, origin: 'project', message: f.message.slice(0, 4000), location, anchor: { kind: 'text', value }, expected: f.before?.slice(0, 2000) ?? null, actual: f.after?.slice(0, 2000) ?? null },
    anchor: integrityAnchor(value),
  };
}

export class IntegrityService {
  readonly #o: IntegrityOptions;

  constructor(o: IntegrityOptions) {
    this.#o = o;
  }

  isIntegrity(item: { checkId: string; runner?: { kind: string; ids: readonly string[] } }): boolean {
    return item.checkId.startsWith('integ.') || (item.runner?.kind === 'internal' && item.runner.ids.some((id) => (INTEGRITY_RUNNERS as readonly string[]).includes(id))) === true;
  }

  /**
   * The guard, at the start of a run (9.12 point 2): the bases, the comparison, and the effects by instance. Never
   * throws for the run's sake: a failure is logged and read as a lost base.
   */
  async prepare(o: { projectId: string; runId: string; plan: { items: PlanItem[] }; startManifest: Manifest; declared: (p: string) => boolean }): Promise<GuardContext> {
    const { db, evidence } = this.#o;
    const ctx: GuardContext = { baseSnapshotIds: [], baseLost: false, result: null, markers: [], byInstance: new Map(), unattributed: [], expiredReviews: new Map(), carried: 0 };
    // 11.4 rule 6: the latest review of each check instance, against the files of its scope as they are now.
    const nowHashes = new Map(o.startManifest.files.map((f) => [f[0], f[5]]));
    const latestReviews = new Map<string, { id: string; scope_json: string; snapshot_id: string | null }>();
    for (const r of db.all<{ id: string; target_ref: string; scope_json: string; snapshot_id: string | null }>("SELECT id, target_ref, scope_json, snapshot_id FROM reviews WHERE project_id = ? AND target_type = 'check' ORDER BY created_at, rowid", o.projectId)) latestReviews.set(r.target_ref, { id: r.id, scope_json: r.scope_json, snapshot_id: r.snapshot_id });
    for (const [instance, r] of latestReviews) {
      const expired = await this.reviewExpired(r, nowHashes).catch(() => ({ expired: false, changed: [] as string[] }));
      if (expired.expired) ctx.expiredReviews.set(instance, { reviewId: r.id, changed: expired.changed });
    }
    const bases = new Set<string>();
    let hadBase = false;
    const round = db.get<{ snapshot_id: string | null }>('SELECT snapshot_id FROM rounds WHERE project_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1', o.projectId);
    if (round) {
      hadBase = true;
      if (round.snapshot_id) bases.add(round.snapshot_id);
    }
    // The run each instance's previous comparable execution belongs to (a targeted rerun after a fix, 9.12).
    for (const it of o.plan.items) {
      if (it.status !== 'run' && it.status !== 'shared' && it.status !== 'covered') continue;
      const prev = this.#o.verdict.previousComparable('', it.checkId, it.component, o.projectId);
      if (!prev) continue;
      hadBase = true;
      const snap = db.get<{ snapshot_start_id: string | null }>('SELECT r.snapshot_start_id FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE c.id = ?', prev)?.snapshot_start_id;
      if (snap) bases.add(snap);
    }
    ctx.baseSnapshotIds = [...bases];
    const read = (m: Manifest) => {
      const byPath = new Map<string, ManifestEntry>(m.files.map((f) => [f[0], f]));
      return async (path: string): Promise<string | null> => {
        const e = byPath.get(path);
        if (!e) return null;
        try {
          return await evidence.snapshots.content(e);
        } catch {
          return null;
        }
      };
    };
    const referencePaths = db.all<{ rel_path: string }>("SELECT rel_path FROM baselines WHERE project_id = ? AND status = 'active'", o.projectId).map((r) => r.rel_path);
    const currentText = read(o.startManifest);
    const firstSeenAt = db.get<{ started_at: string | null }>('SELECT started_at FROM runs WHERE id = ?', o.runId)?.started_at ?? new Date().toISOString();
    if (!bases.size) {
      // The first round: an inventory of the markers, nothing compared.
      if (hadBase) {
        ctx.baseLost = true;
        // The base is gone, but the unreviewed effects of the last guard execution are not (G-DEV12-05).
        const carried = await this.#carriedEffects({ projectId: o.projectId, runId: o.runId, startManifest: o.startManifest, currentText, seen: new Set() });
        if (carried.length) {
          ctx.carried = carried.length;
          ctx.result = { findings: carried, compared: 0, changed: [], deleted: [], truncated: false };
          this.#attribute(ctx, carried, o.plan.items);
        }
      } else {
        for (const f of o.startManifest.files) {
          if (f[6] !== 'text' || !f[7]) continue;
          if (!/\.(test|spec)\.[cm]?[jt]sx?$|test_[^/]*\.py$|_test\.py$|\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f[0])) continue;
          const text = await currentText(f[0]);
          if (text !== null) ctx.markers.push(...markersIn(f[0], text));
          if (ctx.markers.length > 2000) break;
        }
      }
      return ctx;
    }
    const seen = new Set<string>();
    const all: GuardFinding[] = [];
    let compared = 0;
    const changed = new Set<string>();
    const deleted = new Set<string>();
    let truncated = false;
    for (const id of bases) {
      let base: Manifest | null = null;
      try {
        base = await evidence.snapshots.load(id);
      } catch {
        base = null;
      }
      if (!base) {
        ctx.baseLost = true;
        continue;
      }
      try {
        const r = await guard({ base, current: o.startManifest, baseText: read(base), currentText, declared: o.declared, referencePaths, limit: MAX_FINDINGS });
        compared += r.compared;
        r.changed.forEach((p) => changed.add(p));
        r.deleted.forEach((p) => deleted.add(p));
        truncated ||= r.truncated;
        for (const f of r.findings) {
          const key = `${f.rule}|${f.path}|${f.line ?? ''}|${f.anchor}`;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(f);
        }
      } catch (e) {
        this.#o.logger.log('error', 'the integrity guard failed', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
        ctx.baseLost = true;
      }
    }
    for (const f of all) f.firstSeen ??= { runId: o.runId, at: firstSeenAt };
    // G-DEV12-05: the unreviewed effects of the previous guard execution, still in place, join this run's.
    const carried = await this.#carriedEffects({ projectId: o.projectId, runId: o.runId, startManifest: o.startManifest, currentText, seen });
    ctx.carried = carried.length;
    all.push(...carried);
    ctx.result = { findings: all, compared, changed: [...changed].sort(), deleted: [...deleted].sort(), truncated };
    this.#attribute(ctx, all, o.plan.items);
    return ctx;
  }

  /** The instance an effect touches: its check, in the component whose folder holds the path (the deepest). */
  #attribute(ctx: GuardContext, effects: readonly GuardFinding[], items: readonly PlanItem[]): void {
    const components = [...new Set(items.map((i) => i.component))].sort((a, b) => b.length - a.length);
    for (const f of effects) {
      if (!f.check) {
        ctx.unattributed.push(f);
        continue;
      }
      const comp = components.find((c) => c !== '.' && (f.path === c || f.path.startsWith(`${c}/`))) ?? '.';
      const instance = items.find((i) => i.checkId === f.check && i.component === comp)?.instance ?? items.find((i) => i.checkId === f.check)?.instance ?? `${f.check}@${comp}`;
      ctx.byInstance.set(instance, [...(ctx.byInstance.get(instance) ?? []), f]);
    }
  }

  /**
   * G-DEV12-05: the effects of the project's last finished integ.guard execution (its integrity.json evidence) that
   * are still unreviewed and still in place. Never throws: what cannot be read carries nothing (and is logged).
   */
  async #carriedEffects(o: { projectId: string; runId: string; startManifest: Manifest; currentText: (path: string) => Promise<string | null>; seen: Set<string> }): Promise<GuardFinding[]> {
    const { db, evidence } = this.#o;
    const prev = db.get<{ id: string; run_id: string; started_at: string | null }>(
      "SELECT c.id, c.run_id, r.started_at FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND c.check_id = 'integ.guard' AND c.state = 'finished' AND c.run_id <> ? ORDER BY c.finished_at DESC, c.rowid DESC LIMIT 1",
      o.projectId,
      o.runId,
    );
    if (!prev) return [];
    const ref = evidence.store.refsOf(prev.id).find((e) => e.kind === 'integrity');
    if (!ref) return [];
    let effects: GuardFinding[] = [];
    try {
      const parsed = JSON.parse(new TextDecoder().decode(await this.#o.readFile(evidence.store.absolute(ref.relPath)))) as { effects?: unknown };
      effects = Array.isArray(parsed.effects) ? (parsed.effects as GuardFinding[]).filter((f) => f && typeof f.rule === 'string' && typeof f.path === 'string' && typeof f.anchor === 'string') : [];
    } catch (e) {
      this.#o.logger.log('warn', 'the previous guard evidence could not be read; no effect carried', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      return [];
    }
    const nowHashes = new Map(o.startManifest.files.map((f) => [f[0], f[5]]));
    const present = new Set(o.startManifest.files.map((f) => f[0]));
    const out: GuardFinding[] = [];
    for (const f of effects) {
      const key = `${f.rule}|${f.path}|${f.line ?? ''}|${f.anchor}`;
      if (o.seen.has(key)) continue;
      const firstSeen = f.firstSeen ?? { runId: prev.run_id, at: prev.started_at ?? '' };
      // Still in place? A deleted file still gone; a changed or added file still there; a marker line still in the text.
      let stillThere: boolean;
      if (f.fileHash) stillThere = nowHashes.get(f.path) === f.fileHash;
      else if (f.anchor.startsWith('deleted ')) stillThere = !present.has(f.path);
      else if (f.anchor.startsWith('changed ') || f.anchor.startsWith('added ')) stillThere = present.has(f.path);
      else {
        const text = present.has(f.path) ? await o.currentText(f.path) : null;
        stillThere = text === null ? present.has(f.path) : text.split('\n').some((l) => bounded(l) === f.anchor);
      }
      if (!stillThere) continue;
      // Reviewed? The latest accept review on the touched check (or on integ.guard itself), recorded after the effect
      // was first seen, that still holds.
      if (f.check) {
        const rows = db.all<{ id: string; decision: string; scope_json: string; snapshot_id: string | null; target_ref: string }>(
          "SELECT id, decision, scope_json, snapshot_id, target_ref FROM reviews WHERE project_id = ? AND target_type = 'check' AND (target_ref = ? OR target_ref LIKE ? OR target_ref LIKE 'integ.guard@%') AND created_at >= ? ORDER BY created_at DESC, rowid DESC",
          o.projectId,
          f.check,
          `${f.check}@%`,
          firstSeen.at,
        );
        const latestByTarget = new Map<string, (typeof rows)[number]>();
        for (const r of rows) if (!latestByTarget.has(r.target_ref)) latestByTarget.set(r.target_ref, r);
        let settled = false;
        for (const r of latestByTarget.values()) {
          if (r.decision !== 'accept' && r.decision !== 'passed') continue;
          const expired = await this.reviewExpired(r, nowHashes).catch(() => ({ expired: true, changed: [] as string[] }));
          if (!expired.expired) settled = true;
        }
        if (settled) continue;
      }
      o.seen.add(key);
      out.push({ ...f, firstSeen });
    }
    return out;
  }

  /**
   * The guard's effects on one instance, as findings of that check with their anchors (7.3 rule 8), and an expired
   * review on it as a `review.expired` finding (11.4 rule 6: the check goes back to «يحتاج مراجعة»).
   */
  effectsOn(ctx: GuardContext | null, instance: string): { findings: ParsedFinding[]; anchors: string[] } {
    const list = ctx?.byInstance.get(instance) ?? [];
    const out = list.map(guardAsFinding);
    const expired = ctx?.expiredReviews.get(instance);
    if (expired) {
      const value = `review|${expired.reviewId}`;
      const path = expired.changed[0] ?? null;
      out.push({ finding: { rule: 'review.expired', toolRule: null, severity: null, proof: null, level: null, origin: 'project', message: `the recorded review no longer holds: ${expired.changed.length} file(s) of its scope changed`, location: path ? { path } : null, anchor: { kind: 'text', value }, expected: null, actual: expired.changed.slice(0, 10).join(', ') || null }, anchor: integrityAnchor(value) });
    }
    return { findings: out.map((x) => x.finding), anchors: out.map((x) => x.anchor) };
  }

  // ── the four checks at the end of the run ─────────────────────────────────────────────────────────────────

  /** A judgement for an integrity check: every finding «review» (suspected), the outcome given, no classifier. */
  judgement(spec: CheckSpec, projectId: string, pairs: readonly { finding: ParsedFinding; anchor: string }[], outcome: CheckOutcome, reason: Reason, info: Record<string, JsonValue> = {}): Judgement {
    const book = this.#o.catalog.rules;
    const prints = pairs.map((p) => fingerprintOf(spec.checkId, p.finding, p.anchor));
    const excluded = this.#o.verdict.falseAlarms(projectId, prints);
    const findings: JudgedFinding[] = pairs.map((p, i) => {
      const def = book.rule(p.finding.rule);
      const isExcluded = excluded.has(prints[i]!);
      const f: WeighedFinding = { ...p.finding, severity: p.finding.severity ?? def?.severity ?? 'medium', proof: 'suspected', effect: isExcluded ? 'excluded' : 'review' };
      return { finding: f, origin: f.origin ?? 'project', fingerprint: prints[i]!, ruleVersion: def?.version ?? book.version, reviewId: excluded.get(prints[i]!) ?? null };
    });
    const live = findings.filter((f) => f.finding.effect !== 'excluded').length;
    const counts = { violations: 0, warnings: 0, review: live, notes: 0, excludedByReview: findings.length - live };
    // An integrity check whose every effect a review excluded as a false alarm passes (D-35).
    const finalOutcome: CheckOutcome = outcome === 'needs_review' && live === 0 ? 'passed' : outcome;
    const finalReason: Reason = finalOutcome !== outcome ? { key: 'integrity.reason.allExcluded', params: { count: findings.length } } : reason;
    const report: ParsedReport = { reader: 'integrity', readerVersion: INTEGRITY_VERSION, formats: [], tests: null, findings: pairs.map((p) => p.finding), findingsDropped: 0, signals: { noInputs: false, collectionError: false, configError: false, flaky: false, unresolved: 0 }, problems: [], info: { ...info, check: spec.checkId } };
    return { outcome: finalOutcome, reason: finalReason, origin: null, counts, findings, report };
  }

  /** integ.guard at the end: all effects, or the first round's inventory. */
  guardJudgement(spec: CheckSpec, projectId: string, ctx: GuardContext): { judgement: Judgement; evidence: Record<string, unknown> } {
    const pairs = (ctx.result?.findings ?? []).map(guardAsFinding);
    const evidence = { bases: ctx.baseSnapshotIds, baseLost: ctx.baseLost, compared: ctx.result?.compared ?? 0, changed: ctx.result?.changed ?? [], deleted: ctx.result?.deleted ?? [], truncated: ctx.result?.truncated ?? false, markers: ctx.markers, carried: ctx.carried, effects: ctx.result?.findings ?? [] };
    if (!ctx.baseSnapshotIds.length) {
      if (ctx.baseLost) return { judgement: this.judgement(spec, projectId, pairs, 'needs_review', { key: 'integrity.reason.guardBaseLost' }, { bases: 0, carried: ctx.carried }), evidence };
      return { judgement: this.judgement(spec, projectId, [], 'passed', { key: 'integrity.reason.guardNoBaseline', params: { markers: ctx.markers.length } }, { bases: 0, markers: ctx.markers.length }), evidence };
    }
    const n = pairs.length;
    if (ctx.baseLost && !n) return { judgement: this.judgement(spec, projectId, [], 'needs_review', { key: 'integrity.reason.guardBaseLost' }, { bases: ctx.baseSnapshotIds.length }), evidence };
    const outcome: CheckOutcome = n ? 'needs_review' : 'passed';
    const reason: Reason = n ? { key: 'integrity.reason.guardFindings', params: { count: n, files: ctx.result?.changed.length ?? 0 } } : { key: 'integrity.reason.guardClean', params: { files: ctx.result?.changed.length ?? 0 } };
    // The check each effect touches (C-22 «الربط»), for the page, even when that check did not run this time (DEV-12).
    const links = (ctx.result?.findings ?? []).slice(0, MAX_FINDINGS).map((f) => ({ rule: f.rule, path: f.path, line: f.line ?? null, check: f.check }));
    return { judgement: this.judgement(spec, projectId, pairs, outcome, reason, { bases: ctx.baseSnapshotIds.length, compared: ctx.result?.compared ?? 0, carried: ctx.carried, links }), evidence };
  }

  /**
   * integ.state at the end (9.9, 11.4 rule 8): the files that changed outside the declared outputs. Inventories with
   * gaps (AUD-04: past the depth or entry limit, unreadable) show no stability where they did not look: with no change
   * seen, the check is «تعذّر», naming what was not observed — never «اجتاز» — and a change seen is reported all the same.
   */
  stateJudgement(spec: CheckSpec, projectId: string, changed: readonly string[], gaps: InventoryGaps | null = null): Judgement {
    const pairs = changed.slice(0, MAX_FINDINGS).map((path) => {
      const value = `state|${path}`;
      const finding: ParsedFinding = { rule: 'state.changed', toolRule: null, severity: null, proof: null, level: null, origin: 'project', message: `changed during the run: ${path}`, location: { path }, anchor: { kind: 'text', value }, expected: null, actual: null };
      return { finding, anchor: integrityAnchor(value) };
    });
    const unobserved: Record<string, JsonValue> = gaps ? { gapDepth: gaps.depth, gapUnreadable: gaps.unreadable, gapTruncated: gaps.truncated } : {};
    if (changed.length) return this.judgement(spec, projectId, pairs, 'needs_review', { key: 'integrity.reason.stateChanged', params: { count: changed.length } }, { changed: changed.length, ...unobserved });
    if (gaps) return this.judgement(spec, projectId, [], 'unavailable', { key: 'integrity.reason.stateUnverified', params: { depth: gaps.depth, unreadable: gaps.unreadable, truncated: gaps.truncated ? 'yes' : 'no' } }, { changed: 0, ...unobserved });
    return this.judgement(spec, projectId, [], 'passed', { key: 'integrity.reason.stateStable' }, { changed: 0 });
  }

  /** integ.reviews at the end (11.4 rule 6): each recorded review against the files of its scope now. */
  async reviewsJudgement(spec: CheckSpec, projectId: string, current: Manifest): Promise<Judgement> {
    const rows = this.#o.db.all<{ id: string; target_type: string; target_ref: string; decision: string; scope_json: string; snapshot_id: string | null; created_at: string }>('SELECT id, target_type, target_ref, decision, scope_json, snapshot_id, created_at FROM reviews WHERE project_id = ? ORDER BY created_at, rowid', projectId);
    if (!rows.length) return this.judgement(spec, projectId, [], 'not_applicable', { key: 'integrity.reason.noReviews' });
    const now = new Map(current.files.map((f) => [f[0], f[5]]));
    const pairs: { finding: ParsedFinding; anchor: string }[] = [];
    let valid = 0;
    for (const r of rows) {
      const expired = await this.reviewExpired(r, now);
      if (!expired.expired) {
        valid++;
        continue;
      }
      const value = `review|${r.id}`;
      const path = expired.changed[0] ?? null;
      pairs.push({
        finding: { rule: 'review.expired', toolRule: null, severity: null, proof: null, level: null, origin: 'project', message: `review ${r.decision} on ${r.target_type} ${r.target_ref} no longer holds: ${expired.changed.length} file(s) of its scope changed`, location: path ? { path } : null, anchor: { kind: 'text', value }, expected: null, actual: expired.changed.slice(0, 10).join(', ') || null },
        anchor: integrityAnchor(value),
      });
    }
    return pairs.length
      ? this.judgement(spec, projectId, pairs, 'needs_review', { key: 'integrity.reason.reviewsExpired', params: { count: pairs.length, total: rows.length } }, { reviews: rows.length, expired: pairs.length })
      : this.judgement(spec, projectId, [], 'passed', { key: 'integrity.reason.reviewsValid', params: { count: valid } }, { reviews: rows.length, expired: 0 });
  }

  /** Whether a review still holds: every file of its scope has the hash it had when the review was recorded. */
  async reviewExpired(r: { scope_json: string; snapshot_id: string | null }, now: ReadonlyMap<string, string>): Promise<{ expired: boolean; changed: string[] }> {
    let files: string[] = [];
    try {
      const scoped = (JSON.parse(r.scope_json) as { files?: unknown }).files;
      files = Array.isArray(scoped) ? scoped.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      files = [];
    }
    if (!files.length) return { expired: false, changed: [] };
    const then = r.snapshot_id ? await this.#o.evidence.snapshots.load(r.snapshot_id).catch(() => null) : null;
    if (!then) return { expired: true, changed: files.slice(0, 50) };
    const before = new Map(then.files.map((f) => [f[0], f[5]]));
    const changed = files.filter((f) => before.get(f) !== now.get(f));
    return { expired: changed.length > 0, changed };
  }

  /**
   * integ.model-claims at the end (12.9, C-25 point 4): the open claims against this run's findings. A claim a
   * finding of its check (or any check) sits at — the same path, and the same line within three when both have one
   * — is proven by it: the claim turns `proven`, the finding names the claim as its source. The rest stay open and
   * become this check's findings.
   */
  claimsJudgement(spec: CheckSpec, projectId: string, runId: string): Judgement {
    const { db } = this.#o;
    const claims = db.all<{ id: string; display_id: string; location_json: string | null; kind: string | null; matched_check_id: string | null; match_status: string | null; summary_redacted: string | null; severity_suggested: string | null }>(
      "SELECT m.id, m.display_id, m.location_json, m.kind, m.matched_check_id, m.match_status, m.summary_redacted, m.severity_suggested FROM model_claims m JOIN ai_checks a ON a.id = m.ai_check_id WHERE a.project_id = ? AND coalesce(m.match_status, 'open') IN ('open', 'proven') ORDER BY m.display_id",
      projectId,
    );
    if (!claims.length) return this.judgement(spec, projectId, [], 'not_applicable', { key: 'integrity.reason.noClaims' });
    const findings = db.all<{ id: string; check_id: string; location_json: string | null; effect: string | null }>("SELECT f.id, f.check_id, f.location_json, f.effect FROM findings f JOIN check_runs c ON c.id = f.check_run_id WHERE c.run_id = ? AND f.check_id NOT LIKE 'integ.%' AND coalesce(f.effect, '') <> 'excluded'", runId);
    const parsed = findings.map((f) => ({ ...f, loc: f.location_json ? (JSON.parse(f.location_json) as FindingLocation) : null }));
    // The same file, or the test file of the unit (`src/money.js` ↔ `test/money.test.js`): the stems match.
    const stem = (p: string) => p.split('/').pop()!.replace(/\.(test|spec)(?=\.)/, '').replace(/^test_/, '').replace(/_test(?=\.py$)/, '').replace(/\.[^.]+$/, '');
    const samePlace = (a: string, b: string) => a === b || stem(a) === stem(b);
    const pairs: { finding: ParsedFinding; anchor: string }[] = [];
    let proven = 0;
    for (const c of claims) {
      const loc = c.location_json ? (JSON.parse(c.location_json) as FindingLocation) : null;
      const near = (f: (typeof parsed)[number]) => loc?.path !== undefined && loc.path !== null && f.loc?.path !== undefined && f.loc.path !== null && (f.loc.path === loc.path ? loc.line === undefined || f.loc.line === undefined || Math.abs((f.loc.line ?? 0) - loc.line) <= 3 : samePlace(f.loc.path, loc.path));
      const match = loc?.path ? (parsed.find((f) => near(f) && (!c.matched_check_id || f.check_id === c.matched_check_id)) ?? parsed.find(near) ?? null) : null;
      if (match) {
        proven++;
        if (c.match_status !== 'proven') db.run("UPDATE model_claims SET match_status = 'proven', proven_finding_id = ?, matched_check_id = coalesce(matched_check_id, ?) WHERE id = ?", match.id, match.check_id, c.id);
        else db.run('UPDATE model_claims SET proven_finding_id = ? WHERE id = ?', match.id, c.id);
        db.run('UPDATE findings SET from_claim_id = ? WHERE id = ?', c.id, match.id);
        continue;
      }
      if (c.match_status === 'proven') {
        // Proven before, and the finding is gone now: the claim is settled by the fix the finding's disappearance proves.
        continue;
      }
      const value = `claim|${c.display_id}`;
      pairs.push({
        finding: { rule: 'claim.unproven', toolRule: null, severity: null, proof: null, level: null, origin: 'model', message: `${c.display_id}: ${(c.summary_redacted ?? '').slice(0, 500)}`, location: loc, anchor: { kind: 'text', value }, expected: null, actual: null },
        anchor: integrityAnchor(value),
      });
    }
    return pairs.length
      ? this.judgement(spec, projectId, pairs, 'needs_review', { key: 'integrity.reason.claimsOpen', params: { count: pairs.length, proven } }, { claims: claims.length, open: pairs.length, proven })
      : this.judgement(spec, projectId, [], 'passed', { key: 'integrity.reason.claimsSettled', params: { proven } }, { claims: claims.length, open: 0, proven });
  }
}
