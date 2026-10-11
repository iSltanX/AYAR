// C-16 as a service, after each execution (9.8): the reports read in a worker thread (pool.ts, jobs.ts), the outcome
// by the ordered rules of 7.3 and the policies of 7.4 (classifier/classify.ts), and the unified findings of 14.2
// kept with the check run in the same transaction as its outcome:
//
// - the fingerprint of C-15, sha256(checkId | rule[:toolRule] | normalized path | anchor), the anchor itself a digest
//   (a secret's is an HMAC computed in memory, never its value);
// - the display id `AYR-{SECTION}-{CODE}-{NNNN}`, given at the first sight of a fingerprint in the project and kept
//   for it forever; NNNN counts per project and is never given twice, even after its runs are gone (G-33):
//   finding_ids keeps every id ever given, and it goes only with the project;
// - the status across runs (7.2-د): «جديد» for a fingerprint never seen in the project, «مستمر» when the previous
//   comparable execution of the same instance had it, «عاد» when it was seen before but not there; «زال» is
//   computed when results are read, against that previous execution, never stored as a row;
// - D-35: a finding a human review marked a false alarm (DEV-9's review.record: decision `false_positive`, on that
//   finding or its fingerprint) is excluded while its fingerprint — and so its anchor — is unchanged: it never
//   counts, and its number is shown with the outcome and the index;
// - the message, expected and actual redacted again before they are stored (the reports were redacted on their
//   way in, D-46; an analyzer's message may quote a project file).
import type { Catalog } from '@ayar/catalog';
import type { CheckOutcome, CheckSpec, ExitSignal, Fact, Finding, FindingDetail, FindingLocation, JsonValue, Origin, ParsedFinding, ParsedReport, Reason, ResultsFilter, ResultsPage, VerdictCounts } from '@ayar/protocol';
import { ParsedReport as ReportSchema } from '@ayar/protocol';
import type { ExitInfo } from '@ayar/adapters';
import { createHash } from 'node:crypto';
import { classify, type Classification, type RuleFacts, type WeighedFinding } from '../classifier/classify.ts';
import { CommandError } from '../host/errors.ts';
import type { EventBus } from '../host/event-bus.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import type { RedactionService } from '../redaction/service.ts';
import type { Db } from '../storage/db.ts';
import type { HmacKey } from '../storage/hmac-key.ts';
import type { Job, JobResult } from './jobs.ts';
import { JobCancelled, JobFailed, type VerdictPool } from './pool.ts';

/** The outcomes whose reports were read whole: a later execution compares its findings with theirs. */
export const COMPARABLE: readonly CheckOutcome[] = ['passed', 'failed', 'warning', 'needs_review', 'flaky'];
/** A review decision that excludes a finding as a false alarm (D-35; recorded by DEV-9's review.record). */
export const FALSE_ALARM = 'false_positive';
/** At most this many finding.final events per execution; the check's counts and results.query carry the rest. */
export const FINAL_EVENTS_MAX = 200;
/** A reader in a worker thread gets this long at most (the check's own timeout has already ended the process). */
export const JOB_TIMEOUT_MS = 10 * 60_000;

export interface ReportInput {
  name: string;
  step: number;
  /** Absolute: the redacted copy in the evidence store. */
  path: string;
  /** The raw report's size; over the limit it is not read (C-15). */
  size: number;
  truncated: boolean;
}

export type JudgeRequest =
  | { kind: 'parse'; adapter: string; cwd: string; reports: ReportInput[]; stdoutPath: string | null; stderrPath: string | null; exit: ExitInfo; inventory: string[]; outputs: string[]; startedAt: number }
  | { kind: 'analyze'; analyzer: string; files: string[]; facts: Fact[] }
  /** C-14 (DEV-7): the outcome of a probe execution (`probe.json` in the evidence), judged for one check. */
  | { kind: 'probe'; outcomePath: string; files: string[]; facts: Fact[] };

/** C-22 (DEV-9): the guard's effects on a check, as findings of that check with their anchors (7.3 rule 8). */
export interface GuardEffects {
  findings: ParsedFinding[];
  anchors: string[];
}

export interface JudgedFinding {
  finding: WeighedFinding;
  origin: Origin;
  fingerprint: string;
  ruleVersion: string;
  reviewId: string | null;
}

export interface Judgement {
  outcome: CheckOutcome;
  reason: Reason;
  origin: Origin | null;
  counts: VerdictCounts;
  findings: JudgedFinding[];
  /** The unified report (kept with the evidence, 9.9), or null when nothing could be read. */
  report: ParsedReport | null;
}

interface FindingRow {
  id: string;
  check_run_id: string;
  fingerprint: string;
  display_id: string;
  check_id: string;
  component: string;
  rule_id: string | null;
  rule_version: string | null;
  tool_rule_id: string | null;
  severity: Finding['severity'];
  proof: Finding['proof'];
  origin: Origin;
  title_key: string;
  message_redacted: string | null;
  location_json: string | null;
  expected_text: string | null;
  actual_text: string | null;
  evidence_ids_json: string | null;
  first_seen_run_id: string | null;
  cross_run_status: Finding['crossRunStatus'] | null;
  review_id: string | null;
  effect: Finding['effect'] | null;
  run_id: string;
  from_claim_id?: string | null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ZERO: VerdictCounts = { violations: 0, warnings: 0, review: 0, notes: 0, excludedByReview: 0 };

/** C-15 «بصمة الاكتشاف»: sha256(checkId | ruleId | normalizedPath | anchor). */
export function fingerprintOf(checkId: string, f: { rule: string; toolRule: string | null; location: FindingLocation | null }, anchor: string): string {
  return sha([checkId, f.toolRule ? `${f.rule}:${f.toolRule}` : f.rule, f.location?.path ?? '', anchor].join('|'));
}

export interface VerdictServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger: Logger;
  events: EventBus;
  pool: VerdictPool;
  hmacKey: HmacKey;
  redaction: RedactionService;
}

export class VerdictService {
  readonly #o: VerdictServiceOptions;

  constructor(o: VerdictServiceOptions) {
    this.#o = o;
  }

  get pool(): VerdictPool {
    return this.#o.pool;
  }

  /** The rule book's facts of a rule (G-38). */
  #facts(id: string): RuleFacts | undefined {
    const r = this.#o.catalog.rules.rule(id);
    return r ? { severity: r.severity, proof: r.proof, level: r.level, ...(r.origin ? { origin: r.origin } : {}) } : undefined;
  }

  /** Reads the reports (or the project's files) in a worker thread, then classifies. Never throws for the tool's sake. */
  async judge(spec: CheckSpec, o: { projectId: string; root: string; req: JudgeRequest; signal?: AbortSignal; guard?: GuardEffects }): Promise<Judgement> {
    const base = { root: o.root, component: spec.component, checkId: spec.checkId, thresholds: spec.thresholds, hmacKey: this.#o.hmacKey.key };
    const job: Job =
      o.req.kind === 'parse'
        ? { kind: 'parse', adapter: o.req.adapter, cwd: o.req.cwd, reports: o.req.reports, stdoutPath: o.req.stdoutPath, stderrPath: o.req.stderrPath, exit: o.req.exit, outputs: o.req.outputs, customSuccess: spec.customSuccess, inventory: o.req.inventory, startedAt: o.req.startedAt, ...base }
        : o.req.kind === 'probe'
          ? { kind: 'probe', outcomePath: o.req.outcomePath, files: o.req.files, references: spec.referenceValues, facts: o.req.facts, ...base }
          : { kind: 'analyze', analyzer: o.req.analyzer, files: o.req.files, references: spec.referenceValues, facts: o.req.facts, ...base };
    let result: JobResult;
    try {
      result = await this.#o.pool.run(job, { ...(o.signal ? { signal: o.signal } : {}), timeoutMs: JOB_TIMEOUT_MS });
    } catch (e) {
      if (e instanceof JobCancelled) return { outcome: 'cancelled', reason: { key: 'run.reason.cancelledByUser' }, origin: null, counts: { ...ZERO }, findings: [], report: null };
      const detail = e instanceof Error ? e.message.split('\n')[0]!.slice(0, 300) : String(e);
      this.#o.logger.log('error', 'a report reader failed', { checkId: spec.checkId, detail });
      return { outcome: 'unavailable', reason: { key: e instanceof JobFailed && e.timedOut ? 'verdict.reason.readerTimedOut' : 'verdict.reason.readerFailed', params: { detail } }, origin: 'tool', counts: { ...ZERO }, findings: [], report: null };
    }
    // What a reader hands over is checked like any message (C-03): a reader's bug is «تعذّر», never a guess.
    const parsed = ReportSchema.safeParse(result.report);
    if (!parsed.success || result.anchors.length !== result.report.findings.length) {
      this.#o.logger.log('error', 'a report reader returned an invalid report', { checkId: spec.checkId, issue: parsed.success ? 'anchors' : parsed.error.issues[0]?.message ?? '' });
      return { outcome: 'unavailable', reason: { key: 'verdict.reason.readerInvalid' }, origin: 'tool', counts: { ...ZERO }, findings: [], report: null };
    }
    return this.classifyReport(spec, { projectId: o.projectId, report: parsed.data, exit: result.exit, anchors: result.anchors, guard: o.guard ?? null });
  }

  /** The classification of a report already read (the analyzers' tests and the shared executions use it too). */
  classifyReport(spec: CheckSpec, o: { projectId: string; report: ParsedReport; exit: ExitSignal; anchors: readonly string[]; guard: GuardEffects | null }): Judgement {
    const book = this.#o.catalog.rules;
    // C-22 (DEV-9): the guard's effects on this check join its findings before the classifier (7.3 rule 8).
    const all = [...o.report.findings, ...(o.guard?.findings ?? [])];
    const allAnchors = [...o.anchors, ...(o.guard?.anchors ?? [])];
    // One finding per fingerprint: the same thing reported twice in one execution counts once.
    const seen = new Set<string>();
    const keep: number[] = [];
    const prints: string[] = [];
    all.forEach((f, i) => {
      const fp = fingerprintOf(spec.checkId, f, allAnchors[i]!);
      if (seen.has(fp)) return;
      seen.add(fp);
      keep.push(i);
      prints.push(fp);
    });
    const report: ParsedReport = { ...o.report, findings: keep.map((i) => all[i]!), findingsDropped: o.report.findingsDropped + (all.length - keep.length) };
    const reviews = this.falseAlarms(o.projectId, prints);
    const excluded = new Set<number>();
    prints.forEach((fp, i) => {
      if (reviews.has(fp)) excluded.add(i);
    });
    // A guard effect a review excluded as a false alarm (D-35) no longer touches the check.
    const guardTouches = report.findings.some((f, i) => f.rule.startsWith('guard.') && !excluded.has(i));
    const c: Classification = classify({
      checkId: spec.checkId,
      exit: o.exit,
      report,
      policy: { warnings: spec.warningsPolicy, flaky: spec.flakyPolicy },
      suspected: book.forCheck(spec.checkId)?.suspected ?? 'needs_review',
      rule: (id) => this.#facts(id),
      suspectedToolRules: book.suspectedToolRules(spec.checkId),
      excluded,
      guardTouches,
    });
    const findings: JudgedFinding[] = c.findings.map((f, i) => {
      const def = book.rule(f.rule);
      return { finding: f, origin: f.origin !== 'project' ? f.origin : (def?.origin ?? 'project'), fingerprint: prints[i]!, ruleVersion: def?.version ?? book.version, reviewId: reviews.get(prints[i]!) ?? null };
    });
    return { outcome: c.outcome, reason: c.reason, origin: c.origin, counts: c.counts, findings, report };
  }

  /**
   * D-35 (DEV-9, review.record `false_positive`): an execution judged again from its kept report, with the fingerprints
   * its rows carry (in the report's order), after a review excluded one of them. The exit is read as `ok`: only an
   * execution whose outcome came from its findings (warning, needs review, or a failure by violations) is judged
   * again; the caller checks that. Returns the new classification without saving anything.
   */
  reclassify(spec: CheckSpec, o: { projectId: string; report: ParsedReport; fingerprints: readonly string[] }): Judgement {
    const book = this.#o.catalog.rules;
    const reviews = this.falseAlarms(o.projectId, o.fingerprints);
    const excluded = new Set<number>();
    o.fingerprints.forEach((fp, i) => {
      if (reviews.has(fp)) excluded.add(i);
    });
    const guardTouches = o.report.findings.some((f, i) => f.rule.startsWith('guard.') && !excluded.has(i));
    const c: Classification = classify({
      checkId: spec.checkId,
      exit: { kind: 'ok' },
      report: o.report,
      policy: { warnings: spec.warningsPolicy, flaky: spec.flakyPolicy },
      suspected: book.forCheck(spec.checkId)?.suspected ?? 'needs_review',
      rule: (id) => this.#facts(id),
      suspectedToolRules: book.suspectedToolRules(spec.checkId),
      excluded,
      guardTouches,
    });
    const findings: JudgedFinding[] = c.findings.map((f, i) => {
      const def = book.rule(f.rule);
      return { finding: f, origin: f.origin !== 'project' ? f.origin : (def?.origin ?? 'project'), fingerprint: o.fingerprints[i] ?? '', ruleVersion: def?.version ?? book.version, reviewId: reviews.get(o.fingerprints[i] ?? '') ?? null };
    });
    return { outcome: c.outcome, reason: c.reason, origin: c.origin, counts: c.counts, findings, report: o.report };
  }

  /** Fingerprints a still-valid review excluded as a false alarm, with the review's id (D-35; the integrity checks ask too). */
  falseAlarms(projectId: string, prints: readonly string[]): Map<string, string> {
    const out = new Map<string, string>();
    if (!prints.length) return out;
    // Every review of a finding, oldest first: the latest decision on a fingerprint is the one that holds. The
    // fingerprint is read from the review itself (scope_json, as DEV-9 writes it) before the finding row, which
    // retention may have deleted with its run [D-DEV6-14].
    const rows = this.#o.db.all<{ id: string; target_ref: string; decision: string; scope_json: string; fingerprint: string | null }>(
      "SELECT r.id, r.target_ref, r.decision, r.scope_json, f.fingerprint FROM reviews r LEFT JOIN findings f ON f.id = r.target_ref WHERE r.project_id = ? AND r.target_type = 'finding' ORDER BY r.created_at, r.rowid",
      projectId,
    );
    const wanted = new Set(prints);
    const latest = new Map<string, { id: string; decision: string }>();
    for (const r of rows) {
      let scoped: unknown = null;
      try {
        scoped = (JSON.parse(r.scope_json) as { fingerprint?: unknown }).fingerprint;
      } catch {
        scoped = null;
      }
      const fp = typeof scoped === 'string' ? scoped : (r.fingerprint ?? r.target_ref);
      if (wanted.has(fp)) latest.set(fp, { id: r.id, decision: r.decision });
    }
    for (const [fp, r] of latest) if (r.decision === FALSE_ALARM) out.set(fp, r.id);
    return out;
  }

  /**
   * Keeps the findings of one execution (call inside the transaction that writes its outcome): display ids, the
   * status across runs, the review that excluded one. Returns the stored ids in order.
   */
  persist(o: { projectId: string; runId: string; checkRunId: string; spec: Pick<CheckSpec, 'checkId' | 'component' | 'section'>; judgement: Judgement; evidenceIds: readonly string[] }): string[] {
    const { db, ports } = this.#o;
    const book = this.#o.catalog.rules;
    const redactor = this.#o.redaction.redactor();
    const red = (s: string | null) => (s === null ? null : redactor.redactText(s).text);
    const previous = this.previousComparable(o.checkRunId, o.spec.checkId, o.spec.component, o.projectId);
    const before = previous ? new Set(db.all<{ fingerprint: string }>('SELECT fingerprint FROM findings WHERE check_run_id = ?', previous).map((r) => r.fingerprint)) : new Set<string>();
    const prefix = `AYR-${book.sectionCode(o.spec.section)}-${book.forCheck(o.spec.checkId)?.code ?? 'GEN'}-`;
    let next: number | null = null;
    const ids: string[] = [];
    for (const j of o.judgement.findings) {
      const known = db.get<{ display_id: string; first_seen_run_id: string | null }>('SELECT display_id, first_seen_run_id FROM finding_ids WHERE project_id = ? AND fingerprint = ?', o.projectId, j.fingerprint);
      let displayId: string;
      let firstSeen: string | null;
      if (known) {
        displayId = known.display_id;
        firstSeen = known.first_seen_run_id;
      } else {
        // G-33: one counter per project, never given twice (finding_ids keeps every id the project ever had).
        next ??= (db.all<{ display_id: string }>('SELECT display_id FROM finding_ids WHERE project_id = ?', o.projectId).reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.display_id)?.[1] ?? 0)), 0)) + 1;
        displayId = `${prefix}${String(next).padStart(4, '0')}`;
        next++;
        firstSeen = o.runId;
        db.run('INSERT INTO finding_ids (project_id, fingerprint, display_id, first_seen_run_id) VALUES (?, ?, ?, ?)', o.projectId, j.fingerprint, displayId, o.runId);
      }
      const status: Finding['crossRunStatus'] = !known ? 'new' : before.has(j.fingerprint) ? 'persisting' : previous ? 'reappeared' : 'persisting';
      const id = newId(ports.random, 'fnd');
      const f = j.finding;
      db.run(
        'INSERT INTO findings (id, check_run_id, fingerprint, display_id, check_id, component, rule_id, rule_version, tool_rule_id, severity, proof, origin, title_key, message_redacted, location_json, expected_text, actual_text, evidence_ids_json, first_seen_run_id, cross_run_status, review_id, effect) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        o.checkRunId,
        j.fingerprint,
        displayId,
        o.spec.checkId,
        o.spec.component,
        f.rule,
        j.ruleVersion,
        f.toolRule,
        f.severity,
        f.proof,
        j.origin,
        `catalog.rule.${f.rule}.title`,
        red(f.message),
        f.location ? JSON.stringify(f.location) : null,
        red(f.expected),
        red(f.actual),
        JSON.stringify(o.evidenceIds),
        firstSeen,
        status,
        j.reviewId,
        f.effect,
      );
      ids.push(id);
    }
    return ids;
  }

  /** finding.final for what was kept (at most FINAL_EVENTS_MAX per execution), after the transaction. */
  emitFinal(runId: string, checkRunId: string): void {
    const rows = this.#o.db.all<{ id: string; display_id: string; severity: Finding['severity']; proof: Finding['proof'] }>('SELECT id, display_id, severity, proof FROM findings WHERE check_run_id = ? ORDER BY rowid LIMIT ?', checkRunId, FINAL_EVENTS_MAX);
    for (const r of rows) this.#o.events.emit('finding.final', { runId, checkRunId, findingId: r.id, displayId: r.display_id, severity: r.severity, proof: r.proof });
  }

  /** The previous execution of the same instance whose reports were read whole (7.2-د «مقارنة بالتشغيل السابق»). */
  previousComparable(checkRunId: string, checkId: string, component: string, projectId: string): string | null {
    const marks = COMPARABLE.map(() => '?').join(',');
    return (
      this.#o.db.get<{ id: string }>(
        `SELECT c.id FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND c.check_id = ? AND c.component = ? AND c.id <> ? AND c.outcome IN (${marks}) AND c.covered_by_check_run_id IS NULL AND c.finished_at IS NOT NULL AND c.finished_at <= coalesce((SELECT finished_at FROM check_runs WHERE id = ?), c.finished_at) ORDER BY c.finished_at DESC, c.rowid DESC LIMIT 1`,
        projectId,
        checkId,
        component,
        checkRunId,
        ...COMPARABLE,
        checkRunId,
      )?.id ?? null
    );
  }

  /** The findings of an execution by effect (CheckRunView.findings). */
  countsOf(checkRunId: string): VerdictCounts {
    const c: VerdictCounts = { ...ZERO };
    for (const r of this.#o.db.all<{ effect: string | null; n: number }>('SELECT effect, count(*) AS n FROM findings WHERE check_run_id = ? GROUP BY effect', checkRunId)) {
      if (r.effect === 'violation') c.violations = r.n;
      else if (r.effect === 'warning') c.warnings = r.n;
      else if (r.effect === 'review') c.review = r.n;
      else if (r.effect === 'note') c.notes = r.n;
      else if (r.effect === 'excluded') c.excludedByReview = r.n;
    }
    return c;
  }

  // ── results.query, finding.get ───────────────────────────────────────────────────────────────────────────

  #view(r: FindingRow): Finding {
    return {
      id: r.id,
      displayId: r.display_id,
      fingerprint: r.fingerprint,
      runId: r.run_id,
      checkRunId: r.check_run_id,
      checkId: r.check_id,
      component: r.component,
      ruleId: r.rule_id ?? '',
      ruleVersion: r.rule_version ?? '',
      toolRuleId: r.tool_rule_id,
      severity: r.severity,
      proof: r.proof,
      origin: r.origin,
      titleKey: r.title_key,
      message: r.message_redacted ?? '',
      location: r.location_json ? (JSON.parse(r.location_json) as FindingLocation) : null,
      expected: r.expected_text,
      actual: r.actual_text,
      evidenceIds: r.evidence_ids_json ? (JSON.parse(r.evidence_ids_json) as string[]) : [],
      firstSeenRunId: r.first_seen_run_id,
      crossRunStatus: r.cross_run_status ?? 'new',
      reviewId: r.review_id,
      excludedByReview: r.effect === 'excluded',
      effect: r.effect ?? 'note',
    };
  }

  query(projectId: string, f: ResultsFilter): ResultsPage {
    const { db } = this.#o;
    if (!db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
    // Without a run: the project's latest finished run.
    const runId = f.runId ?? db.get<{ id: string }>("SELECT id FROM runs WHERE project_id = ? AND state IN ('finished', 'interrupted') ORDER BY coalesce(finished_at, started_at, '') DESC, display_id DESC LIMIT 1", projectId)?.id ?? null;
    if (runId && !db.get('SELECT id FROM runs WHERE id = ? AND project_id = ?', runId, projectId)) throw new CommandError('not_found', { reason: 'run' });
    const where: string[] = ['r.project_id = ?'];
    const params: (string | number)[] = [projectId];
    if (runId) {
      where.push('c.run_id = ?');
      params.push(runId);
    }
    if (f.checkRunId) {
      where.push('c.id = ?');
      params.push(f.checkRunId);
    }
    if (f.checkId) {
      where.push('fi.check_id = ?');
      params.push(f.checkId);
    }
    if (f.section) {
      where.push('c.section = ?');
      params.push(f.section);
    }
    const inList = (col: string, values: readonly string[] | undefined) => {
      if (!values?.length) return;
      where.push(`${col} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    };
    inList('fi.severity', f.severity);
    inList('fi.proof', f.proof);
    inList("coalesce(fi.cross_run_status, 'new')", f.crossRun?.filter((s) => s !== 'resolved'));
    const excludedWhere = [...where, "fi.effect = 'excluded'"];
    if (!f.includeExcluded) where.push("coalesce(fi.effect, '') <> 'excluded'");
    const from = 'FROM findings fi JOIN check_runs c ON c.id = fi.check_run_id JOIN runs r ON r.id = c.run_id';
    const onlyResolved = f.crossRun?.length && f.crossRun.every((s) => s === 'resolved');
    const total = onlyResolved ? 0 : (db.get<{ n: number }>(`SELECT count(*) AS n ${from} WHERE ${where.join(' AND ')}`, ...params)?.n ?? 0);
    const rows = onlyResolved
      ? []
      : db.all<FindingRow>(`SELECT fi.*, c.run_id AS run_id ${from} WHERE ${where.join(' AND ')} ORDER BY CASE fi.effect WHEN 'violation' THEN 0 WHEN 'review' THEN 1 WHEN 'warning' THEN 2 WHEN 'note' THEN 3 ELSE 4 END, fi.display_id, fi.rowid LIMIT ? OFFSET ?`, ...params, f.limit ?? 200, f.offset ?? 0);
    const excludedByReview = db.get<{ n: number }>(`SELECT count(*) AS n ${from} WHERE ${excludedWhere.join(' AND ')}`, ...params)?.n ?? 0;
    const wantResolved = !f.crossRun?.length || f.crossRun.includes('resolved');
    return { findings: rows.map((r) => this.#view(r)), total, resolved: runId && wantResolved ? this.#resolved(projectId, runId, f) : [], excludedByReview };
  }

  /** «زال»: what the previous comparable execution of each instance had and this run's execution does not. */
  #resolved(projectId: string, runId: string, f: ResultsFilter): ResultsPage['resolved'] {
    const { db } = this.#o;
    const marks = COMPARABLE.map(() => '?').join(',');
    const execs = db.all<{ id: string; check_id: string; component: string; section: string | null }>(`SELECT id, check_id, component, section FROM check_runs WHERE run_id = ? AND outcome IN (${marks}) AND covered_by_check_run_id IS NULL`, runId, ...COMPARABLE);
    const out: ResultsPage['resolved'] = [];
    for (const e of execs) {
      if (f.checkRunId && e.id !== f.checkRunId) continue;
      if (f.checkId && e.check_id !== f.checkId) continue;
      if (f.section && e.section !== f.section) continue;
      const prev = this.previousComparable(e.id, e.check_id, e.component, projectId);
      if (!prev) continue;
      const now = new Set(db.all<{ fingerprint: string }>('SELECT fingerprint FROM findings WHERE check_run_id = ?', e.id).map((r) => r.fingerprint));
      for (const g of db.all<{ fingerprint: string; display_id: string; rule_id: string | null; location_json: string | null; effect: string | null }>('SELECT fingerprint, display_id, rule_id, location_json, effect FROM findings WHERE check_run_id = ?', prev)) {
        if (now.has(g.fingerprint) || g.effect === 'note') continue;
        out.push({ fingerprint: g.fingerprint, displayId: g.display_id, checkId: e.check_id, component: e.component, ruleId: g.rule_id ?? '', location: g.location_json ? (JSON.parse(g.location_json) as FindingLocation) : null });
        if (out.length >= 1000) return out;
      }
    }
    return out;
  }

  get(findingId: string): FindingDetail {
    const { db } = this.#o;
    const row = db.get<FindingRow>('SELECT fi.*, c.run_id AS run_id FROM findings fi JOIN check_runs c ON c.id = fi.check_run_id WHERE fi.id = ?', findingId);
    if (!row) throw new CommandError('not_found', { reason: 'finding' });
    const history = db.all<{ run_id: string; check_run_id: string; finished_at: string | null; outcome: string | null }>(
      // The same project only: two copies of one repository share their fingerprints, never their history.
      'SELECT c.run_id, c.id AS check_run_id, c.finished_at, c.outcome FROM findings fi JOIN check_runs c ON c.id = fi.check_run_id JOIN runs r ON r.id = c.run_id WHERE fi.fingerprint = ? AND fi.id <> ? AND c.check_id = ? AND c.component = ? AND r.project_id = (SELECT project_id FROM runs WHERE id = ?) ORDER BY c.finished_at DESC, c.rowid DESC LIMIT 100',
      row.fingerprint,
      row.id,
      row.check_id,
      row.component,
      row.run_id,
    );
    return { finding: this.#view(row), history: history.map((h) => ({ runId: h.run_id, checkRunId: h.check_run_id, at: h.finished_at, outcome: (h.outcome as CheckOutcome | null) ?? null })) };
  }
}

/** The unified report as kept with the evidence (9.9): JSON, its findings already in AYAR's terms. */
export function reportEvidence(report: ParsedReport, extra: Record<string, JsonValue> = {}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...report, ...extra }, null, 2));
}
