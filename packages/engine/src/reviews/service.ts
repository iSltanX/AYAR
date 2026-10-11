// Human reviews (C-16, FR-34, D-35, G-17, 11.4 rules 6 and 7; DEV-9). A review is a decision with a note, on one of
// three targets, remembered with the files it holds for and the state it was taken on:
//
// - a check execution: `accept` makes it «اجتاز (بمراجعة)», `reject` «أخفق (بمراجعة)»; the automatic outcome stays
//   in `auto_outcome` (G-17), the round it belongs to is computed again (C-19), and its scope is the files its
//   findings point at (the guard's effects, AT-24 ز) or, without any, the component's files;
// - a finding: `accept` and `reject` record the decision; `false_positive` excludes it while its fingerprint — its
//   anchor — is unchanged (D-35): it never counts, its number is always shown, and the execution is judged again from
//   its kept report so the exclusion shows now (11.4 rule 7), not only at the next run;
// - a model claim: `card` turns it into a task card, `not_issue` closes it; either settles the claim for
//   integ.model-claims (12.9), and neither changes a result.
//
// A review expires when a file of its scope changes (11.4 rule 6): integ.reviews says so at the next run, and the
// check goes back to «يحتاج مراجعة». Nothing here writes into the repository.
import type { Catalog } from '@ayar/catalog';
import type { A11yReviewItem, CheckOutcome, CheckSpec, FindingLocation, ParsedReport, ReviewDecision, ReviewRecord, ReviewRecorded, ReviewTarget, VerdictCounts } from '@ayar/protocol';
import { A11Y_REVIEW_ITEMS, ParsedReport as ReportSchema } from '@ayar/protocol';
import type { EvidenceService } from '../evidence/service.ts';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { IntegrityService } from '../integrity/service.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { profileAt } from '../profile/store.ts';
import type { ProjectsService } from '../projects/service.ts';
import type { PurityService } from '../purity/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import type { TasksService } from '../tasks/service.ts';
import type { RunService } from '../executor/run.ts';
import type { VerdictService } from '../verdict/service.ts';

const ALLOWED: Record<ReviewTarget['type'], readonly ReviewDecision[]> = {
  check: ['accept', 'reject'],
  finding: ['accept', 'reject', 'false_positive'],
  modelClaim: ['card', 'not_issue'],
};
/** At most this many files in a scope taken from a component's inventory. */
const MAX_SCOPE_FILES = 2000;

interface ReviewRow {
  id: string;
  project_id: string;
  target_type: 'check' | 'finding' | 'model_claim';
  target_ref: string;
  decision: string;
  scope_json: string;
  note: string | null;
  snapshot_id: string | null;
  created_at: string;
}

export interface ReviewsServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger: Logger;
  evidence: EvidenceService;
  purity: PurityService;
  verdict: VerdictService;
  integrity: IntegrityService;
  tasks: TasksService;
  projects: ProjectsService;
  runs?: RunService;
}

/** The latest review of each item of a design.a11y.review instance (DEV-12, 10.3). */
export function reviewItems(db: Db, projectId: string, instance: string): Map<A11yReviewItem, { id: string; decision: string; scope_json: string; snapshot_id: string | null; created_at: string }> {
  const out = new Map<A11yReviewItem, { id: string; decision: string; scope_json: string; snapshot_id: string | null; created_at: string }>();
  for (const item of A11Y_REVIEW_ITEMS) {
    const row = db.get<{ id: string; decision: string; scope_json: string; snapshot_id: string | null; created_at: string }>(
      "SELECT id, decision, scope_json, snapshot_id, created_at FROM reviews WHERE project_id = ? AND target_type = 'check' AND target_ref = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      projectId,
      `${instance}#${item}`,
    );
    if (row) out.set(item, row);
  }
  return out;
}

/** The item a check review was recorded for, from its ref (`<instance>#<item>`). */
function itemOf(r: { target_type: string; target_ref: string }): { item?: A11yReviewItem } {
  if (r.target_type !== 'check') return {};
  const item = r.target_ref.split('#')[1];
  return item && (A11Y_REVIEW_ITEMS as readonly string[]).includes(item) ? { item: item as A11yReviewItem } : {};
}

export class ReviewsService {
  readonly #o: ReviewsServiceOptions;

  constructor(o: ReviewsServiceOptions) {
    this.#o = o;
  }

  attachRuns(runs: RunService): void {
    this.#o.runs = runs;
  }

  async record(target: ReviewTarget, decision: ReviewDecision, note: string): Promise<ReviewRecorded> {
    if (!ALLOWED[target.type].includes(decision)) throw new CommandError('invalid_payload', { path: 'decision', reason: `not_for_${target.type}` });
    if (target.type === 'check' && target.item) return this.#onReviewItem(target.id, target.item, decision, note);
    if (target.type === 'check') return this.#onCheck(target.id, decision, note);
    if (target.type === 'finding') return this.#onFinding(target.id, decision, note);
    return this.#onClaim(target.id, decision, note);
  }

  #insert(o: { projectId: string; targetType: ReviewRow['target_type']; targetRef: string; decision: ReviewDecision; note: string; files: readonly string[]; fingerprint: string | null; snapshotId: string | null }): ReviewRow {
    const { db, ports } = this.#o;
    const id = newId(ports.random, 'rev');
    const now = ports.clock.now();
    const scope = JSON.stringify({ files: [...o.files].slice(0, MAX_SCOPE_FILES), fingerprint: o.fingerprint });
    db.run('INSERT INTO reviews (id, project_id, target_type, target_ref, decision, scope_json, note, snapshot_id, expires_rule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, o.projectId, o.targetType, o.targetRef, o.decision, scope, o.note, o.snapshotId, 'scope_files_changed', now.toISOString());
    recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'review.recorded', projectId: o.projectId, details: { reviewId: id, target: o.targetType, ref: o.targetRef, decision: o.decision, files: o.files.length } });
    return { id, project_id: o.projectId, target_type: o.targetType, target_ref: o.targetRef, decision: o.decision, scope_json: scope, note: o.note, snapshot_id: o.snapshotId, created_at: now.toISOString() };
  }

  /** The snapshot a review is taken on: the run's end state (or start), else the project's latest. */
  #snapshotOf(projectId: string, runId: string | null): string | null {
    const { db } = this.#o;
    if (runId) {
      const r = db.get<{ snapshot_end_id: string | null; snapshot_start_id: string | null }>('SELECT snapshot_end_id, snapshot_start_id FROM runs WHERE id = ?', runId);
      if (r?.snapshot_end_id || r?.snapshot_start_id) return r.snapshot_end_id ?? r.snapshot_start_id;
    }
    return db.get<{ id: string }>('SELECT id FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId)?.id ?? null;
  }

  async #componentFiles(projectId: string, snapshotId: string | null, component: string): Promise<string[]> {
    if (!snapshotId) return [];
    const m = await this.#o.evidence.snapshots.load(snapshotId).catch(() => null);
    if (!m) return [];
    const prefix = component === '.' ? '' : `${component}/`;
    return m.files.filter((f) => f[6] !== 'link' && (!prefix || f[0].startsWith(prefix))).map((f) => f[0]).slice(0, MAX_SCOPE_FILES);
  }

  async #onCheck(checkRunId: string, decision: ReviewDecision, note: string): Promise<ReviewRecorded> {
    const { db } = this.#o;
    const c = db.get<{ id: string; run_id: string; check_id: string; component: string; state: string; outcome: string | null; auto_outcome: string | null; project_id: string }>('SELECT c.id, c.run_id, c.check_id, c.component, c.state, c.outcome, c.auto_outcome, r.project_id FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE c.id = ?', checkRunId);
    if (!c) throw new CommandError('not_found', { reason: 'check_run' });
    if (c.state !== 'finished') throw new CommandError('busy', { reason: 'check_running' });
    const instance = `${c.check_id}@${c.component}`;
    const snapshotId = this.#snapshotOf(c.project_id, c.run_id);
    // The scope: the files the execution's findings point at (a guard effect's file, AT-24 ز); else the component.
    const paths = db.all<{ location_json: string | null }>('SELECT location_json FROM findings WHERE check_run_id = ? AND location_json IS NOT NULL', checkRunId).map((r) => (JSON.parse(r.location_json!) as FindingLocation).path).filter((p): p is string => typeof p === 'string');
    const files = paths.length ? [...new Set(paths)] : await this.#componentFiles(c.project_id, snapshotId, c.component);
    const row = this.#insert({ projectId: c.project_id, targetType: 'check', targetRef: instance, decision, note, files, fingerprint: null, snapshotId });
    const outcome: CheckOutcome = decision === 'accept' ? 'passed' : 'failed';
    db.transaction(() => {
      // G-17: the automatic outcome is kept; the review's decision is the outcome now.
      db.run('UPDATE check_runs SET outcome = ?, review_id = ?, auto_outcome = coalesce(auto_outcome, outcome) WHERE id = ?', outcome, row.id, checkRunId);
      db.run('UPDATE round_checks SET outcome = ?, reviewed = 1 WHERE check_run_id = ?', outcome, checkRunId);
    });
    let recomputed = false;
    try {
      recomputed = this.#o.purity.recomputeFor(checkRunId) !== null;
    } catch (e) {
      this.#o.logger.log('error', 'the round could not be computed again after a review', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    }
    this.#o.runs?.emitAfterReview(c.run_id, checkRunId);
    const auto = db.get<{ auto_outcome: string | null }>('SELECT auto_outcome FROM check_runs WHERE id = ?', checkRunId)?.auto_outcome ?? null;
    return { review: await this.#view(row), check: { checkRunId, instance, outcome, autoOutcome: (auto as CheckOutcome | null) ?? null, roundRecomputed: recomputed }, finding: null, claim: null };
  }

  /**
   * DEV-12 (10.3): one item of design.a11y.review, remembered as `<instance>#<item>` with the component's files as its
   * scope. Once all four items are decided, the execution takes their decision as a review would (G-17): a rejected
   * item fails it, four accepted pass it; until then it stays «يحتاج مراجعة».
   */
  async #onReviewItem(checkRunId: string, item: A11yReviewItem, decision: ReviewDecision, note: string): Promise<ReviewRecorded> {
    const { db } = this.#o;
    const c = db.get<{ id: string; run_id: string; check_id: string; component: string; state: string; project_id: string }>('SELECT c.id, c.run_id, c.check_id, c.component, c.state, r.project_id FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE c.id = ?', checkRunId);
    if (!c) throw new CommandError('not_found', { reason: 'check_run' });
    if (c.check_id !== 'design.a11y.review') throw new CommandError('invalid_payload', { path: 'target.item', reason: 'not_a_review_check' });
    if (c.state !== 'finished') throw new CommandError('busy', { reason: 'check_running' });
    const instance = `${c.check_id}@${c.component}`;
    const snapshotId = this.#snapshotOf(c.project_id, c.run_id);
    const files = await this.#componentFiles(c.project_id, snapshotId, c.component);
    const row = this.#insert({ projectId: c.project_id, targetType: 'check', targetRef: `${instance}#${item}`, decision, note, files, fingerprint: null, snapshotId });
    const latest = reviewItems(db, c.project_id, instance);
    let outcome: CheckOutcome | null = null;
    if (A11Y_REVIEW_ITEMS.every((i) => latest.has(i))) {
      outcome = [...latest.values()].some((r) => r.decision === 'reject') ? 'failed' : 'passed';
      db.transaction(() => {
        db.run('UPDATE check_runs SET outcome = ?, review_id = ?, auto_outcome = coalesce(auto_outcome, outcome) WHERE id = ?', outcome, row.id, checkRunId);
        db.run('UPDATE round_checks SET outcome = ?, reviewed = 1 WHERE check_run_id = ?', outcome, checkRunId);
      });
    }
    let recomputed = false;
    if (outcome) {
      try {
        recomputed = this.#o.purity.recomputeFor(checkRunId) !== null;
      } catch (e) {
        this.#o.logger.log('error', 'the round could not be computed again after a review', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      }
    }
    this.#o.runs?.emitAfterReview(c.run_id, checkRunId);
    const now = db.get<{ outcome: string | null; auto_outcome: string | null }>('SELECT outcome, auto_outcome FROM check_runs WHERE id = ?', checkRunId);
    return { review: await this.#view(row), check: { checkRunId, instance, outcome: (now?.outcome as CheckOutcome | null) ?? null, autoOutcome: (now?.auto_outcome as CheckOutcome | null) ?? null, roundRecomputed: recomputed }, finding: null, claim: null };
  }

  async #onFinding(findingId: string, decision: ReviewDecision, note: string): Promise<ReviewRecorded> {
    const { db } = this.#o;
    const f = db.get<{ id: string; check_run_id: string; fingerprint: string; display_id: string; location_json: string | null; check_id: string; component: string; run_id: string; project_id: string; outcome: string | null; profile_version: number | null }>(
      'SELECT f.id, f.check_run_id, f.fingerprint, f.display_id, f.location_json, f.check_id, f.component, c.run_id, r.project_id, c.outcome, r.profile_version FROM findings f JOIN check_runs c ON c.id = f.check_run_id JOIN runs r ON r.id = c.run_id WHERE f.id = ?',
      findingId,
    );
    if (!f) throw new CommandError('not_found', { reason: 'finding' });
    const path = f.location_json ? (JSON.parse(f.location_json) as FindingLocation).path : null;
    const snapshotId = this.#snapshotOf(f.project_id, f.run_id);
    const row = this.#insert({ projectId: f.project_id, targetType: 'finding', targetRef: f.fingerprint, decision, note, files: path ? [path] : [], fingerprint: f.fingerprint, snapshotId });
    let excluded = false;
    if (decision === 'false_positive') {
      excluded = true;
      db.transaction(() => {
        db.run("UPDATE findings SET effect = 'excluded', review_id = ? WHERE id = ?", row.id, findingId);
        this.#recount(f.check_run_id);
      });
      // 11.4 rule 7: the exclusion shows now — the execution is judged again from its kept report.
      await this.#rejudge(f.project_id, f.run_id, f.check_run_id, f.check_id, f.component, f.profile_version);
    } else db.run('UPDATE findings SET review_id = ? WHERE id = ?', row.id, findingId);
    this.#o.runs?.emitAfterReview(f.run_id, f.check_run_id);
    return { review: await this.#view(row), check: null, finding: { findingId, displayId: f.display_id, excluded }, claim: null };
  }

  /** The counts by effect of an execution, after a change of effects. */
  #recount(checkRunId: string): VerdictCounts {
    const counts = this.#o.verdict.countsOf(checkRunId);
    this.#o.db.run('UPDATE check_runs SET findings_json = ? WHERE id = ?', JSON.stringify(counts), checkRunId);
    return counts;
  }

  /**
   * D-35 now: an execution whose outcome came from its findings is classified again with the excluded ones, from the
   * parsed report kept in its evidence and the fingerprints of its rows (in the report's order). An execution whose
   * outcome the process itself gave (missing, unavailable, cancelled…) is left as it is.
   */
  async #rejudge(projectId: string, runId: string, checkRunId: string, checkId: string, component: string, profileVersion: number | null): Promise<void> {
    const { db } = this.#o;
    const c = db.get<{ outcome: string | null; review_id: string | null }>('SELECT outcome, review_id FROM check_runs WHERE id = ?', checkRunId);
    if (!c || !['passed', 'failed', 'warning', 'needs_review', 'flaky'].includes(c.outcome ?? '')) return;
    // A check a human review already decided keeps that decision (G-17).
    if (c.review_id && db.get<{ target_type: string }>('SELECT target_type FROM reviews WHERE id = ?', c.review_id)?.target_type === 'check') return;
    const ev = db.get<{ rel_path: string }>("SELECT rel_path FROM evidence WHERE check_run_id = ? AND kind = 'parsed' ORDER BY created_at DESC LIMIT 1", checkRunId);
    if (!ev) return;
    let report: ParsedReport;
    try {
      const data = await this.#o.ports.fs.readFilePrefix(this.#o.evidence.store.absolute(ev.rel_path), 64 * 1024 * 1024);
      report = ReportSchema.parse(JSON.parse(new TextDecoder().decode(data.data)));
    } catch {
      return;
    }
    const rows = db.all<{ id: string; fingerprint: string }>('SELECT id, fingerprint FROM findings WHERE check_run_id = ? ORDER BY rowid', checkRunId);
    if (rows.length !== report.findings.length) return; // the rows and the report no longer align: judged at the next run
    const spec = this.#specOf(projectId, profileVersion, `${checkId}@${component}`);
    if (!spec) return;
    const j = this.#o.verdict.reclassify(spec, { projectId, report, fingerprints: rows.map((r) => r.fingerprint) });
    db.transaction(() => {
      rows.forEach((r, i) => {
        const f = j.findings[i];
        if (f) db.run('UPDATE findings SET effect = ?, review_id = coalesce(?, review_id) WHERE id = ?', f.finding.effect, f.reviewId, r.id);
      });
      db.run('UPDATE check_runs SET outcome = ?, outcome_reason = ?, origin = ?, findings_json = ? WHERE id = ?', j.outcome, JSON.stringify(j.reason), j.origin, JSON.stringify(j.counts), checkRunId);
      db.run('UPDATE round_checks SET outcome = ? WHERE check_run_id = ?', j.outcome, checkRunId);
    });
    try {
      this.#o.purity.recomputeFor(checkRunId);
    } catch (e) {
      this.#o.logger.log('error', 'the round could not be computed again after a false-alarm review', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    }
    void runId;
  }

  #specOf(projectId: string, profileVersion: number | null, instance: string): CheckSpec | null {
    if (profileVersion === null) return null;
    return profileAt(this.#o.db, projectId, profileVersion)?.content.checks.find((s) => s.instance === instance) ?? null;
  }

  async #onClaim(claimId: string, decision: ReviewDecision, note: string): Promise<ReviewRecorded> {
    const { db } = this.#o;
    const c = db.get<{ id: string; display_id: string; ai_check_id: string; location_json: string | null; project_id: string; match_status: string | null }>('SELECT m.id, m.display_id, m.ai_check_id, m.location_json, m.match_status, a.project_id FROM model_claims m JOIN ai_checks a ON a.id = m.ai_check_id WHERE m.id = ?', claimId);
    if (!c) throw new CommandError('not_found', { reason: 'model_claim' });
    const path = c.location_json ? (JSON.parse(c.location_json) as FindingLocation).path : null;
    const row = this.#insert({ projectId: c.project_id, targetType: 'model_claim', targetRef: c.display_id, decision, note, files: path ? [path] : [], fingerprint: null, snapshotId: this.#snapshotOf(c.project_id, null) });
    const status = decision === 'card' ? 'decided_card' : 'decided_not_issue';
    db.run('UPDATE model_claims SET match_status = ?, review_id = ? WHERE id = ?', status, row.id, claimId);
    let taskDisplayId: string | null = null;
    if (decision === 'card') {
      const task = this.#o.tasks.create(c.project_id, { kind: 'modelClaim', claimId }, {}, this.#o.tasks.contextOf(c.project_id));
      taskDisplayId = task.displayId;
    }
    return { review: await this.#view(row), check: null, finding: null, claim: { claimId, displayId: c.display_id, status, taskDisplayId } };
  }

  async #view(r: ReviewRow): Promise<ReviewRecord> {
    let scope: { files?: unknown; fingerprint?: unknown } = {};
    try {
      scope = JSON.parse(r.scope_json) as typeof scope;
    } catch {
      scope = {};
    }
    const files = Array.isArray(scope.files) ? scope.files.filter((x): x is string => typeof x === 'string') : [];
    const latest = this.#snapshotOf(r.project_id, null);
    let valid = true;
    if (latest) {
      const m = await this.#o.evidence.snapshots.load(latest).catch(() => null);
      if (m) valid = !(await this.#o.integrity.reviewExpired(r, new Map(m.files.map((f) => [f[0], f[5]])))).expired;
    }
    return {
      id: r.id,
      projectId: r.project_id,
      target: { type: r.target_type === 'model_claim' ? 'modelClaim' : r.target_type, id: this.#targetId(r), ...itemOf(r) },
      targetRef: r.target_ref,
      decision: (['accept', 'reject', 'false_positive', 'card', 'not_issue'].includes(r.decision) ? r.decision : r.decision === 'passed' ? 'accept' : 'reject') as ReviewDecision,
      note: r.note ?? '',
      scope: { files, fingerprint: typeof scope.fingerprint === 'string' ? scope.fingerprint : null },
      snapshotId: r.snapshot_id,
      createdAt: r.created_at,
      valid,
    };
  }

  /** The id the review's target is addressed by now (an execution, a finding row, a claim), or the ref itself. */
  #targetId(r: ReviewRow): string {
    const { db } = this.#o;
    const safe = (s: string) => (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(s) ? s : s.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 128));
    if (r.target_type === 'check') return db.get<{ id: string }>('SELECT id FROM check_runs WHERE review_id = ? LIMIT 1', r.id)?.id ?? safe(r.target_ref);
    if (r.target_type === 'finding') return db.get<{ id: string }>('SELECT id FROM findings WHERE review_id = ? LIMIT 1', r.id)?.id ?? db.get<{ id: string }>('SELECT id FROM findings WHERE fingerprint = ? ORDER BY rowid DESC LIMIT 1', r.target_ref)?.id ?? safe(r.target_ref);
    return db.get<{ id: string }>('SELECT id FROM model_claims WHERE review_id = ? LIMIT 1', r.id)?.id ?? safe(r.target_ref);
  }

  async list(projectId: string): Promise<ReviewRecord[]> {
    if (!this.#o.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
    const rows = this.#o.db.all<ReviewRow>('SELECT id, project_id, target_type, target_ref, decision, scope_json, note, snapshot_id, created_at FROM reviews WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', projectId);
    const out: ReviewRecord[] = [];
    for (const r of rows) out.push(await this.#view(r));
    return out;
  }
}
