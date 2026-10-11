// C-21 point 1: the one data object `report/1` (12.1, D-40) of a run, of chosen findings (a fix prompt) or of a task
// card, built from what C-16, C-17, C-19, C-22 and C-25 kept: the head, every check with what it proved or why it did
// not, every finding with the mandatory fields of D-11 and its evidence excerpt, what did not run, the integrity
// panel, the model claims, and what stays unproven. Every next step is classified here by 12.7 (D-44). Findings are
// ordered by 12.5 rule 4: the blocking first, then the severity, the proven before the suspected, then by file. Both
// formats are derived from this object and from nothing else; the parity check reads it too.
import type { Catalog } from '@ayar/catalog';
import type { CheckOutcome, CheckSpec, FindingLocation, NextStepInfo, Reason, Report, ReportCheck, ReportClaim, ReportFinding, ReportHead, ReportIntegrity, ReportNotRun, ReportOptions, Severity } from '@ayar/protocol';
import { PurityResult as PuritySchema, RunPlan as PlanSchema, type PurityResult, type RawCheckResult, type RunPlan } from '@ayar/protocol';
import { release } from 'node:os';
import { posix } from 'node:path';
import { advisorFactsFromSnapshot } from '../advisor/facts.ts';
import type { EvidenceService } from '../evidence/service.ts';
import type { Manifest } from '../evidence/snapshot.ts';
import { CommandError } from '../host/errors.ts';
import type { IntegrityService } from '../integrity/service.ts';
import type { EnginePorts } from '../ports/index.ts';
import { latestSnapshot } from '../profile/service.ts';
import { profileAt } from '../profile/store.ts';
import type { Db } from '../storage/db.ts';
import { ENGINE_VERSION } from '../version.ts';
import { errorLines, excerpt, EXCERPT_CHARS, EXCERPT_LINES } from './boundaries.ts';

/** Rules whose cause the rule itself fixes (12.5 rule 5): the fix comes from its template (`catalog.rule.<id>.fix`). */
export const RULES_WITH_FIX = new Set([
  'ref.missing-file',
  'ref.missing-anchor',
  'link.broken',
  'manifest.missing-file',
  'manifest.missing-key',
  'manifest.invalid-version',
  'manifest.missing-default-locale',
  'manifest.undefined-message',
  'manifest.csp-unsafe-eval',
  'manifest.csp-remote-script',
  'manifest.comments',
  'manifest.mv2-chrome',
  'permission.outside-policy',
  'tokens.undefined-var',
  'tokens.off-scale',
  'rtl.missing-dir',
  'rtl.missing-lang',
  'fonts.face-missing',
  'fonts.unapproved',
  'fonts.remote',
  'unused.unlisted',
  'unused.unresolved',
  'vuln.known',
  'secret.detected',
  'test.snapshot-missing',
  'build.output-missing',
  'types.error',
]);

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const MAX_LOG_BYTES = 4 * 1024 * 1024;

interface RunRow {
  id: string;
  display_id: string;
  project_id: string;
  kind: string;
  plan_json: string;
  profile_version: number | null;
  profile_hash: string | null;
  catalog_version: string | null;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  snapshot_start_id: string | null;
  snapshot_end_id: string | null;
  counts_json: string | null;
  verdict: string | null;
  purity_json: string | null;
  round_id: string | null;
  state_changed: number | null;
}

interface CheckRow {
  id: string;
  run_id: string;
  check_id: string;
  component: string;
  section: string | null;
  criterion: string | null;
  state: string;
  outcome: string | null;
  outcome_reason: string | null;
  auto_outcome: string | null;
  review_id: string | null;
  origin: string | null;
  command_json: string | null;
  cwd_rel: string | null;
  notes_json: string | null;
  raw_json: string | null;
  tests_json: string | null;
  duration_ms: number | null;
  findings_json: string | null;
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
  severity: Severity;
  proof: 'proven' | 'suspected' | 'suggestion';
  origin: 'project' | 'tool' | 'environment' | 'model';
  title_key: string;
  message_redacted: string | null;
  location_json: string | null;
  expected_text: string | null;
  actual_text: string | null;
  evidence_ids_json: string | null;
  cross_run_status: string | null;
  review_id: string | null;
  effect: string | null;
  from_claim_id: string | null;
  from_claim_display: string | null;
}

export interface BuildDeps {
  db: Db;
  catalog: Catalog;
  evidence: EvidenceService;
  integrity: IntegrityService;
  ports: EnginePorts;
}

export type BuildTarget = { kind: 'run'; runId: string } | { kind: 'findings'; findingIds: string[] } | { kind: 'card'; taskId: string };

const parseReason = (s: string | null): Reason | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as Reason;
  } catch {
    return null;
  }
};

/** 12.7 (D-44, FR-65): the next step of a check result. */
export function nextStepOfCheck(catalog: Catalog, c: { checkId: string; outcome: CheckOutcome | null; reason: Reason | null; origin: string | null; reviewed: boolean; findings: { effect: string }[] }): NextStepInfo {
  const o = c.outcome;
  const key = c.reason?.key ?? '';
  if (o === null) return { kind: 'direct', action: 'setup', reason: { key: 'report.next.absent' }, orByHand: false };
  if (o === 'passed') return { kind: 'none', action: null, reason: { key: c.reviewed ? 'report.next.passedReviewed' : 'report.next.passed' }, orByHand: false };
  if (o === 'not_applicable') return { kind: 'none', action: null, reason: c.reason ?? { key: 'report.next.notApplicable' }, orByHand: false };
  if (o === 'missing') {
    // 12.7: «ناقص» splits — tests → a card for the model; a tool, dependencies, an approval, the network, a setting → direct.
    if (/tests|noTestFiles|noTestsRan|pytestNoTests/i.test(key)) return { kind: catalog.nextStep(c.checkId, 'missing_tests'), action: null, reason: { key: 'report.next.missingTests' }, orByHand: false };
    if (/configuration|noThreshold|noSuccessCriterion|noWebBudgets|statesInvalid|renderTargetInvalid|noAdapter|noCommand/i.test(key)) return { kind: catalog.nextStep(c.checkId, 'missing_configuration'), action: 'define', reason: { key: 'report.next.missingConfiguration' }, orByHand: false };
    if (/notApproved|specChanged|adapterUntested|runtimeMismatch|versionAccepted/i.test(key)) return { kind: 'direct', action: 'approve', reason: { key: 'report.next.needsApproval' }, orByHand: false };
    if (/toolMissing|toolNotFound|browserMissing|osvDbMissing|dependenciesMissing|lockfile|managerMismatch/i.test(key)) return { kind: 'direct', action: 'install', reason: { key: 'report.next.missingTool' }, orByHand: false };
    return { kind: catalog.nextStep(c.checkId, 'missing'), action: 'setup', reason: { key: 'report.next.missing' }, orByHand: false };
  }
  if (o === 'unavailable') return { kind: catalog.nextStep(c.checkId, 'error'), action: 'setup', reason: { key: c.origin === 'tool' ? 'report.next.toolError' : 'report.next.error' }, orByHand: false };
  if (o === 'timed_out') return { kind: catalog.nextStep(c.checkId, 'timeout'), action: 'setup', reason: { key: 'report.next.timeout' }, orByHand: false };
  if (o === 'cancelled') return { kind: catalog.nextStep(c.checkId, 'cancelled'), action: 'setup', reason: { key: 'report.next.cancelled' }, orByHand: false };
  if (o === 'interrupted') return { kind: catalog.nextStep(c.checkId, 'interrupted'), action: 'setup', reason: { key: 'report.next.interrupted' }, orByHand: false };
  if (o === 'skipped') return { kind: catalog.nextStep(c.checkId, 'skipped'), action: 'setup', reason: { key: 'report.next.skipped' }, orByHand: false };
  if (o === 'needs_review') return { kind: 'review', action: null, reason: { key: c.findings.some((f) => f.effect === 'review') ? 'report.next.review' : 'report.next.reviewUnresolved' }, orByHand: false };
  // failed, warning, flaky: a change in the code or the tests — unless the tool, not the project, is the cause (12.7).
  if (c.origin === 'tool') return { kind: 'direct', action: 'setup', reason: { key: 'report.next.toolCause' }, orByHand: false };
  if (o === 'flaky') return { kind: catalog.nextStep(c.checkId, 'flaky'), action: null, reason: { key: 'report.next.flaky' }, orByHand: false };
  if (o === 'warning') return { kind: catalog.nextStep(c.checkId, 'warning'), action: null, reason: { key: 'report.next.warning' }, orByHand: true };
  return { kind: catalog.nextStep(c.checkId, c.reviewed ? 'failed_reviewed' : 'failed'), action: null, reason: { key: 'report.next.failed' }, orByHand: false };
}

/** 12.7: the next step of one finding. */
export function nextStepOfFinding(catalog: Catalog, f: { checkId: string; ruleId: string; effect: string; proof: string; origin: string; location: FindingLocation | null; fromClaim: boolean }): NextStepInfo {
  if (f.effect === 'excluded') return { kind: 'none', action: null, reason: { key: 'report.next.excludedByReview' }, orByHand: false };
  if (f.ruleId.startsWith('guard.') || f.ruleId === 'review.expired' || f.ruleId === 'state.changed') return { kind: 'review', action: null, reason: { key: 'report.next.integrity' }, orByHand: false };
  if (f.ruleId === 'claim.unproven') return { kind: 'review', action: null, reason: { key: 'report.next.claimNoCheck' }, orByHand: false };
  if (f.ruleId === 'review.pending') return { kind: 'review', action: null, reason: { key: 'report.next.humanReview' }, orByHand: false };
  if (f.origin === 'tool' || f.origin === 'environment') return { kind: 'direct', action: 'setup', reason: { key: 'report.next.toolCause' }, orByHand: false };
  if (f.effect === 'review' || f.proof === 'suspected') return { kind: 'review', action: null, reason: { key: 'report.next.suspected' }, orByHand: false };
  if (f.effect === 'note' || f.proof === 'suggestion') {
    const cls = catalog.nextStep(f.checkId, 'warning');
    // code.complexity's suggestions go to the model by the catalog (12.7); other notes are information.
    return f.checkId === 'code.complexity' && cls === 'model' ? { kind: 'model', action: null, reason: { key: 'report.next.suggestion' }, orByHand: true } : { kind: 'none', action: null, reason: { key: 'report.next.info' }, orByHand: false };
  }
  if (f.effect === 'warning') return { kind: catalog.nextStep(f.checkId, 'warning'), action: null, reason: { key: 'report.next.warning' }, orByHand: true };
  return { kind: 'model', action: null, reason: { key: f.fromClaim ? 'report.next.provenClaim' : 'report.next.violation' }, orByHand: false };
}

export class ReportBuilder {
  readonly #d: BuildDeps;

  constructor(d: BuildDeps) {
    this.#d = d;
  }

  #run(runId: string): RunRow {
    const r = this.#d.db.get<RunRow>('SELECT id, display_id, project_id, kind, plan_json, profile_version, profile_hash, catalog_version, state, started_at, finished_at, snapshot_start_id, snapshot_end_id, counts_json, verdict, purity_json, round_id, state_changed FROM runs WHERE id = ?', runId);
    if (!r) throw new CommandError('not_found', { reason: 'run' });
    return r;
  }

  #checks(runId: string): CheckRow[] {
    return this.#d.db.all<CheckRow>('SELECT id, run_id, check_id, component, section, criterion, state, outcome, outcome_reason, auto_outcome, review_id, origin, command_json, cwd_rel, notes_json, raw_json, tests_json, duration_ms, findings_json FROM check_runs WHERE run_id = ? ORDER BY rowid', runId);
  }

  #findingsOfRun(runId: string): FindingRow[] {
    return this.#d.db.all<FindingRow>(
      "SELECT f.id, f.check_run_id, f.fingerprint, f.display_id, f.check_id, f.component, f.rule_id, f.rule_version, f.tool_rule_id, f.severity, f.proof, f.origin, f.title_key, f.message_redacted, f.location_json, f.expected_text, f.actual_text, f.evidence_ids_json, f.cross_run_status, f.review_id, f.effect, f.from_claim_id, m.display_id AS from_claim_display FROM findings f JOIN check_runs c ON c.id = f.check_run_id LEFT JOIN model_claims m ON m.id = f.from_claim_id WHERE c.run_id = ? ORDER BY f.rowid",
      runId,
    );
  }

  #findingsById(ids: readonly string[]): FindingRow[] {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return this.#d.db.all<FindingRow>(`SELECT f.id, f.check_run_id, f.fingerprint, f.display_id, f.check_id, f.component, f.rule_id, f.rule_version, f.tool_rule_id, f.severity, f.proof, f.origin, f.title_key, f.message_redacted, f.location_json, f.expected_text, f.actual_text, f.evidence_ids_json, f.cross_run_status, f.review_id, f.effect, f.from_claim_id, m.display_id AS from_claim_display FROM findings f LEFT JOIN model_claims m ON m.id = f.from_claim_id WHERE f.id IN (${marks})`, ...ids);
  }

  /** `FIX-YYYYMMDD-NNN`: a daily sequence per project in local time (14.2, D-36, G-23). */
  fixDisplayId(projectId: string): string {
    const d = this.#d.ports.clock.now();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const n = this.#d.db.all<{ display_id: string }>('SELECT display_id FROM reports WHERE project_id = ? AND display_id LIKE ?', projectId, `FIX-${day}-%`).reduce((m, r) => Math.max(m, Number(r.display_id.split('-')[2]) || 0), 0) + 1;
    return `FIX-${day}-${String(n).padStart(3, '0')}`;
  }

  async build(target: BuildTarget, options: ReportOptions, token: string): Promise<{ report: Report; projectId: string }> {
    const { db } = this.#d;
    let run: RunRow;
    let selected: FindingRow[] | null = null;
    let displayId: string;
    let card: string | null = null;
    let targetView: Report['target'];
    let cardChecks: string[] | null = null;
    if (target.kind === 'run') {
      run = this.#run(target.runId);
      displayId = run.display_id;
      targetView = { kind: 'run', runId: run.id };
    } else if (target.kind === 'findings') {
      const rows = this.#findingsById([...new Set(target.findingIds)]);
      if (rows.length !== new Set(target.findingIds).size) throw new CommandError('not_found', { reason: 'finding' });
      const runs = [...new Set(rows.map((r) => db.get<{ run_id: string }>('SELECT run_id FROM check_runs WHERE id = ?', r.check_run_id)!.run_id))];
      const projects = new Set(runs.map((id) => this.#run(id).project_id));
      if (projects.size !== 1) throw new CommandError('invalid_payload', { path: 'target.findingIds', reason: 'several_projects' });
      // The latest of their runs is the report's run; the findings of earlier runs are still reported with their own executions.
      run = runs.map((id) => this.#run(id)).sort((a, b) => (a.finished_at ?? '') < (b.finished_at ?? '') ? 1 : -1)[0]!;
      selected = rows;
      displayId = this.fixDisplayId(run.project_id);
      targetView = { kind: 'findings', findingIds: rows.map((r) => r.id) };
    } else {
      const t = db.get<{ id: string; display_id: string; project_id: string; body_json: string; follows: string | null }>('SELECT id, display_id, project_id, body_json, follows FROM tasks WHERE id = ?', target.taskId);
      if (!t) throw new CommandError('not_found', { reason: 'task' });
      const body = JSON.parse(t.body_json) as { text: string; verify: string[] };
      card = body.text;
      cardChecks = body.verify;
      const latest = db.get<{ id: string }>("SELECT id FROM runs WHERE project_id = ? AND state IN ('finished', 'interrupted') ORDER BY coalesce(finished_at, started_at, '') DESC LIMIT 1", t.project_id);
      if (!latest) throw new CommandError('not_found', { reason: 'run' });
      run = this.#run(latest.id);
      displayId = t.display_id;
      targetView = { kind: 'card', taskId: t.id, taskDisplayId: t.display_id };
      const followed = t.follows ? db.get<{ id: string }>('SELECT f.id FROM findings f JOIN finding_ids i ON i.fingerprint = f.fingerprint AND i.project_id = ? WHERE i.display_id = ? ORDER BY f.rowid DESC LIMIT 1', t.project_id, t.follows) : null;
      selected = followed ? this.#findingsById([followed.id]) : [];
    }
    const projectId = run.project_id;
    const plan = PlanSchema.safeParse(JSON.parse(run.plan_json));
    const purity = run.purity_json ? PuritySchema.safeParse(JSON.parse(run.purity_json)) : null;
    const purityResult: PurityResult | null = purity?.success ? purity.data : null;
    const specs = run.profile_version !== null ? new Map((profileAt(db, projectId, run.profile_version)?.content.checks ?? []).map((s) => [s.instance, s])) : new Map<string, CheckSpec>();
    const rows = this.#checks(run.id);
    const allFindings = this.#findingsOfRun(run.id);
    const manifest = run.snapshot_end_id ? await this.#d.evidence.snapshots.load(run.snapshot_end_id).catch(() => null) : run.snapshot_start_id ? await this.#d.evidence.snapshots.load(run.snapshot_start_id).catch(() => null) : null;

    const head = this.#head(run, plan.success ? plan.data : null, purityResult, rows, projectId);
    const wanted = cardChecks;
    const checkRows = wanted ? rows.filter((r) => wanted.includes(r.check_id)) : rows;
    const checks: ReportCheck[] = [];
    const notRun: ReportNotRun[] = [];
    for (const c of checkRows) {
      if (c.check_id.startsWith('integ.')) continue; // the integrity panel has them
      const spec = specs.get(`${c.check_id}@${c.component}`);
      const def = this.#d.catalog.check(c.check_id);
      const ownFindings = allFindings.filter((f) => f.check_run_id === c.id);
      const outcome = (c.outcome as CheckOutcome | null) ?? null;
      const reason = parseReason(c.outcome_reason);
      const reviewed = c.review_id !== null && c.auto_outcome !== null && c.auto_outcome !== c.outcome;
      const next = nextStepOfCheck(this.#d.catalog, { checkId: c.check_id, outcome, reason, origin: c.origin, reviewed, findings: ownFindings.map((f) => ({ effect: f.effect ?? 'note' })) });
      const raw = c.raw_json ? (JSON.parse(c.raw_json) as RawCheckResult) : null;
      const command = raw?.command ?? (c.command_json ? { argv: JSON.parse(c.command_json) as string[], cwd: c.cwd_rel ?? c.component } : null);
      const tests = c.tests_json ? (JSON.parse(c.tests_json) as { total: number; passed: number; failed: number; skipped: number; flaky: number }) : null;
      const line: ReportCheck = {
        instance: `${c.check_id}@${c.component}`,
        checkId: c.check_id,
        component: c.component,
        section: c.section ?? def?.section ?? 'custom',
        criterion: c.criterion ?? def?.criterion ?? null,
        checkRunId: c.id,
        outcome,
        reason,
        autoOutcome: reviewed ? ((c.auto_outcome as CheckOutcome | null) ?? null) : null,
        reviewed,
        required: spec?.required ?? false,
        blocking: spec?.blocking ?? false,
        origin: (c.origin as ReportCheck['origin']) ?? null,
        proves: outcome === 'passed' ? this.#proves(c, tests, ownFindings.length, manifest) : null,
        limitsKey: `catalog.check.${c.check_id.replace('*', 'any')}.limits`,
        cost: spec?.cost ?? def?.cost ?? 'local',
        nextStep: next,
        evidenceIds: this.#d.evidence.store.refsOf(c.id).map((e) => e.id),
        findingIds: ownFindings.map((f) => f.display_id),
        command,
        notes: c.notes_json ? (JSON.parse(c.notes_json) as string[]) : [],
        tests: tests ? { total: tests.total, passed: tests.passed, failed: tests.failed, skipped: tests.skipped, flaky: tests.flaky } : null,
        durationMs: c.duration_ms,
      };
      checks.push(line);
      if (outcome !== null && !['passed', 'failed', 'warning', 'needs_review', 'flaky'].includes(outcome)) notRun.push({ instance: line.instance, checkId: c.check_id, component: c.component, outcome, reason, nextStep: next, cost: line.cost });
    }

    // Findings: the chosen ones, or the run's (12.5 rule 4 ordering), never the integrity checks' own here.
    const chosen = (selected ?? allFindings.filter((f) => !f.check_id.startsWith('integ.'))).filter((f) => options.scope !== 'allFindings' || f.effect !== 'note');
    const blockingChecks = new Set(checks.filter((c) => c.blocking).map((c) => c.checkRunId));
    const findings: ReportFinding[] = [];
    for (const f of chosen) findings.push(await this.#finding(f, rows.find((c) => c.id === f.check_run_id) ?? null, blockingChecks.has(f.check_run_id), manifest));
    findings.sort((a, b) => {
      const ab = a.blocking && a.effect === 'violation' ? 0 : 1;
      const bb = b.blocking && b.effect === 'violation' ? 0 : 1;
      if (ab !== bb) return ab - bb;
      if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      const ap = a.proof === 'proven' ? 0 : a.proof === 'suspected' ? 1 : 2;
      const bp = b.proof === 'proven' ? 0 : b.proof === 'suspected' ? 1 : 2;
      if (ap !== bp) return ap - bp;
      const af = a.location?.path ?? '~';
      const bf = b.location?.path ?? '~';
      if (af !== bf) return af < bf ? -1 : 1;
      return (a.location?.line ?? 0) - (b.location?.line ?? 0);
    });

    const integrity = await this.#integrity(run, rows, allFindings, projectId, manifest);
    const limitsKeys = [...new Set(checks.filter((c) => c.outcome !== null && c.outcome !== 'not_applicable').map((c) => c.limitsKey))];
    const unproven = {
      limitsKeys,
      pendingReviews: checks.filter((c) => c.outcome === 'needs_review').map((c) => c.instance),
      notIncluded: plan.success ? plan.data.items.filter((i) => i.status === 'not_included').map((i) => i.instance) : [],
    };
    return {
      projectId,
      report: {
        schema: 'report/1',
        displayId,
        target: targetView,
        head,
        checks,
        findings,
        notRun,
        integrity,
        unproven,
        purity: purityResult,
        card,
        token,
      },
    };
  }

  #head(run: RunRow, plan: RunPlan | null, purity: PurityResult | null, rows: CheckRow[], projectId: string): ReportHead {
    const { db } = this.#d;
    const project = db.get<{ display_name: string }>('SELECT display_name FROM projects WHERE id = ?', projectId);
    const snapshot = latestSnapshot(db, projectId);
    const facts = snapshot?.facts ?? [];
    const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const git = obj(facts.find((f) => f.key === 'git.repository')?.value);
    const tools: Record<string, string> = {};
    for (const c of rows) {
      const raw = c.raw_json ? (JSON.parse(c.raw_json) as RawCheckResult) : null;
      Object.assign(tools, raw?.toolVersions ?? {});
    }
    const node = tools.node ?? (typeof obj(facts.find((f) => f.key === 'runtime.node')?.value).spec === 'string' ? (obj(facts.find((f) => f.key === 'runtime.node')?.value).spec as string) : null);
    const python = tools.python ?? (typeof obj(facts.find((f) => f.key === 'runtime.python')?.value).spec === 'string' ? (obj(facts.find((f) => f.key === 'runtime.python')?.value).spec as string) : null);
    const pm = obj(facts.find((f) => f.key === 'node.packageManager' || f.key === 'python.manager')?.value);
    const packageManager = typeof pm.name === 'string' ? `${pm.name}${typeof pm.version === 'string' ? ` ${pm.version}` : ''}` : null;
    const counts = run.counts_json ? (JSON.parse(run.counts_json) as { byOutcome: Partial<Record<CheckOutcome, number>> }).byOutcome : {};
    const round = run.round_id ? db.get<{ display_id: string }>('SELECT display_id FROM rounds WHERE id = ?', run.round_id)?.display_id ?? null : null;
    const sel = plan?.selection;
    const started = run.started_at ? new Date(run.started_at).getTime() : null;
    const finished = run.finished_at ? new Date(run.finished_at).getTime() : null;
    return {
      project: { id: projectId, name: project?.display_name ?? projectId, ecosystems: [...(advisorFactsFromSnapshot(snapshot).ecosystems ?? [])] },
      run: { id: run.id, displayId: run.display_id, kind: run.kind, startedAt: run.started_at, finishedAt: run.finished_at, durationMs: started !== null && finished !== null ? Math.max(0, finished - started) : null, roundDisplayId: round },
      scope: { kind: run.kind, section: sel?.kind === 'section' ? sel.section : null, instances: plan?.items.filter((i) => i.status === 'run' || i.status === 'shared' || i.status === 'covered').length ?? rows.length, criteria: purity?.criteriaCount ?? 0, checks: purity?.checksCount ?? 0 },
      verdict: purity?.verdict ?? null,
      karat: purity?.karat ?? null,
      narrow: purity?.narrow ?? false,
      counts,
      versions: { ayar: ENGINE_VERSION, profile: run.profile_version, profileHash: run.profile_hash, catalog: run.catalog_version ?? this.#d.catalog.version, template: 'model-report/1', tools },
      environment: { source: purity?.meta.environmentSource ?? null, os: `${process.platform} ${release()}`, node, python, packageManager },
      state: { branch: typeof git.branch === 'string' ? git.branch : null, commit: typeof git.commit === 'string' ? git.commit : null, dirty: run.state_changed === null ? null : run.state_changed === 1, snapshotId: run.snapshot_end_id ?? run.snapshot_start_id },
      createdAt: this.#d.ports.clock.now().toISOString(),
    };
  }

  /** 12.1 «ما أثبته إن اجتاز»: the success criterion that held, with its counts and scope. */
  #proves(c: CheckRow, tests: { total: number; passed: number; skipped: number } | null, findings: number, manifest: Manifest | null): ReportCheck['proves'] {
    const key = `catalog.check.${c.check_id.replace('*', 'any')}.proves`;
    const comp = c.component === '.' ? '' : `${c.component}/`;
    const files = manifest ? manifest.files.filter((f) => f[6] !== 'link' && (!comp || f[0].startsWith(comp))).length : 0;
    const params: Record<string, string | number> = { files, findings, component: c.component };
    if (tests) {
      params.tests = tests.total;
      params.passed = tests.passed;
      params.skipped = tests.skipped;
    }
    return { key, params, scope: c.component };
  }

  async #finding(f: FindingRow, c: CheckRow | null, blocking: boolean, manifest: Manifest | null): Promise<ReportFinding> {
    const location = f.location_json ? (JSON.parse(f.location_json) as FindingLocation) : null;
    const ruleId = f.rule_id ?? '';
    const raw = c?.raw_json ? (JSON.parse(c.raw_json) as RawCheckResult) : null;
    const command = raw?.command ?? (c?.command_json ? { argv: JSON.parse(c.command_json) as string[], cwd: c.cwd_rel ?? c.component } : null);
    const commandText = command ? `${command.cwd && command.cwd !== '.' ? `cd ${command.cwd} && ` : ''}${command.argv.join(' ')}` : null;
    const def = this.#d.catalog.check(f.check_id);
    const source = def?.sources[0] ? this.#d.catalog.sources.find((s) => s.id === def.sources[0]) : undefined;
    const fix: ReportFinding['fix'] = RULES_WITH_FIX.has(ruleId) ? { kind: 'suggested', key: `catalog.rule.${ruleId}.fix`, evidence: `${f.display_id}: ${location?.path ?? ''}${location?.line ? `:${location.line}` : ''}` } : { kind: 'diagnose', steps: ['report.diagnose.reproduce', 'report.diagnose.isolate', 'report.diagnose.evidence'] };
    const steps = [`report.reproduce.checkout`, ...(location?.path ? ['report.reproduce.open'] : []), 'report.reproduce.run'];
    return {
      id: f.id,
      displayId: f.display_id,
      fingerprint: f.fingerprint,
      checkId: f.check_id,
      component: f.component,
      checkRunId: f.check_run_id,
      ruleId,
      ruleVersion: f.rule_version ?? '',
      toolRuleId: f.tool_rule_id,
      titleKey: f.title_key,
      message: f.message_redacted ?? '',
      severity: f.severity,
      proof: f.proof,
      origin: f.origin,
      blocking,
      effect: (f.effect as ReportFinding['effect']) ?? 'note',
      crossRunStatus: (f.cross_run_status as ReportFinding['crossRunStatus']) ?? 'new',
      location,
      expected: f.expected_text,
      actual: f.actual_text,
      reproduce: { steps, command: commandText },
      evidence: await this.#excerpt(f, c, location, manifest),
      impactKey: `catalog.rule.${ruleId}.impact`,
      fix,
      acceptance: { key: 'report.acceptance.recheck', check: f.check_id },
      reference: source ? { name: source.id, url: source.url } : null,
      nextStep: nextStepOfFinding(this.#d.catalog, { checkId: f.check_id, ruleId, effect: f.effect ?? 'note', proof: f.proof, origin: f.origin, location, fromClaim: f.from_claim_id !== null }),
      reviewId: f.review_id,
      fromClaim: f.from_claim_display,
    };
  }

  /**
   * 12.1 «دليل مختصر»: the source lines around the place when the state snapshot kept the file's text; else the lines
   * of the execution's log that name the file or the problem, around the first error. Redacted text only comes here:
   * the snapshot stores no sensitive file, and the logs were redacted as they were written (D-46).
   */
  async #excerpt(f: FindingRow, c: CheckRow | null, location: FindingLocation | null, manifest: Manifest | null): Promise<ReportFinding['evidence']> {
    if (location?.path && !location.outside && manifest) {
      const entry = manifest.files.find((e) => e[0] === location.path);
      if (entry && entry[7]) {
        const text = await this.#d.evidence.snapshots.content(entry).catch(() => null);
        if (text !== null) {
          const ex = excerpt(text, { lines: EXCERPT_LINES, chars: EXCERPT_CHARS, aroundLine: location.line ?? null });
          return { evidenceId: null, source: location.path, range: ex.range, text: ex.text, truncated: ex.truncated };
        }
      }
    }
    if (!c) return null;
    const refs = this.#d.evidence.store.refsOf(c.id).filter((r) => r.kind === 'log');
    for (const name of ['stderr.log', 'stdout.log']) {
      const ref = refs.find((r) => r.relPath.endsWith(`/${name}`));
      if (!ref || ref.size === 0) continue;
      let text: string;
      try {
        const { data } = await this.#d.ports.fs.readFilePrefix(this.#d.evidence.store.absolute(ref.relPath), MAX_LOG_BYTES);
        text = new TextDecoder().decode(data);
      } catch {
        continue;
      }
      const needle = location?.path ? posix.basename(location.path) : null;
      const lines = text.split('\n');
      const hits: number[] = [];
      lines.forEach((l, i) => {
        if ((needle && l.includes(needle)) || (f.message_redacted && f.message_redacted.length > 12 && l.includes(f.message_redacted.slice(0, 40)))) hits.push(i + 1);
      });
      const ex = excerpt(text, { errorLines: hits.length ? hits : errorLines(text) });
      return { evidenceId: ref.id, source: name, range: ex.range, text: ex.text, truncated: ex.truncated || ref.truncated };
    }
    return null;
  }

  async #integrity(run: RunRow, rows: CheckRow[], findings: FindingRow[], projectId: string, manifest: Manifest | null): Promise<ReportIntegrity> {
    const { db } = this.#d;
    const integ = rows.filter((r) => r.check_id.startsWith('integ.'));
    const checks = integ.map((r) => ({ checkId: r.check_id, outcome: (r.outcome as CheckOutcome | null) ?? null, reason: parseReason(r.outcome_reason), findingIds: findings.filter((f) => f.check_run_id === r.id).map((f) => f.display_id) }));
    const live = (rule: string) => findings.filter((f) => integ.some((i) => i.id === f.check_run_id) && (f.rule_id ?? '').startsWith(rule) && f.effect !== 'excluded');
    const stateFindings = live('state.');
    const reviewsRows = db.all<{ id: string; target_type: string; target_ref: string; decision: string; scope_json: string; snapshot_id: string | null; created_at: string }>('SELECT id, target_type, target_ref, decision, scope_json, snapshot_id, created_at FROM reviews WHERE project_id = ? ORDER BY created_at DESC', projectId);
    const now = new Map((manifest?.files ?? []).map((f) => [f[0], f[5]]));
    const reviews: ReportIntegrity['reviews'] = [];
    for (const r of reviewsRows) reviews.push({ id: r.id, target: `${r.target_type}:${r.target_ref}`, decision: r.decision, valid: manifest ? !(await this.#d.integrity.reviewExpired(r, now)).expired : true, createdAt: r.created_at });
    const claimRows = db.all<{ id: string; display_id: string; ai_display: string; template_id: string; kind: string | null; severity_suggested: Severity | null; location_json: string | null; summary_redacted: string | null; match_status: string | null; matched_check_id: string | null; proven_display: string | null }>(
      'SELECT m.id, m.display_id, a.display_id AS ai_display, a.template_id, m.kind, m.severity_suggested, m.location_json, m.summary_redacted, m.match_status, m.matched_check_id, f.display_id AS proven_display FROM model_claims m JOIN ai_checks a ON a.id = m.ai_check_id LEFT JOIN findings f ON f.id = m.proven_finding_id WHERE a.project_id = ? ORDER BY m.display_id',
      projectId,
    );
    const claims: ReportClaim[] = claimRows.map((c) => {
      const status: ReportClaim['status'] = c.match_status === 'proven' || c.match_status === 'decided_card' || c.match_status === 'decided_not_issue' ? c.match_status : 'open';
      const provable = c.matched_check_id !== null;
      return {
        displayId: c.display_id,
        aiCheckDisplayId: c.ai_display,
        template: c.template_id,
        kind: (c.kind as ReportClaim['kind'] | null) ?? 'suspicion',
        severitySuggested: c.severity_suggested,
        location: c.location_json ? (JSON.parse(c.location_json) as FindingLocation) : null,
        summary: c.summary_redacted ?? '',
        status,
        matchedCheckId: c.matched_check_id,
        provenFindingDisplayId: c.proven_display,
        // 12.7: a claim a local check could prove → «أثبِت بإعادة الفحص»; one no check covers → «راجع وقرّر».
        nextStep: status === 'open' ? { kind: provable ? 'direct' : 'review', action: provable ? 'recheck' : null, reason: { key: provable ? 'report.next.claimRecheck' : 'report.next.claimNoCheck' }, orByHand: false } : { kind: 'none', action: null, reason: { key: status === 'proven' ? 'report.next.claimProven' : 'report.next.claimDecided' }, orByHand: false },
      };
    });
    const guardUnreviewed = live('guard.').length;
    const claimsOpen = live('claim.').length;
    const reviewsExpired = live('review.expired').length;
    const stateChanged = run.state_changed === 1 || stateFindings.length > 0;
    const blocksPure = checks.filter((c) => c.outcome !== null && c.outcome !== 'passed' && c.outcome !== 'not_applicable').length;
    return {
      checks,
      stateChanged,
      changedFiles: stateFindings.map((f) => (f.location_json ? ((JSON.parse(f.location_json) as FindingLocation).path ?? '') : '')).filter(Boolean),
      guardUnreviewed,
      claimsOpen,
      reviewsExpired,
      reviews,
      claims,
      blocksPure,
    };
  }
}
