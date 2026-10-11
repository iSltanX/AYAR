// C-19 at the end of a run (9.10, 9.12 point 4, D-31). A full run makes a round (`ROUND-NNN`, counted per project):
// its members are the run's executions, and its index is computed over the profile the run used. A section run
// gets its section's karat, marked «جزئي», with no verdict word. A run that continues a round merges into it only
// when the project's state has not changed since the round's snapshot (outside the declared outputs), by one rule:
// the retry replaces an indecisive outcome; «اجتاز» against «أخفق» in either order, or a «متذبذب» before it, merges
// by the flaky policy («متذبذب» unless it says «أخفق»), both attempts kept; anything else keeps the earlier
// outcome. When the state changed, the continued run stays a targeted run and computes no index. Every other run
// computes none either (9.10: «والتشغيلات الأخرى لا تحسب عيارًا للمشروع»).
//
// The integrity inputs (11.4 rules 6 to 9) are the round's integ.* outcomes and its state; what DEV-9 adds (the
// guard's findings without a review, open model claims, expired reviews) comes in through the same interface.
import type { Catalog } from '@ayar/catalog';
import type { CheckOutcome, CheckSpec, IntegrityInputs, PurityMeta, PurityResult, PurityScope, PuritySummary, Reason } from '@ayar/protocol';
import { PurityResult as PuritySchema, RunPlan as PlanSchema } from '@ayar/protocol';
import { newId } from '../host/ids.ts';
import type { EvidenceService } from '../evidence/service.ts';
import { diffManifests } from '../evidence/snapshot.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { latestSnapshot } from '../profile/service.ts';
import { profileAt } from '../profile/store.ts';
import type { Db } from '../storage/db.ts';
import { computePurity, DEFAULT_NARROW_THRESHOLD, puritySummary, type PurityCheckInput } from './compute.ts';

/** The outcomes a retry may replace in a continued round (D-31: «غير حاسمة»). */
export const INDECISIVE: readonly CheckOutcome[] = ['missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped'];

/** D-31: the outcome a round keeps when a retry of the same instance comes in on the same state. */
export function mergeOutcome(before: CheckOutcome | null, retry: CheckOutcome | null, flakyPolicy: 'flaky' | 'fail'): { outcome: CheckOutcome | null; took: 'retry' | 'before' | 'merged' } {
  if (retry === null) return { outcome: before, took: 'before' };
  if (before === null || INDECISIVE.includes(before)) return { outcome: retry, took: 'retry' };
  const conflict = (before === 'passed' && retry === 'failed') || (before === 'failed' && retry === 'passed') || before === 'flaky';
  if (conflict) return { outcome: flakyPolicy === 'fail' ? 'failed' : 'flaky', took: 'merged' };
  return { outcome: before, took: 'before' };
}

interface RunRow {
  id: string;
  project_id: string;
  kind: string;
  plan_json: string;
  profile_version: number | null;
  profile_hash: string | null;
  catalog_version: string | null;
  snapshot_start_id: string | null;
  state_changed: number | null;
  round_id: string | null;
}

interface Member {
  instance: string;
  checkRunId: string | null;
  outcome: CheckOutcome | null;
  reviewed: boolean;
  attempts: string[];
}

export interface PurityServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger: Logger;
  evidence: EvidenceService;
}

export class PurityService {
  readonly #o: PurityServiceOptions;

  constructor(o: PurityServiceOptions) {
    this.#o = o;
  }

  /** 9.10: the index of a finished run, kept with it (and with its round). Null when the run computes none. */
  async afterRun(runId: string, declared: (path: string) => boolean): Promise<PurityResult | null> {
    const { db } = this.#o;
    const run = db.get<RunRow>('SELECT id, project_id, kind, plan_json, profile_version, profile_hash, catalog_version, snapshot_start_id, state_changed, round_id FROM runs WHERE id = ?', runId);
    if (!run) return null;
    const plan = PlanSchema.safeParse(JSON.parse(run.plan_json));
    if (!plan.success) return null;
    let result: PurityResult | null = null;
    if (run.kind === 'full') result = this.#newRound(run);
    else if (run.kind === 'continue_round' && plan.data.selection.kind === 'continueRound') result = await this.#continueRound(run, plan.data.selection.roundId, declared);
    // DEV-9 (9.12 point 4, AT-25): a rerun of a run that belongs to a round, on the round's unchanged state, completes
    // that round by the same rule; on a changed state it stays a targeted run and computes no index.
    else if (plan.data.selection.kind === 'rerun') {
      const roundId = db.get<{ round_id: string | null }>('SELECT round_id FROM runs WHERE id = ?', plan.data.selection.runId)?.round_id ?? null;
      if (roundId) result = await this.#continueRound(run, roundId, declared);
    }
    else if (run.kind === 'section' && plan.data.selection.kind === 'section') result = this.#compute(run, { kind: 'section', section: plan.data.selection.section }, this.#membersOfRun(run.id), run.state_changed === 1, run.snapshot_start_id);
    db.run('UPDATE runs SET purity_json = ?, verdict = ? WHERE id = ?', result ? JSON.stringify(result) : null, result?.verdict ?? null, runId);
    return result;
  }

  /**
   * DEV-9 (FR-34, G-17): after a review changed the outcome of an execution, the round it belongs to is computed again
   * from its members as they are now (the member's outcome and `reviewed` updated first by the caller). Returns the
   * new result, or null when the execution belongs to no round.
   */
  recomputeFor(checkRunId: string): PurityResult | null {
    const { db, ports } = this.#o;
    const rc = db.get<{ round_id: string }>('SELECT round_id FROM round_checks WHERE check_run_id = ?', checkRunId);
    if (!rc) return null;
    const round = db.get<{ id: string; project_id: string; base_run_id: string | null; snapshot_id: string | null }>('SELECT id, project_id, base_run_id, snapshot_id FROM rounds WHERE id = ?', rc.round_id);
    if (!round?.base_run_id) return null;
    const run = db.get<RunRow>('SELECT id, project_id, kind, plan_json, profile_version, profile_hash, catalog_version, snapshot_start_id, state_changed, round_id FROM runs WHERE id = ?', round.base_run_id);
    if (!run) return null;
    const members = new Map<string, Member>(
      db.all<{ instance: string; check_run_id: string | null; outcome: string | null; reviewed: number; attempts_json: string }>('SELECT instance, check_run_id, outcome, reviewed, attempts_json FROM round_checks WHERE round_id = ?', round.id).map((r) => [r.instance, { instance: r.instance, checkRunId: r.check_run_id, outcome: (r.outcome as CheckOutcome | null) ?? null, reviewed: r.reviewed === 1, attempts: JSON.parse(r.attempts_json) as string[] }]),
    );
    const previous = this.resultOf(run.id);
    const result = { ...this.#compute(run, { kind: 'round', roundId: round.id }, members, run.state_changed === 1, round.snapshot_id), notes: previous?.notes ?? [] };
    db.transaction(() => {
      db.run('UPDATE rounds SET verdict = ?, purity_json = ?, updated_at = ? WHERE id = ?', result.verdict, JSON.stringify(result), ports.clock.now().toISOString(), round.id);
      for (const id of db.all<{ id: string }>('SELECT id FROM runs WHERE round_id = ?', round.id)) db.run('UPDATE runs SET purity_json = ?, verdict = ? WHERE id = ?', JSON.stringify(result), result.verdict, id.id);
    });
    return result;
  }

  /** The index kept with a run (RunView, RunDetail). */
  resultOf(runId: string): PurityResult | null {
    const r = this.#o.db.get<{ purity_json: string | null }>('SELECT purity_json FROM runs WHERE id = ?', runId);
    if (!r?.purity_json) return null;
    const p = PuritySchema.safeParse(JSON.parse(r.purity_json));
    return p.success ? p.data : null;
  }

  summaryOf(runId: string): PuritySummary | null {
    const r = this.resultOf(runId);
    return r ? puritySummary(r) : null;
  }

  #membersOfRun(runId: string): Map<string, Member> {
    const rows = this.#o.db.all<{ id: string; check_id: string; component: string; outcome: string | null; review_id: string | null }>('SELECT id, check_id, component, outcome, review_id FROM check_runs WHERE run_id = ? ORDER BY rowid', runId);
    return new Map(rows.map((r) => [`${r.check_id}@${r.component}`, { instance: `${r.check_id}@${r.component}`, checkRunId: r.id, outcome: (r.outcome as CheckOutcome | null) ?? null, reviewed: r.review_id !== null, attempts: [r.id] }]));
  }

  #newRound(run: RunRow): PurityResult {
    const { db, ports } = this.#o;
    const roundId = newId(ports.random, 'rnd');
    const n = db.all<{ display_id: string }>('SELECT display_id FROM rounds WHERE project_id = ?', run.project_id).reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.display_id)?.[1] ?? 0)), 0) + 1;
    const members = this.#membersOfRun(run.id);
    const result = this.#compute(run, { kind: 'round', roundId }, members, run.state_changed === 1, run.snapshot_start_id);
    db.transaction(() => {
      db.run('INSERT INTO rounds (id, display_id, project_id, base_run_id, snapshot_id, verdict, purity_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', roundId, `ROUND-${String(n).padStart(3, '0')}`, run.project_id, run.id, run.snapshot_start_id, result.verdict, JSON.stringify(result), ports.clock.now().toISOString());
      for (const m of members.values()) db.run('INSERT INTO round_checks (round_id, instance, check_run_id, outcome, reviewed, attempts_json) VALUES (?, ?, ?, ?, ?, ?)', roundId, m.instance, m.checkRunId, m.outcome, m.reviewed ? 1 : 0, JSON.stringify(m.attempts));
      db.run('UPDATE runs SET round_id = ? WHERE id = ?', roundId, run.id);
    });
    return result;
  }

  async #continueRound(run: RunRow, roundId: string, declared: (path: string) => boolean): Promise<PurityResult | null> {
    const { db, ports, evidence } = this.#o;
    const round = db.get<{ id: string; project_id: string; base_run_id: string | null; snapshot_id: string | null }>('SELECT id, project_id, base_run_id, snapshot_id FROM rounds WHERE id = ?', roundId);
    if (!round || round.project_id !== run.project_id || !round.snapshot_id || !run.snapshot_start_id) return null;
    // 9.12 point 4: the state must not have changed since the round's snapshot (outside the declared outputs).
    const [a, b] = await Promise.all([evidence.snapshots.load(round.snapshot_id), evidence.snapshots.load(run.snapshot_start_id)]);
    if (!a || !b) return null;
    const d = diffManifests(a, b, { declared, tracked: null });
    if ([...d.created, ...d.modified, ...d.deleted].some((p) => !declared(p)) || d.truncated) return null;
    const members = new Map<string, Member>(
      db.all<{ instance: string; check_run_id: string | null; outcome: string | null; reviewed: number; attempts_json: string }>('SELECT instance, check_run_id, outcome, reviewed, attempts_json FROM round_checks WHERE round_id = ?', roundId).map((r) => [r.instance, { instance: r.instance, checkRunId: r.check_run_id, outcome: (r.outcome as CheckOutcome | null) ?? null, reviewed: r.reviewed === 1, attempts: JSON.parse(r.attempts_json) as string[] }]),
    );
    const specs = this.#specs(run);
    // 9.12 point 4: a retry whose outcome differs from the one the round keeps is recorded with the round.
    const notes: Reason[] = [];
    for (const retry of this.#membersOfRun(run.id).values()) {
      const before = members.get(retry.instance);
      const policy = specs.get(retry.instance)?.flakyPolicy ?? 'flaky';
      const m = mergeOutcome(before?.outcome ?? null, retry.outcome, policy);
      const attempts = [...(before?.attempts ?? []), ...retry.attempts];
      if (m.took === 'before' && before) {
        members.set(retry.instance, { ...before, attempts });
        if (retry.outcome !== null && retry.outcome !== before.outcome && !INDECISIVE.includes(retry.outcome)) notes.push({ key: 'purity.note.retryDiffered', params: { instance: retry.instance, kept: before.outcome ?? 'absent', retry: retry.outcome } });
      }
      else members.set(retry.instance, { instance: retry.instance, checkRunId: retry.checkRunId, outcome: m.outcome, reviewed: m.took === 'retry' ? retry.reviewed : false, attempts });
    }
    const base = round.base_run_id ? db.get<{ state_changed: number | null }>('SELECT state_changed FROM runs WHERE id = ?', round.base_run_id) : null;
    const result = { ...this.#compute(run, { kind: 'round', roundId }, members, base?.state_changed === 1 || run.state_changed === 1, round.snapshot_id), notes };
    db.transaction(() => {
      db.run('UPDATE rounds SET verdict = ?, purity_json = ?, updated_at = ? WHERE id = ?', result.verdict, JSON.stringify(result), ports.clock.now().toISOString(), roundId);
      for (const m of members.values()) db.run('INSERT INTO round_checks (round_id, instance, check_run_id, outcome, reviewed, attempts_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (round_id, instance) DO UPDATE SET check_run_id = excluded.check_run_id, outcome = excluded.outcome, reviewed = excluded.reviewed, attempts_json = excluded.attempts_json', roundId, m.instance, m.checkRunId, m.outcome, m.reviewed ? 1 : 0, JSON.stringify(m.attempts));
      db.run('UPDATE runs SET round_id = ? WHERE id = ?', roundId, run.id);
      for (const id of db.all<{ id: string }>('SELECT id FROM runs WHERE round_id = ?', roundId)) db.run('UPDATE runs SET purity_json = ?, verdict = ? WHERE id = ?', JSON.stringify(result), result.verdict, id.id);
    });
    return result;
  }

  /** The specs of the profile version the run used (R is «حسب الملف المعتمد», 11.2). */
  #specs(run: RunRow): Map<string, CheckSpec> {
    const p = run.profile_version !== null ? profileAt(this.#o.db, run.project_id, run.profile_version) : null;
    return new Map((p?.content.checks ?? []).map((s) => [s.instance, s]));
  }

  #compute(run: RunRow, scope: PurityScope, members: ReadonlyMap<string, Member>, stateChanged: boolean, snapshotId: string | null): PurityResult {
    const { db, catalog, ports } = this.#o;
    const specs = this.#specs(run);
    const counts = (checkRunId: string | null) => {
      if (!checkRunId) return { violations: 0, excluded: 0 };
      const rows = db.all<{ effect: string | null; n: number }>("SELECT effect, count(*) AS n FROM findings WHERE check_run_id = ? AND effect IN ('violation', 'excluded') GROUP BY effect", checkRunId);
      return { violations: rows.find((r) => r.effect === 'violation')?.n ?? 0, excluded: rows.find((r) => r.effect === 'excluded')?.n ?? 0 };
    };
    const checks: PurityCheckInput[] = [];
    const seen = new Set<string>();
    for (const s of specs.values()) {
      const m = members.get(s.instance);
      seen.add(s.instance);
      const c = counts(m?.checkRunId ?? null);
      checks.push({ instance: s.instance, checkId: s.checkId, component: s.component, section: s.section, criterion: s.criterion, inIndex: s.inIndex, required: s.required, applicable: s.applicable, blocking: s.blocking, outcome: m?.outcome ?? null, reviewed: m?.reviewed ?? false, violations: c.violations, excludedByReview: c.excluded, checkRunId: m?.checkRunId ?? null });
    }
    // An execution of an instance the profile no longer names (a dependency added for another) still shows.
    for (const m of members.values()) {
      if (seen.has(m.instance)) continue;
      const [checkId, component] = [m.instance.slice(0, m.instance.indexOf('@')), m.instance.slice(m.instance.indexOf('@') + 1)];
      const def = catalog.check(checkId);
      if (!def) continue;
      const c = counts(m.checkRunId);
      checks.push({ instance: m.instance, checkId, component, section: def.section, criterion: def.criterion, inIndex: def.inIndex, required: false, applicable: true, blocking: false, outcome: m.outcome, reviewed: m.reviewed, violations: c.violations, excludedByReview: c.excluded, checkRunId: m.checkRunId });
    }
    // DEV-9 (C-22): what each integrity check found and no review excluded (11.4 rules 6 to 9).
    const live = (checkRunId: string | null, rulePrefix: string): number => (checkRunId ? (db.get<{ n: number }>("SELECT count(*) AS n FROM findings WHERE check_run_id = ? AND rule_id LIKE ? AND coalesce(effect, '') <> 'excluded'", checkRunId, `${rulePrefix}%`)?.n ?? 0) : 0);
    const integ = (checkId: string) => [...members.values()].find((m) => m.instance.startsWith(`${checkId}@`)) ?? null;
    const integrity: IntegrityInputs = {
      stateChanged,
      guardUnreviewed: live(integ('integ.guard')?.checkRunId ?? null, 'guard.'),
      modelClaimsOpen: live(integ('integ.model-claims')?.checkRunId ?? null, 'claim.'),
      reviewsExpired: live(integ('integ.reviews')?.checkRunId ?? null, 'review.expired'),
      checks: [...members.values()].filter((m) => m.instance.startsWith('integ.')).map((m) => ({ checkId: m.instance.slice(0, m.instance.indexOf('@')), outcome: m.outcome })),
    };
    const toolVersions: Record<string, string> = {};
    for (const m of members.values()) {
      if (!m.checkRunId) continue;
      const r = db.get<{ tool_versions_json: string | null }>('SELECT tool_versions_json FROM check_runs WHERE id = ?', m.checkRunId);
      if (r?.tool_versions_json) Object.assign(toolVersions, JSON.parse(r.tool_versions_json) as Record<string, string>);
    }
    const git = latestSnapshot(db, run.project_id)?.facts.find((f) => f.key === 'git.repository')?.value;
    const commit = git && typeof git === 'object' && !Array.isArray(git) && typeof (git as Record<string, unknown>).commit === 'string' ? ((git as Record<string, unknown>).commit as string) : null;
    const meta: PurityMeta = { profileVersion: run.profile_version, profileHash: run.profile_hash, catalogVersion: run.catalog_version ?? catalog.version, toolVersions, environmentSource: null, snapshotId, commit, computedAt: ports.clock.now().toISOString() };
    return computePurity({ scope, checks, integrity, narrowThreshold: DEFAULT_NARROW_THRESHOLD, meta });
  }
}

