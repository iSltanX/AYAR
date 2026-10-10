// C-12 the executor, and the run list of C-17: run.start, run.cancel, runs.list, run.get, runs.keep, runs.delete,
// internal.prepareQuit. A run starts from a frozen plan (9.5 point 5): the specs are checked again against their
// approvals, the initial state snapshot is taken, and the scheduler runs the plan by its dependencies, its locks
// and the concurrency (two light or medium checks at once, a heavy or very heavy one alone, G-34). Each check gets
// its folders, a supervised process, its redacted logs, its side effects, its raw reports redacted into the
// evidence store (D-46); a covered check inherits the covering execution (D-24), a shared one the very same raw
// result (D-45), and a check whose dependency did not succeed is «تُخطّي». What the process itself says —
// cancelled, timed out, interrupted, missing, unavailable — is rule 1 of 7.3 and is written as it is; a process that
// ran to its end is judged (DEV-6): its adapter reads the kept reports in a worker thread, the classifier (C-16)
// gives the outcome by the ordered rules, and its findings are kept with it in the same transaction. An analyzer
// (C-13) runs inside the engine, in a worker thread, with no process. When the run ends, C-19 computes its index
// (9.10). Every state change is saved before its event is sent.
import type { Catalog } from '@ayar/catalog';
import { adapterById } from '@ayar/adapters';
import type { CheckOutcome, CheckRunDetail, CheckRunView, CheckSpec, EvidenceRef, PlanItem, RawCheckResult, Reason, RunCounts, RunDetail, RunList, RunPlan, RunView, SideEffects, VerdictCounts } from '@ayar/protocol';
import { RawCheckResult as RawSchema, RunPlan as PlanSchema } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { computeChildEnv } from '../environment/child-env.ts';
import type { EnvironmentService } from '../environment/service.ts';
import { trackedPaths } from '../evidence/git-index.ts';
import type { EvidenceService } from '../evidence/service.ts';
import { diffManifests, underAny, type Manifest } from '../evidence/snapshot.ts';
import { CommandError } from '../host/errors.ts';
import type { EventBus } from '../host/event-bus.ts';
import { newId } from '../host/ids.ts';
import type { RunGate } from '../host/run-gate.ts';
import type { EnginePorts, FileWriter, Logger } from '../ports/index.ts';
import { latestSnapshot } from '../profile/service.ts';
import { approvalsOf, latestProfile } from '../profile/store.ts';
import type { PlannerService } from '../planner/service.ts';
import type { ProjectsService } from '../projects/service.ts';
import type { PurityService } from '../purity/service.ts';
import type { RedactionService } from '../redaction/service.ts';
import { requiresApproval, runsProjectCommand } from '../setup/readiness.ts';
import { recordAudit } from '../storage/audit.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import { readSettings } from '../storage/settings.ts';
import type { ToolsService } from '../tools/service.ts';
import { reportEvidence, type JudgeRequest, type Judgement, type ReportInput, type VerdictService } from '../verdict/service.ts';
import { resolveInvocation } from './invocation.ts';
import { streamSink, type OutputTotals } from './output.ts';
import { NOGIT_LOG, prepare } from './prepare.ts';
import type { ProcessResult, ProcessSupervisor, RunningProcess } from './process.ts';
import { CompanionServices } from './services.ts';

/** At most this many provisional findings are sent per execution (9.6 point 5: the final reading decides). */
const PROVISIONAL_MAX = 200;
/** A raw report is read with a limit (C-15): 50 MB; beyond it, the part read is kept and the report is not judged. */
export const REPORT_READ_LIMIT = 50 * 1024 * 1024;

export interface RunServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  layout: DataLayout;
  logger: Logger;
  events: EventBus;
  runGate: RunGate;
  planner: PlannerService;
  projects: ProjectsService;
  environment: EnvironmentService;
  redaction: RedactionService;
  evidence: EvidenceService;
  tools: ToolsService;
  supervisor: ProcessSupervisor;
  /** C-15 and C-16 (DEV-6): reading the reports and judging them. */
  verdict: VerdictService;
  /** C-19 (DEV-6): the index at the end of a run. */
  purity: PurityService;
  /** K4: a setup action of this project is running (its dependencies half installed): no run starts meanwhile. */
  setupActive?: (projectId: string) => boolean;
}

interface RunRow {
  id: string;
  display_id: string;
  project_id: string;
  kind: RunView['kind'];
  plan_json: string;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  snapshot_start_id: string | null;
  snapshot_end_id: string | null;
  counts_json: string | null;
  verdict: string | null;
  keep_forever: number;
  plan_id: string | null;
  cancel_reason: string | null;
  prevent_sleep: number | null;
  state_changed: number | null;
}

interface CheckRunRow {
  id: string;
  run_id: string;
  check_id: string;
  component: string;
  state: string;
  outcome: string | null;
  outcome_reason: string | null;
  readiness: string | null;
  covered_by_check_run_id: string | null;
  shared_invocation_key: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  signal: string | null;
  attempt: number;
  previous_check_run_id: string | null;
  last_activity_at: string | null;
  notes_json: string | null;
  raw_json: string | null;
  auto_outcome: string | null;
  review_id: string | null;
  origin: string | null;
  findings_json: string | null;
}

interface Exec {
  instance: string;
  checkRunId: string;
  item: PlanItem;
  state: 'pending' | 'running' | 'done';
  /** Succeeded, for its dependants (7.3 rule 2): «اجتاز» or «تحذير». */
  ok: boolean;
  outcome: CheckOutcome | null;
  raw: RawCheckResult | null;
  /** What its reading was made of: a shared execution (D-45) is judged again from it, by its own check's rules. */
  judged: { req: JudgeRequest; evidenceIds: string[] } | null;
}

/** The judgement of an execution, kept with its outcome (DEV-6). */
interface Verdict {
  judgement: Judgement;
  evidenceIds: string[];
  reader: { id: string; version: string; formats: string[] } | null;
}

interface CheckContext {
  projectId: string;
  root: string;
  sideEffects: boolean;
  declared: (p: string) => boolean;
  /** FR-36: the outputs the profile declares (code.build's adapter reads them). */
  outputs: string[];
  lastManifest: Manifest;
  /** The run's inventory (its initial snapshot, .gitignore honoured), relative to the root. */
  inventory: string[];
  /** The specs as the project's files said at the start of the run (a shared or covered execution is judged by them). */
  specs: Map<string, CheckSpec>;
}

interface Active {
  runId: string;
  projectId: string;
  plan: RunPlan;
  cancel: 'user' | 'app_quit' | null;
  procs: Map<string, RunningProcess>;
  cancelledChecks: Set<string>;
  services: CompanionServices | null;
  /** Checks waiting for their companion services: a cancel wakes them (FR-21, 9.7). */
  waiting: Map<string, AbortController>;
  /** Checks whose process has ended and whose result is being recorded. */
  collecting: Set<string>;
  /** Aborted when the app quits: a report still being read is dropped, and the run ends the short way. */
  quit: AbortController;
  wake: () => void;
}

/**
 * C-12 point 3 and FR-55 at «ابدأ» and again right before each launch: why an instance may not start now, from
 * its spec as the project's files say now, its approval, and the project's trust; or null. It fails closed: a spec
 * that is gone, refused (sudo), changed since its approval, or a project command in «مشروع غير موثوق» never runs.
 */
export function launchBlock(spec: CheckSpec | undefined, approvedHash: string | undefined, untrusted: boolean): [CheckOutcome, Reason] | null {
  if (!spec) return ['unavailable', { key: 'run.reason.specMissing' }];
  if (!spec.applicable) return ['not_applicable', { key: 'plan.reason.notApplicable' }];
  if (!spec.enabled) return ['skipped', { key: 'plan.reason.disabled' }];
  if (untrusted && runsProjectCommand(spec)) return ['missing', { key: 'setup.reason.untrusted' }];
  if (spec.refused.length) return ['missing', { key: 'setup.reason.refused', params: { categories: spec.refused.join(', ') } }];
  if (requiresApproval(spec) && approvedHash !== spec.specHash) return ['missing', { key: 'run.reason.specChangedSinceApproval' }];
  return null;
}

const TERMINAL_RUN = ['finished', 'interrupted'];

/**
 * The steps of one execution as one result: how it ended (the first step that did not end on its own, or the
 * cancel or timeout that came between steps), the exit of the first step that did not exit with 0 (else the last),
 * and the sums and peaks of its time, resources, sleeps and leftovers.
 */
export function aggregate(results: readonly ProcessResult[], unfinished: 'cancelled' | 'timed_out' | null, startedAt: Date, now: Date): ProcessResult {
  const decisive = results.find((x) => x.ended !== 'exited' || x.exitCode !== 0) ?? results.at(-1);
  const r: ProcessResult = {
    ended: results.find((x) => x.ended !== 'exited')?.ended ?? unfinished ?? 'exited',
    exitCode: decisive?.exitCode ?? null,
    signal: decisive?.signal ?? null,
    spawnError: results.find((x) => x.spawnError)?.spawnError ?? null,
    pid: results.at(-1)?.pid ?? null,
    startedAt: results[0]?.startedAt ?? startedAt,
    finishedAt: results.at(-1)?.finishedAt ?? now,
    durationMs: results.reduce((n, x) => n + x.durationMs, 0),
    lastActivityAt: [...results].reverse().find((x) => x.lastActivityAt)?.lastActivityAt ?? null,
    sleepGaps: results.flatMap((x) => x.sleepGaps),
    resources: {
      samples: results.reduce((n, x) => n + x.resources.samples, 0),
      peakRssKb: Math.max(0, ...results.map((x) => x.resources.peakRssKb)),
      maxCpuPercent: Math.max(0, ...results.map((x) => x.resources.maxCpuPercent)),
      lastCpuPercent: results.at(-1)?.resources.lastCpuPercent ?? 0,
    },
    leftovers: { groupKilled: results.reduce((n, x) => n + x.leftovers.groupKilled, 0), tokenKilled: results.reduce((n, x) => n + x.leftovers.tokenKilled, 0), escapeSuspected: results.flatMap((x) => x.leftovers.escapeSuspected) },
    escalation: results.flatMap((x) => x.escalation),
  };
  // A cancel or a timeout between two steps: the execution did not complete.
  if (r.ended === 'exited' && unfinished) r.ended = unfinished;
  return r;
}

export class RunService {
  readonly #o: RunServiceOptions;
  readonly #active = new Map<string, Active>();
  readonly #queued = new Map<string, Promise<void>>();

  constructor(o: RunServiceOptions) {
    this.#o = o;
  }

  /** Is any run active (the engine stopping must end it the short way first)? */
  hasActive(): boolean {
    return this.#active.size > 0;
  }

  /** Is a run of this project running or waiting (a setup action, a removal must wait for it)? */
  busy(projectId: string): boolean {
    return [...this.#active.values()].some((a) => a.projectId === projectId) || this.#o.db.get<{ n: number }>("SELECT count(*) AS n FROM runs WHERE project_id = ? AND state IN ('queued', 'running', 'cancelling')", projectId)!.n > 0;
  }

  #now(): string {
    return this.#o.ports.clock.now().toISOString();
  }

  /** RUN-YYYYMMDD-NNN, a daily sequence per project in local time (14.2, D-36). */
  #displayId(projectId: string): string {
    const d = this.#o.ports.clock.now();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rows = this.#o.db.all<{ display_id: string }>("SELECT display_id FROM runs WHERE project_id = ? AND display_id LIKE ?", projectId, `RUN-${day}-%`);
    const n = rows.reduce((m, r) => Math.max(m, Number(r.display_id.split('-')[2]) || 0), 0) + 1;
    return `RUN-${day}-${String(n).padStart(3, '0')}`;
  }

  // ── run.start ────────────────────────────────────────────────────────────────────────────────────────────

  async start(planId: string): Promise<RunView> {
    const { db, ports, planner } = this.#o;
    const { plan, frozen } = planner.get(planId);
    if (frozen) throw new CommandError('plan_stale', { reason: 'frozen' });
    const profile = latestProfile(db, plan.projectId);
    if (!profile || profile.version !== plan.profileVersion || profile.contentHash !== plan.profileHash) throw new CommandError('plan_stale', { reason: 'profile_changed' });
    await this.#o.projects.view(plan.projectId);
    // Checked in the same turn as the run is written (the setup service checks runs the same way): never both.
    if (this.#o.setupActive?.(plan.projectId)) throw new CommandError('busy', { reason: 'setup_running' });
    const runId = newId(ports.random, 'run');
    const preventSleep = readSettings(db, ['run.preventSleep'])['run.preventSleep'] ?? true;
    const prev = plan.previousRunId ? new Map(db.all<{ id: string; check_id: string; component: string; attempt: number }>('SELECT id, check_id, component, attempt FROM check_runs WHERE run_id = ?', plan.previousRunId).map((r) => [`${r.check_id}@${r.component}`, r])) : new Map();
    db.transaction(() => {
      db.run(
        "INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, catalog_version, purity_formula, state, keep_forever, plan_id, prevent_sleep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)",
        runId,
        this.#displayId(plan.projectId),
        plan.projectId,
        plan.kind,
        JSON.stringify(plan.selection),
        JSON.stringify(plan),
        plan.profileVersion,
        plan.profileHash,
        plan.catalogVersion,
        this.#o.catalog.manifest.purityFormula,
        planId,
        preventSleep ? 1 : 0,
      );
      planner.freeze(planId, runId);
      for (const it of plan.items) {
        if (it.status === 'not_included') continue; // 7.5: no execution for what the profile left out
        const p = prev.get(it.instance) as { id: string; attempt: number } | undefined;
        const final = it.status === 'not_applicable' ? 'not_applicable' : it.status === 'missing' || it.status === 'untrusted' ? 'missing' : null;
        const reason = final ? (it.reasons[0] ?? { key: final === 'missing' ? 'run.reason.notReady' : 'plan.reason.notApplicable' }) : null;
        db.run(
          'INSERT INTO check_runs (id, run_id, check_id, check_version, section, criterion, readiness, readiness_reason, component, state, outcome, outcome_reason, shared_invocation_key, command_json, cwd_rel, attempt, previous_check_run_id, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          newId(ports.random, 'chk'),
          runId,
          it.checkId,
          it.checkVersion,
          it.section,
          it.criterion,
          it.readiness,
          it.reasons.length ? JSON.stringify(it.reasons) : null,
          it.component,
          final ? 'finished' : 'planned',
          final,
          reason ? JSON.stringify(reason) : null,
          it.sharedInvocationKey,
          it.command ? JSON.stringify(it.command.argv) : null,
          it.command?.cwd ?? null,
          p ? p.attempt + 1 : 1,
          p?.id ?? null,
          final ? this.#now() : null,
        );
      }
      recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'run.started', projectId: plan.projectId, details: { runId, planId, kind: plan.kind, checks: plan.items.filter((i) => i.status === 'run').length } });
    });
    this.#emitRun(runId);
    for (const c of this.#checkRows(runId)) this.#o.events.emit('check.state', this.#checkView(c));
    const position = this.#o.runGate.request(runId);
    if (position === 0) this.#launch(runId);
    else this.#emitRun(runId);
    return this.view(runId);
  }

  #launch(runId: string): void {
    const p = this.#execute(runId)
      .catch((e: unknown) => {
        this.#o.logger.log('error', 'run failed unexpectedly', { runId, error: e instanceof Error ? (e.stack ?? e.message).slice(0, 1000) : String(e) });
        try {
          this.#o.db.run("UPDATE check_runs SET state = 'finished', outcome = coalesce(outcome, 'unavailable'), outcome_reason = coalesce(outcome_reason, ?), finished_at = coalesce(finished_at, ?) WHERE run_id = ? AND state <> 'finished'", JSON.stringify({ key: 'run.reason.internal' }), this.#now(), runId);
          this.#o.db.run("UPDATE runs SET state = 'finished', finished_at = ? WHERE id = ?", this.#now(), runId);
          this.#emitRun(runId);
        } catch {
          /* the database went away: the next boot marks it interrupted */
        }
      })
      .finally(() => {
        this.#active.delete(runId);
        const next = this.#o.runGate.release(runId);
        if (next) this.#launch(next);
        for (const q of this.#o.runGate.snapshot().queue) this.#emitRun(q);
      });
    this.#queued.set(runId, p);
    void p.finally(() => this.#queued.delete(runId));
  }

  async #execute(runId: string): Promise<void> {
    const { db, ports, evidence, projects } = this.#o;
    const row = db.get<RunRow>('SELECT * FROM runs WHERE id = ?', runId)!;
    const plan = PlanSchema.parse(JSON.parse(row.plan_json));
    const projectId = plan.projectId;
    let wake = () => {};
    const active: Active = { runId, projectId, plan, cancel: null, procs: new Map(), cancelledChecks: new Set(), services: null, waiting: new Map(), collecting: new Set(), quit: new AbortController(), wake: () => wake() };
    this.#active.set(runId, active);
    // A run cancelled while it waited in the queue never starts.
    if (db.get<{ state: string }>('SELECT state FROM runs WHERE id = ?', runId)!.state !== 'queued') return;
    db.run("UPDATE runs SET state = 'running', started_at = ? WHERE id = ?", this.#now(), runId);
    this.#emitRun(runId);
    const project = await projects.view(projectId);
    const root = project.rootPath;

    // 9.5 point 5 and C-12 point 3: every spec checked again against its approval, from the files as they are now.
    const approvals = approvalsOf(db, projectId);
    const fresh = await this.#freshSpecs(projectId);
    const execs = new Map<string, Exec>();
    for (const c of this.#checkRows(runId)) {
      const instance = `${c.check_id}@${c.component}`;
      const item = plan.items.find((x) => x.instance === instance)!;
      execs.set(instance, { instance, checkRunId: c.id, item, state: c.state === 'finished' ? 'done' : 'pending', ok: false, outcome: (c.outcome as CheckOutcome | null) ?? null, raw: null, judged: null });
    }
    if (!fresh) {
      // Fails closed: the project's files could not be read again (a root replaced by a link, D-05; a folder gone),
      // so nothing is launched, and no snapshot follows the path either.
      for (const e of execs.values()) if (e.state === 'pending') this.#finishCheck(e, 'unavailable', { key: 'run.reason.specNotVerified' }, null, []);
      db.run("UPDATE runs SET state = 'finished', finished_at = ?, counts_json = ? WHERE id = ?", this.#now(), JSON.stringify(this.#counts(runId)), runId);
      this.#emitRun(runId);
      return;
    }
    // A run that waited in the queue meets the trust and approvals of now, not of its plan (FR-55, D-33).
    const untrusted = this.#untrusted(projectId);
    for (const e of execs.values()) {
      if (e.state !== 'pending' || e.item.status !== 'run') continue;
      const block = launchBlock(fresh.get(e.instance), approvals.get(e.instance)?.specHash, untrusted);
      if (block) this.#finishCheck(e, block[0], block[1], null, []);
    }

    // 9.5 point 5: the initial state; a full scan hashes everything (E-25, C-17).
    const full = plan.kind === 'full' || plan.kind === 'continue_round';
    const settings = evidence.settings();
    const startManifest = await this.#snapshot(projectId, root, full, settings.storeContent, null);
    const startId = await evidence.snapshots.persist(projectId, startManifest, 'run_start');
    db.run('UPDATE runs SET snapshot_start_id = ? WHERE id = ?', startId, runId);

    // Services of this run share the child environment of the login shell, without sensitive variables.
    const base = await this.#o.environment.base();
    const serviceEnv = computeChildEnv({ login: base.env, rules: this.#o.redaction.names(), allowSensitive: [], explicit: {} }).env;
    await ports.fs.mkdir(posix.join(this.#o.layout.tmp, runId), 0o700);
    active.services = new CompanionServices({ ports, supervisor: this.#o.supervisor, redaction: this.#o.redaction, projectRoot: root, env: serviceEnv, runId, tmpDir: posix.join(this.#o.layout.tmp, runId) });
    const parallel = readSettings(db, ['run.parallel'])['run.parallel'] ?? 2;
    const sideEffects = readSettings(db, ['run.sideEffects'])['run.sideEffects'] ?? true;
    const ctx: CheckContext = {
      projectId,
      root,
      sideEffects,
      declared: this.#declared(projectId, plan),
      outputs: this.#outputs(projectId),
      lastManifest: startManifest,
      inventory: startManifest.files.filter((f) => f[6] !== 'link').map((f) => f[0]),
      specs: fresh,
    };

    // The scheduler: order, dependencies, locks, concurrency.
    const order = plan.order.filter((x) => execs.get(x)?.state === 'pending');
    const pending = [...order];
    const running = new Map<string, Promise<void>>();
    while (pending.length || running.size) {
      if (active.cancel) {
        for (const x of pending.splice(0)) this.#finishCheck(execs.get(x)!, 'cancelled', { key: active.cancel === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }, null, []);
      }
      let progressed = false;
      for (let n = 0; n < pending.length; n++) {
        const inst = pending[n]!;
        const e = execs.get(inst)!;
        if (active.cancelledChecks.has(e.checkRunId)) {
          this.#finishCheck(e, 'cancelled', { key: 'run.reason.cancelledByUser' }, null, []);
          pending.splice(n--, 1);
          progressed = true;
          continue;
        }
        const deps = e.item.dependsOn.map((d) => execs.get(d)).filter((d): d is Exec => d !== undefined);
        if (deps.some((d) => d.state !== 'done')) continue;
        const failed = deps.find((d) => !d.ok);
        if (failed) {
          this.#finishCheck(e, 'skipped', { key: 'run.reason.dependencyFailed', params: { dependency: failed.instance } }, null, []);
          pending.splice(n--, 1);
          progressed = true;
          continue;
        }
        if (e.item.status === 'covered' || e.item.status === 'shared') {
          const source = e.item.status === 'covered' ? execs.get(e.item.coveredBy ?? '') : [...execs.values()].find((x) => x.item.status === 'run' && x.item.sharedInvocationKey === e.item.sharedInvocationKey);
          if (source && source.state !== 'done') continue;
          // 9.4 point 5 at the launch: a source the gate stopped (it never ran: «ناقص» or «تعذّر» with no result)
          // gives nothing to inherit, so the covered or shared instance runs on its own, through the same gate.
          if (source && source.raw === null && (source.outcome === 'missing' || source.outcome === 'unavailable')) {
            e.item = { ...e.item, status: 'run', coveredBy: null, sharedInvocationKey: null, reasons: [] };
          } else {
            pending.splice(n--, 1);
            progressed = true;
            e.state = 'running';
            // A shared execution is judged again by its own check's rules (a worker job): it waits like a check.
            running.set(
              inst,
              this.#inherit(active, e, source ?? null, ctx)
                .catch((err: unknown) => {
                  this.#o.logger.log('error', 'inheritance failed unexpectedly', { instance: inst, error: err instanceof Error ? (err.stack ?? err.message).slice(0, 800) : String(err) });
                  if (e.state !== 'done') this.#finishCheck(e, 'unavailable', { key: 'run.reason.internal' }, null, []);
                })
                .finally(() => {
                  e.state = 'done';
                  running.delete(inst);
                  wake();
                }),
            );
            continue;
          }
        }
        const heavy = e.item.locks.includes('heavy');
        const locks = new Set(e.item.locks.filter((l) => l !== 'heavy'));
        const busyHeavy = [...running.keys()].some((r) => execs.get(r)!.item.locks.includes('heavy'));
        const conflict = [...running.keys()].some((r) => execs.get(r)!.item.locks.some((l) => locks.has(l)));
        if (heavy ? running.size > 0 : running.size >= parallel || busyHeavy || conflict) {
          if (heavy) break; // a heavy check waits for the others to drain, and nothing overtakes it (G-34)
          continue;
        }
        e.state = 'running';
        pending.splice(n--, 1);
        progressed = true;
        running.set(
          inst,
          this.#runCheck(active, e, ctx)
            .catch((err: unknown) => {
              this.#o.logger.log('error', 'check failed unexpectedly', { instance: inst, error: err instanceof Error ? (err.stack ?? err.message).slice(0, 800) : String(err) });
              if (e.state !== 'done') this.#finishCheck(e, 'unavailable', { key: 'run.reason.internal' }, null, []);
            })
            .finally(() => {
              e.state = 'done';
              running.delete(inst);
              wake();
            }),
        );
        if (heavy) break;
      }
      if (!pending.length && !running.size) break;
      if (!progressed && !running.size) {
        // Nothing runs and nothing can start (a cycle the plan did not see): the rest ends «تعذّر», never a hang
        // that would hold the one run slot (D-33) until a restart.
        this.#o.logger.log('error', 'scheduler stalled: the remaining checks cannot start', { runId, pending: pending.length });
        for (const x of pending.splice(0)) this.#finishCheck(execs.get(x)!, 'unavailable', { key: 'run.reason.internal' }, null, []);
        break;
      }
      if (!progressed) await new Promise<void>((r) => (wake = r));
    }
    await active.services.stopAll(active.cancel === 'app_quit' ? 'quit' : 'cancel');

    // 9.9: the final state; a change outside the declared outputs marks the run «تغيرت الحالة أثناء الفحص».
    const endManifest = await this.#snapshot(projectId, root, full, settings.storeContent, startManifest);
    const endId = await evidence.snapshots.persist(projectId, endManifest, 'run_end');
    const change = diffManifests(startManifest, endManifest, { declared: ctx.declared, tracked: await trackedPaths(ports.fs, root) });
    const changed = [...change.created, ...change.modified, ...change.deleted].some((p) => !ctx.declared(p));
    await ports.fs.remove(posix.join(this.#o.layout.tmp, runId));
    db.run('UPDATE runs SET snapshot_end_id = ?, state_changed = ?, cancel_reason = ? WHERE id = ?', endId, changed ? 1 : 0, active.cancel, runId);
    // 9.10: the index of the round or the section (a cancelled check counts for nothing: «غير مكتمل» says why).
    const purity = await this.#o.purity.afterRun(runId, ctx.declared).catch((e: unknown) => {
      this.#o.logger.log('error', 'the purity index could not be computed', { runId, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      return null;
    });
    db.transaction(() => {
      db.run("UPDATE runs SET state = 'finished', finished_at = ?, counts_json = ? WHERE id = ?", this.#now(), JSON.stringify(this.#counts(runId)), runId);
      if (active.cancel) recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'run.cancelled', projectId, details: { runId, reason: active.cancel } });
    });
    this.#emitRun(runId);
    this.#o.events.emit('run.summary', { runId, purity: purity ? this.#o.purity.summaryOf(runId) : null, counts: this.#counts(runId), findings: db.get<{ n: number }>('SELECT count(*) AS n FROM findings f JOIN check_runs c ON c.id = f.check_run_id WHERE c.run_id = ?', runId)?.n ?? 0 });
    // Retention waits for the next run (or the weekly pass) when the app is quitting: the quit stays short.
    if (active.cancel !== 'app_quit') await evidence.retain(projectId).catch((e: unknown) => this.#o.logger.log('error', 'retention failed', { error: e instanceof Error ? e.message : String(e) }));
  }

  /** The specs as the project's files say now, or null when they cannot be read (the caller fails closed). */
  async #freshSpecs(projectId: string): Promise<Map<string, CheckSpec> | null> {
    try {
      return new Map((await this.#o.projects.freshSpecs(projectId)).map((s) => [s.instance, s]));
    } catch (e) {
      this.#o.logger.log('warn', 'specs could not be checked again: nothing is launched', { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  /** «مشروع غير موثوق» as the profile says now (D-DEV4-04). */
  #untrusted(projectId: string): boolean {
    return latestProfile(this.#o.db, projectId)?.content.untrusted === true;
  }

  async #snapshot(projectId: string, root: string, full: boolean, store: boolean, previous: Manifest | null): Promise<Manifest & { pinned?: string[] }> {
    const s = this.#o.evidence.settings();
    const prior = previous ?? (await this.#lastManifest(projectId));
    return this.#o.evidence.snapshots.take({ root, full, storeContent: store, previous: prior, maxEntries: s.maxEntries, maxDepth: s.maxDepth });
  }

  async #lastManifest(projectId: string): Promise<Manifest | null> {
    const last = this.#o.db.get<{ id: string }>('SELECT id FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId);
    return last ? this.#o.evidence.snapshots.load(last.id).catch(() => null) : null;
  }

  /** FR-36: what the project may write — the profile's `outputs` and the output folders discovery found. */
  #declared(projectId: string, plan: RunPlan): (p: string) => boolean {
    void plan;
    const outputDirs = latestSnapshot(this.#o.db, projectId)?.inventory.outputDirs.map((d) => d.path) ?? [];
    return underAny([...this.#outputs(projectId), ...outputDirs]);
  }

  /** FR-36: the outputs the profile declares. */
  #outputs(projectId: string): string[] {
    const raw = latestProfile(this.#o.db, projectId)?.content.references.outputs;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : typeof raw === 'string' ? [raw] : [];
  }

  // ── one check ────────────────────────────────────────────────────────────────────────────────────────────

  async #runCheck(active: Active, e: Exec, ctx: CheckContext): Promise<void> {
    const { db, ports, evidence, layout } = this.#o;
    const runId = active.runId;
    db.run("UPDATE check_runs SET state = 'running', started_at = ? WHERE id = ?", this.#now(), e.checkRunId);
    this.#o.events.emit('check.state', this.#checkView(this.#checkRow(e.checkRunId)));

    // C-12 point 3, again right before the launch: the spec as the files say now is the one that runs, if it may.
    const fresh = await this.#freshSpecs(ctx.projectId);
    if (!fresh) return this.#finishCheck(e, 'unavailable', { key: 'run.reason.specNotVerified' }, null, []);
    const spec = fresh.get(e.instance);
    const block = launchBlock(spec, approvalsOf(db, ctx.projectId).get(e.instance)?.specHash, this.#untrusted(ctx.projectId));
    if (block || !spec) {
      const [outcome, reason] = block ?? ['unavailable', { key: 'run.reason.specMissing' }];
      return this.#finishCheck(e, outcome, reason, null, []);
    }
    // An analyzer (C-13) runs inside the engine, in a worker thread: no process, no folder, no service.
    if (spec.runner.kind === 'analyzer') return this.#runAnalyzer(active, e, ctx, spec);

    // Its folders (C-12 point 2): the raw reports and its TMPDIR, inside AYAR's tmp/, never in the evidence store.
    const tmpRoot = posix.join(layout.tmp, e.checkRunId);
    const reportsDir = posix.join(tmpRoot, 'reports');
    const tmpDir = posix.join(tmpRoot, 'tmp');
    for (const d of [tmpRoot, reportsDir, tmpDir]) {
      await ports.fs.mkdir(d, 0o700);
      await ports.fs.chmod(d, 0o700);
    }
    const tool = e.item.tool?.source === 'managed' || e.item.tool?.source === 'system' ? await this.#o.tools.locate(e.item.tool.key).catch(() => null) : null;
    const base = await this.#o.environment.base();
    const inv = resolveInvocation({ spec, projectRoot: ctx.root, reportsDir, tmpDir, tool, osvDbDir: layout.osvDb, path: base.env.PATH ?? '', inventory: ctx.inventory });
    if (!inv.ok) {
      await ports.fs.remove(tmpRoot);
      return this.#finishCheck(e, inv.outcome, inv.reason, null, []);
    }
    const template = inv.plan.template;
    // What the template asks AYAR to prepare (Semgrep's rules and its stand-in git, E-24's shadow repository).
    const prepared = await prepare({ fs: ports.fs, catalog: this.#o.catalog, template, tmpDir, root: ctx.root }).catch((err: unknown) => ({ ok: false as const, outcome: 'unavailable' as const, reason: { key: 'run.reason.prepareFailed', params: { detail: err instanceof Error ? err.message.slice(0, 200) : String(err) } } }));
    if (!prepared.ok) {
      await ports.fs.remove(tmpRoot);
      return this.#finishCheck(e, prepared.outcome, prepared.reason, null, []);
    }

    // Companion services before it (FR-21). A cancel (of the check, the run, or the app) ends the wait at once.
    const waiting = new AbortController();
    active.waiting.set(e.checkRunId, waiting);
    // A cancel that came before the controller existed (while the spec was checked) counts too.
    if (active.cancel || active.cancelledChecks.has(e.checkRunId)) waiting.abort();
    const { failed: failedService, held } = await active.services!.acquire(spec.services, waiting.signal).finally(() => active.waiting.delete(e.checkRunId));
    if (waiting.signal.aborted || active.cancel || active.cancelledChecks.has(e.checkRunId)) {
      await active.services!.release(held);
      await ports.fs.remove(tmpRoot);
      return this.#finishCheck(e, 'cancelled', { key: active.cancel === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }, null, []);
    }
    if (failedService) {
      await active.services!.release(held);
      await ports.fs.remove(tmpRoot);
      return this.#finishCheck(e, 'unavailable', { key: 'run.reason.serviceNotReady', params: { service: failedService } }, null, []);
    }

    // Side effects: an inventory before, compared with one after (FR-36; the E-25 shortcut is fine here).
    const before = ctx.sideEffects && spec.sideEffects.runsProjectCode ? await this.#snapshot(ctx.projectId, ctx.root, false, false, ctx.lastManifest) : null;

    // The child's environment (C-07 point 5, D-47): sensitive variables only by name, a TMPDIR of its own; the
    // template's variables per step (its reports folder).
    const childFor = (env: Record<string, string>) => computeChildEnv({ login: base.env, rules: this.#o.redaction.names(), allowSensitive: spec.env.allowSensitive, explicit: spec.env.explicit, tmpDir, adapter: { ...inv.plan.env, ...env } });
    const child = childFor(inv.plan.steps[0]!.env);
    const evDir = await evidence.store.open(ctx.projectId, runId, e.checkRunId);
    const totals: OutputTotals = { lines: 0, tail: [] };
    const redactor = this.#o.redaction.redactor();
    const onSegment = (stream: 'stdout' | 'stderr', offset: number, length: number) => this.#o.events.log(runId, e.checkRunId, { stream, offset, length });
    // 9.6 point 5: the adapter's live parser turns a line into a provisional finding, confirmed or dropped by the
    // final reading. It sees the lines after redaction.
    const adapter = adapterById(template.adapter);
    const live = adapter?.liveParser ? (line: string) => adapter.liveParser?.(line) ?? null : null;
    let provisional = 0;
    const onLines = live
      ? (lines: readonly string[]) => {
          for (const line of lines) {
            if (provisional >= PROVISIONAL_MAX) return;
            const s = live(line.replace(/\n$/, ''));
            if (!s?.provisional) continue;
            provisional++;
            const p = s.provisional;
            this.#o.events.emit('finding.provisional', { runId, checkRunId: e.checkRunId, fingerprint: createHash('sha256').update(`${spec.checkId}|${p.rule}|${p.title}`).digest('hex'), rule: p.rule, title: p.title.slice(0, 500), location: p.location });
          }
        }
      : undefined;
    const out = streamSink({ writer: await ports.fs.openWriter(posix.join(evDir, 'stdout.log'), 0o600), redactor: redactor.lineStream(), stream: 'stdout', totals, onSegment, ...(onLines ? { onLines } : {}) });
    const err = streamSink({ writer: await ports.fs.openWriter(posix.join(evDir, 'stderr.log'), 0o600), redactor: redactor.lineStream(), stream: 'stderr', totals, onSegment, ...(onLines ? { onLines } : {}) });
    // 9.7: a cancel (of the check, its run, or the app) that came while it was being prepared launches nothing.
    // Checked in the same turn as the launch below, so no cancel slips in between.
    if (active.cancel || active.cancelledChecks.has(e.checkRunId)) {
      await out.end();
      await err.end();
      for (const name of ['stdout.log', 'stderr.log']) await ports.fs.remove(posix.join(evDir, name));
      await active.services!.release(held);
      await ports.fs.remove(tmpRoot);
      return this.#finishCheck(e, 'cancelled', { key: active.cancel === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }, null, []);
    }
    // The steps, one after the other, as one execution: one token, one ledger row (the next step reopens it), one
    // timeout for them all. A step that did not end on its own (cancelled, timed out, killed) ends the execution.
    const token = Buffer.from(ports.random.bytes(24)).toString('base64url');
    const startedWall = ports.clock.now();
    const deadline = ports.clock.monotonicMs() + spec.timeoutMin * 60_000;
    let ledgerId: string | undefined;
    const results: ProcessResult[] = [];
    const steps: NonNullable<RawCheckResult['steps']> = [];
    let unfinished: 'cancelled' | 'timed_out' | null = null;
    for (const step of inv.plan.steps) {
      if (active.cancel || active.cancelledChecks.has(e.checkRunId)) {
        unfinished = 'cancelled';
        break;
      }
      const remaining = deadline - ports.clock.monotonicMs();
      if (remaining <= 0) {
        unfinished = 'timed_out';
        break;
      }
      await ports.fs.mkdir(step.reportsDir, 0o700);
      // A tool that writes its findings to its output (tsc, Biome, Knip, pyright): the raw output is its report too,
      // redacted with the others when it is kept (D-46).
      const tee = template.stdoutReport ? await this.#tee(posix.join(step.reportsDir, 'stdout.txt')) : null;
      const proc = this.#o.supervisor.start({
        argv: step.argv,
        cwd: step.cwd,
        env: childFor(step.env).env,
        token,
        tempDir: tmpRoot,
        ledger: { kind: 'check', runId, checkRunId: e.checkRunId, ...(ledgerId ? { reuse: ledgerId } : {}) },
        onLedger: (id) => (ledgerId = id),
        timeoutMs: remaining,
        idleTimeoutMs: spec.idleTimeoutSec ? spec.idleTimeoutSec * 1000 : null,
        onStdout: (c) => {
          out.push(c);
          tee?.push(c);
        },
        onStderr: (c) => err.push(c),
        onSample: (s) => {
          db.run('UPDATE check_runs SET last_activity_at = ? WHERE id = ?', new Date(ports.clock.now().getTime() - s.silentMs).toISOString(), e.checkRunId);
          this.#o.events.emit('check.progress', {
            runId,
            checkRunId: e.checkRunId,
            step: totals.lines,
            total: null,
            lastActivityAt: new Date(ports.clock.now().getTime() - s.silentMs).toISOString(),
            processor: `${Math.round(s.cpuPercent)}%`,
            silentMs: s.silentMs,
            linesSeen: totals.lines,
          });
        },
      });
      active.procs.set(e.checkRunId, proc);
      if (active.cancel || active.cancelledChecks.has(e.checkRunId)) proc.stop(active.cancel === 'app_quit' ? 'quit' : 'cancel');
      const r = await proc.done;
      active.procs.delete(e.checkRunId);
      await tee?.close();
      results.push(r);
      steps.push({ n: step.n, ended: r.ended, exitCode: r.exitCode, signal: r.signal, durationMs: r.durationMs });
      if (r.ended !== 'exited' || (r.exitCode === null && r.signal)) break;
    }
    const r = aggregate(results, unfinished, startedWall, ports.clock.now());
    // Its process has ended: what follows records its result, and a cancel now comes too late (accepted: false).
    active.collecting.add(e.checkRunId);
    const outEnd = await out.end();
    const errEnd = await err.end();
    // The services' logs so far are this check's evidence (FR-21), taken before a service stops with its last user.
    const serviceLogs = spec.services.map((s) => [s.id, active.services!.logOf(s.id)] as const);
    await active.services!.release(held);

    // Evidence: the logs (already redacted as they were written), the services' logs, the side effects, the raw
    // reports redacted on their way in (D-46), and the metadata of 9.9. Then the temporary folder goes.
    const refs: EvidenceRef[] = [];
    const add = async (name: string, kind: string, data: Uint8Array | undefined, extra: { counts?: Record<string, number>; truncated?: boolean } = {}) => {
      const ref = await evidence.store.add({ projectId: ctx.projectId, runId, checkRunId: e.checkRunId, name, kind, ...(data ? { data } : {}), redacted: true, ...extra });
      refs.push(ref);
      return ref;
    };
    await add('stdout.log', 'log', undefined, { counts: outEnd.counts, truncated: outEnd.truncated });
    await add('stderr.log', 'log', undefined, { counts: errEnd.counts, truncated: errEnd.truncated });
    for (const [id, text] of serviceLogs) if (text) await add(`service-${id}.log`, 'service_log', new TextEncoder().encode(text));
    let sideEffects: SideEffects | null = null;
    if (before) {
      const after = await this.#snapshot(ctx.projectId, ctx.root, false, false, before);
      ctx.lastManifest = after;
      sideEffects = diffManifests(before, after, { declared: ctx.declared, tracked: await trackedPaths(ports.fs, ctx.root) });
      await add('side-effects.json', 'side_effects', new TextEncoder().encode(JSON.stringify(sideEffects, null, 2)));
    }
    // The reports, step by step (`<reports>/<n>/`): a single step's keep their own names.
    const reports: ReportInput[] = [];
    const single = inv.plan.steps.length === 1;
    await this.#collectReports(reportsDir, async (name, data, size, truncated) => {
      const slash = name.indexOf('/');
      const step = slash > 0 && /^\d+$/.test(name.slice(0, slash)) ? Number(name.slice(0, slash)) : 1;
      const own = slash > 0 && /^\d+$/.test(name.slice(0, slash)) ? name.slice(slash + 1) : name;
      const red = redactor.redactText(new TextDecoder().decode(data));
      const ref = await add(`reports/${single ? own : name}`, 'report', new TextEncoder().encode(red.text), { counts: red.counts, truncated });
      reports.push({ name: own, step, path: evidence.store.absolute(ref.relPath), size, truncated });
    });
    // E-10's stand-in git: how it was called, as evidence (AT-01: no git on the project from a static tool).
    const nogit = await ports.fs.readFilePrefix(posix.join(tmpDir, NOGIT_LOG), 1024 * 1024).catch(() => null);
    if (nogit) await add(NOGIT_LOG, 'trace', new TextEncoder().encode(redactor.redactText(new TextDecoder().decode(nogit.data)).text));
    await ports.fs.remove(tmpRoot);

    // The outcome the process itself gives (7.3 rule 1; 7.5), and the notes of 9.7 and 17.
    const notes: string[] = [];
    if (r.leftovers.escapeSuspected.length) notes.push('run.note.escapeSuspected');
    if (r.leftovers.tokenKilled > 0) notes.push('run.note.leftoversEnded');
    if (r.sleepGaps.length) notes.push('run.note.sleepGap');
    if (outEnd.truncated || errEnd.truncated) notes.push('run.note.outputTruncated');
    if (template.suggestion) notes.push('adapter.note.directCallSuggested');
    const logs = { stdout: refs.find((x) => x.relPath.endsWith('/stdout.log')) ?? null, stderr: refs.find((x) => x.relPath.endsWith('/stderr.log')) ?? null };
    const raw: RawCheckResult = {
      checkRunId: e.checkRunId,
      runId,
      instance: e.instance,
      checkId: spec.checkId,
      component: spec.component,
      attempt: this.#checkRow(e.checkRunId).attempt,
      ended: r.ended === 'idle_timed_out' ? 'idle_timed_out' : r.ended,
      exitCode: r.exitCode,
      signal: r.signal,
      spawnError: r.spawnError,
      startedAt: startedWall.toISOString(),
      finishedAt: r.finishedAt.toISOString(),
      durationMs: r.durationMs,
      command: { argv: spec.command?.argv ?? template.argv, cwd: spec.command?.cwd ?? spec.component },
      envKeys: child.passed,
      toolVersions: inv.plan.toolVersions,
      logs,
      reports: refs.filter((x) => x.kind === 'report'),
      tail: totals.tail.slice(-200),
      lastActivityAt: r.lastActivityAt?.toISOString() ?? null,
      sideEffects,
      resources: r.resources,
      sleepGaps: r.sleepGaps,
      leftovers: r.leftovers,
      notes,
      sharedFrom: null,
      steps,
    };
    // The metadata of 9.9: the literal command (the adapter's template, and its steps as run), its folder, the
    // variable names (no values), the tools, the environment's source; and how the process was ended (the
    // escalation), what was left and cleaned.
    const shown = (a: string) => a.replaceAll(layout.root, '<data>');
    await add(
      'meta.json',
      'meta',
      new TextEncoder().encode(
        JSON.stringify(
          {
            command: raw.command,
            template: { adapter: template.adapter, adapterVersion: template.adapterVersion, argv: template.argv, cwd: template.cwd, suggestion: template.suggestion },
            invocation: { argv: inv.plan.steps[0]!.argv.slice(0, 64).map(shown), cwd: inv.plan.steps[0]!.cwd === ctx.root ? '.' : shown(inv.plan.steps[0]!.cwd.startsWith(`${ctx.root}/`) ? posix.relative(ctx.root, inv.plan.steps[0]!.cwd) : inv.plan.steps[0]!.cwd), steps: inv.plan.steps.length },
            env: { source: base.source, fallbackReason: base.fallbackReason, passed: child.passed, withheld: child.withheld, allowedSensitive: child.allowedSensitive, added: child.added, removedInternal: child.removedInternal },
            toolVersions: raw.toolVersions,
            steps,
            escalation: r.escalation,
            leftovers: r.leftovers,
            sleepGaps: r.sleepGaps,
          },
          null,
          2,
        ),
      ),
    );
    const [outcome, reason] = this.#processOutcome(r, active, e, spec);
    if (outcome !== null) return this.#finishCheck(e, outcome, reason, raw, notes, r);

    // 9.8: the adapter reads the kept reports (in a worker thread), the classifier judges (C-16).
    const req: JudgeRequest = {
      kind: 'parse',
      adapter: template.adapter,
      cwd: inv.plan.steps[0]!.cwd,
      reports,
      stdoutPath: logs.stdout ? evidence.store.absolute(logs.stdout.relPath) : null,
      stderrPath: logs.stderr ? evidence.store.absolute(logs.stderr.relPath) : null,
      exit: { exitCode: r.exitCode, signal: r.signal, steps: steps.map((s) => ({ n: s.n, exitCode: s.exitCode, ended: s.ended })) },
      inventory: ctx.inventory,
      outputs: ctx.outputs,
    };
    const judgement = await this.#o.verdict.judge(spec, { projectId: ctx.projectId, root: ctx.root, req, signal: active.quit.signal });
    if (judgement.outcome === 'cancelled') return this.#finishCheck(e, 'cancelled', { key: 'run.reason.appQuit' }, raw, notes, r);
    const evidenceIds = refs.filter((x) => x.kind === 'report').map((x) => x.id);
    if (judgement.report) evidenceIds.push((await add('parsed.json', 'parsed', reportEvidence(redactor.redactJson(judgement.report)))).id);
    e.judged = { req, evidenceIds };
    this.#finishCheck(e, judgement.outcome, judgement.reason, raw, notes, r, undefined, { judgement, evidenceIds, reader: judgement.report ? { id: judgement.report.reader, version: judgement.report.readerVersion, formats: judgement.report.formats } : null });
  }

  /** A file the raw output is copied into, up to the read limit of a report (a bigger one is not judged anyway). */
  async #tee(path: string): Promise<{ push(c: Uint8Array): void; close(): Promise<void> }> {
    const w: FileWriter = await this.#o.ports.fs.openWriter(path, 0o600);
    let bytes = 0;
    return {
      push(c) {
        if (bytes > REPORT_READ_LIMIT) return;
        bytes += c.length;
        void w.write(c);
      },
      close: () => w.close(),
    };
  }

  /** C-13: an analyzer runs inside the engine, in a worker thread that a cancel stops. */
  async #runAnalyzer(active: Active, e: Exec, ctx: CheckContext, spec: CheckSpec): Promise<void> {
    const { db, ports, evidence } = this.#o;
    const runId = active.runId;
    const analyzer = spec.runner.ids[0] ?? '';
    const comp = spec.component === '.' ? '' : `${spec.component}/`;
    const files = ctx.inventory.filter((f) => !comp || f.startsWith(comp));
    const facts = (latestSnapshot(db, ctx.projectId)?.facts ?? []).filter((f) => f.component === spec.component || f.component === '.');
    const ctrl = new AbortController();
    active.waiting.set(e.checkRunId, ctrl);
    if (active.cancel || active.cancelledChecks.has(e.checkRunId)) ctrl.abort();
    const started = ports.clock.now();
    const t0 = ports.clock.monotonicMs();
    const judgement = await this.#o.verdict.judge(spec, { projectId: ctx.projectId, root: ctx.root, req: { kind: 'analyze', analyzer, files, facts }, signal: AbortSignal.any([ctrl.signal, active.quit.signal]) }).finally(() => active.waiting.delete(e.checkRunId));
    active.collecting.add(e.checkRunId);
    if (judgement.outcome === 'cancelled') return this.#finishCheck(e, 'cancelled', { key: active.cancel === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }, null, []);
    const raw: RawCheckResult = {
      checkRunId: e.checkRunId,
      runId,
      instance: e.instance,
      checkId: spec.checkId,
      component: spec.component,
      attempt: this.#checkRow(e.checkRunId).attempt,
      ended: 'exited',
      exitCode: null,
      signal: null,
      spawnError: null,
      startedAt: started.toISOString(),
      finishedAt: ports.clock.now().toISOString(),
      durationMs: Math.max(0, Math.round(ports.clock.monotonicMs() - t0)),
      command: null,
      envKeys: [],
      toolVersions: { [`analyzer:${analyzer}`]: judgement.report?.readerVersion ?? '' },
      logs: { stdout: null, stderr: null },
      reports: [],
      tail: [],
      lastActivityAt: null,
      sideEffects: null,
      resources: { samples: 0, peakRssKb: 0, maxCpuPercent: 0, lastCpuPercent: 0 },
      sleepGaps: [],
      leftovers: { groupKilled: 0, tokenKilled: 0, escapeSuspected: [] },
      notes: [],
      sharedFrom: null,
      internal: { runner: analyzer, version: judgement.report?.readerVersion ?? '' },
    };
    const evidenceIds: string[] = [];
    if (judgement.report) {
      await evidence.store.open(ctx.projectId, runId, e.checkRunId);
      const ref = await evidence.store.add({ projectId: ctx.projectId, runId, checkRunId: e.checkRunId, name: 'parsed.json', kind: 'parsed', data: reportEvidence(this.#o.redaction.redactor().redactJson(judgement.report)), redacted: true });
      evidenceIds.push(ref.id);
    }
    this.#finishCheck(e, judgement.outcome, judgement.reason, raw, [], undefined, undefined, { judgement, evidenceIds, reader: judgement.report ? { id: judgement.report.reader, version: judgement.report.readerVersion, formats: judgement.report.formats } : null });
  }

  /** 7.3 rule 1 and C-12 «الأخطاء»: what the process itself says, before any classifier. */
  #processOutcome(r: ProcessResult, active: Active, e: Exec, spec: CheckSpec): [CheckOutcome | null, Reason | null] {
    switch (r.ended) {
      case 'spawn_failed':
        if (r.spawnError === 'ENOENT') return ['missing', { key: 'run.reason.toolNotFound', params: { program: spec.command?.argv[0] ?? spec.tool?.key ?? '' } }];
        if (r.spawnError === 'EPERM') return ['unavailable', { key: 'run.reason.macosPermission' }];
        if (r.spawnError === 'EACCES') return ['unavailable', { key: 'run.reason.permissionDenied' }];
        return ['unavailable', { key: 'run.reason.spawnFailed', params: { error: r.spawnError ?? 'unknown' } }];
      case 'cancelled':
        return ['cancelled', { key: active.cancel === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }];
      case 'timed_out':
        return ['timed_out', { key: 'run.reason.timeout', params: { minutes: spec.timeoutMin } }];
      case 'idle_timed_out':
        return ['timed_out', { key: 'run.reason.idle', params: { seconds: spec.idleTimeoutSec ?? 0 } }];
      default:
        void e;
        if (r.exitCode === null && r.signal) return ['unavailable', { key: 'run.reason.externalSignal', params: { signal: r.signal } }];
        return [null, null];
    }
  }

  /**
   * D-24 / D-45: a covered check takes the covering execution's result («يشمل»: beh.unit from beh.stability's
   * attempts); a shared one, its very raw result, judged again by its own check's rules (its own findings).
   */
  async #inherit(active: Active, e: Exec, source: Exec | null, ctx: CheckContext): Promise<void> {
    if (!source) return this.#finishCheck(e, 'unavailable', { key: 'run.reason.internal' }, null, []);
    const raw = source.raw ? RawSchema.parse({ ...source.raw, checkRunId: e.checkRunId, instance: e.instance, checkId: e.item.checkId, component: e.item.component, sharedFrom: source.checkRunId }) : null;
    if (e.item.status === 'covered') {
      this.#o.db.run('UPDATE check_runs SET covered_by_check_run_id = ? WHERE id = ?', source.checkRunId, e.checkRunId);
      const reason: Reason = { key: 'plan.reason.coveredBy', params: { by: source.instance } };
      const row = this.#checkRow(source.checkRunId);
      return this.#finishCheck(e, source.outcome, source.outcome === null ? null : reason, raw, raw?.notes ?? [], undefined, source.ok, undefined, row.origin);
    }
    const reason: Reason = { key: 'plan.reason.sharesExecution', params: { with: source.instance } };
    const spec = ctx.specs.get(e.instance);
    if (!source.judged || !spec) return this.#finishCheck(e, source.outcome, source.outcome === null ? null : reason, raw, raw?.notes ?? [], undefined, source.ok);
    const judgement = await this.#o.verdict.judge(spec, { projectId: ctx.projectId, root: ctx.root, req: source.judged.req, signal: active.quit.signal });
    if (judgement.outcome === 'cancelled') return this.#finishCheck(e, 'cancelled', { key: 'run.reason.appQuit' }, raw, raw?.notes ?? []);
    this.#finishCheck(e, judgement.outcome, judgement.reason, raw, raw?.notes ?? [], undefined, undefined, { judgement, evidenceIds: source.judged.evidenceIds, reader: judgement.report ? { id: judgement.report.reader, version: judgement.report.readerVersion, formats: judgement.report.formats } : null });
  }

  #finishCheck(e: Exec, outcome: CheckOutcome | null, reason: Reason | null, raw: RawCheckResult | null, notes: readonly string[], r?: ProcessResult, ok?: boolean, verdict?: Verdict, inheritedOrigin?: string | null): void {
    const { db } = this.#o;
    const row = this.#checkRow(e.checkRunId);
    e.state = 'done';
    e.outcome = outcome;
    e.raw = raw;
    // 7.3 rule 2: a dependant runs only after its dependency succeeded.
    e.ok = ok ?? (outcome === 'passed' || outcome === 'warning');
    const origin = verdict?.judgement.origin ?? inheritedOrigin ?? null;
    db.transaction(() => {
      if (verdict) this.#o.verdict.persist({ projectId: this.#projectOf(row.run_id), runId: row.run_id, checkRunId: e.checkRunId, spec: { checkId: e.item.checkId, component: e.item.component, section: e.item.section }, judgement: verdict.judgement, evidenceIds: verdict.evidenceIds });
      db.run(
        'UPDATE check_runs SET state = ?, outcome = ?, auto_outcome = ?, outcome_reason = ?, origin = ?, findings_json = ?, reader_json = ?, finished_at = ?, duration_ms = ?, exit_code = ?, signal = ?, env_keys_json = ?, tool_versions_json = ?, resource_json = ?, sleep_gaps_json = ?, last_activity_at = coalesce(?, last_activity_at), raw_json = ?, notes_json = ? WHERE id = ?',
        'finished',
        outcome,
        outcome,
        reason ? JSON.stringify(reason) : null,
        origin,
        verdict ? JSON.stringify(verdict.judgement.counts) : null,
        verdict?.reader ? JSON.stringify({ ...verdict.reader, dropped: verdict.judgement.report?.findingsDropped ?? 0 }) : null,
        this.#now(),
        r?.durationMs ?? raw?.durationMs ?? null,
        raw?.exitCode ?? null,
        raw?.signal ?? null,
        raw ? JSON.stringify(raw.envKeys) : null,
        raw ? JSON.stringify(raw.toolVersions) : null,
        raw ? JSON.stringify(raw.resources) : null,
        raw ? JSON.stringify(raw.sleepGaps) : null,
        raw?.lastActivityAt ?? null,
        raw ? JSON.stringify(raw) : null,
        notes.length ? JSON.stringify(notes) : null,
        e.checkRunId,
      );
    });
    this.#o.events.emit('check.state', this.#checkView(this.#checkRow(e.checkRunId)));
    if (verdict) this.#o.verdict.emitFinal(row.run_id, e.checkRunId);
    this.#emitRun(row.run_id);
  }

  #projectOf(runId: string): string {
    return this.#o.db.get<{ project_id: string }>('SELECT project_id FROM runs WHERE id = ?', runId)!.project_id;
  }

  async #collectReports(dir: string, each: (name: string, data: Uint8Array, size: number, truncated: boolean) => Promise<void>): Promise<number> {
    const { fs } = this.#o.ports;
    let n = 0;
    const walk = async (rel: string) => {
      const entries = await fs.readdirEntries(rel ? posix.join(dir, rel) : dir).catch(() => []);
      for (const x of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const r = rel ? `${rel}/${x.name}` : x.name;
        if (x.kind === 'directory') await walk(r);
        else if (x.kind === 'file') {
          // A raw report is read with a limit (10.3 «حماية القراءة»): beyond it, the part read is kept, marked, and
          // the adapter does not read it at all (C-15: «تعذّر: التقرير أكبر من الحد»).
          const { data, size } = await fs.readFilePrefix(posix.join(dir, r), REPORT_READ_LIMIT);
          await each(r.replace(/[^A-Za-z0-9._/-]/g, '_'), data, size, size > data.length);
          n++;
        }
      }
    };
    await walk('');
    return n;
  }

  // ── cancel, quit ─────────────────────────────────────────────────────────────────────────────────────────

  /** run.cancel (9.7): a check — its group ended by escalation, its dependants skipped — or the whole run. */
  cancel(target: { kind: 'run'; runId: string } | { kind: 'checkRun'; checkRunId: string }): { accepted: boolean; state: string | null } {
    const { db } = this.#o;
    if (target.kind === 'run') {
      const run = db.get<{ state: string; project_id: string }>('SELECT state, project_id FROM runs WHERE id = ?', target.runId);
      if (!run) throw new CommandError('not_found', { reason: 'run' });
      const a = this.#active.get(target.runId);
      if (run.state === 'queued' && !a) {
        this.#cancelQueued(target.runId, run.project_id, 'user');
        return { accepted: true, state: 'finished' };
      }
      if (!a || TERMINAL_RUN.includes(run.state)) return { accepted: false, state: run.state };
      this.#requestCancel(a, 'user');
      return { accepted: true, state: 'cancelling' };
    }
    const c = db.get<{ run_id: string; state: string }>('SELECT run_id, state FROM check_runs WHERE id = ?', target.checkRunId);
    if (!c) throw new CommandError('not_found', { reason: 'check_run' });
    const a = this.#active.get(c.run_id);
    if (!a || c.state === 'finished') return { accepted: false, state: c.state };
    // Its process already ended: its real result is being recorded, so the cancel is too late.
    if (a.collecting.has(target.checkRunId)) return { accepted: false, state: c.state };
    a.cancelledChecks.add(target.checkRunId);
    a.waiting.get(target.checkRunId)?.abort();
    const proc = a.procs.get(target.checkRunId);
    // Running or being prepared (its spec checked, its services awaited): «يُلغى» until it ends; not started yet:
    // the scheduler ends it «أُلغي» at once.
    const started = proc !== undefined || c.state === 'running';
    if (started) {
      db.run("UPDATE check_runs SET state = 'cancelling' WHERE id = ?", target.checkRunId);
      this.#o.events.emit('check.state', this.#checkView(this.#checkRow(target.checkRunId)));
      proc?.stop('cancel');
    }
    a.wake();
    return { accepted: true, state: started ? 'cancelling' : 'finished' };
  }

  /** A run still in the queue never starts: its checks «أُلغي», with why (by the user, or because the app quits). */
  #cancelQueued(runId: string, projectId: string, reason: 'user' | 'app_quit'): void {
    const { db } = this.#o;
    this.#o.runGate.release(runId);
    db.run("UPDATE check_runs SET state = 'finished', outcome = 'cancelled', outcome_reason = ?, finished_at = ? WHERE run_id = ? AND state <> 'finished'", JSON.stringify({ key: reason === 'app_quit' ? 'run.reason.appQuit' : 'run.reason.cancelledByUser' }), this.#now(), runId);
    db.run("UPDATE runs SET state = 'finished', finished_at = ?, cancel_reason = ?, counts_json = ? WHERE id = ?", this.#now(), reason, JSON.stringify(this.#counts(runId)), runId);
    recordAudit(db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'run.cancelled', projectId, details: { runId, reason, queued: true } });
    this.#emitRun(runId);
  }

  #requestCancel(a: Active, reason: 'user' | 'app_quit'): void {
    if (a.cancel === 'app_quit') return;
    a.cancel = reason;
    // The app quits: a report still being read is dropped (the run ends the short way).
    if (reason === 'app_quit') a.quit.abort();
    this.#o.db.run("UPDATE runs SET state = 'cancelling' WHERE id = ?", a.runId);
    for (const [checkRunId, proc] of a.procs) {
      this.#o.db.run("UPDATE check_runs SET state = 'cancelling' WHERE id = ?", checkRunId);
      this.#o.events.emit('check.state', this.#checkView(this.#checkRow(checkRunId)));
      proc.stop(reason === 'app_quit' ? 'quit' : 'cancel');
    }
    // Checks still waiting for a companion service stop waiting, and the services stop now (9.7: the short way).
    for (const w of a.waiting.values()) w.abort();
    a.services?.abort(reason === 'app_quit' ? 'quit' : 'cancel');
    this.#emitRun(a.runId);
    a.wake();
  }

  /**
   * internal.prepareQuit (9.7 «إغلاق التطبيق أثناء التشغيل»): the short ending — SIGTERM, 2 s, SIGKILL and the
   * sweep — with the running checks «أُلغي» because the app is quitting; the queued runs never start.
   */
  async prepareQuit(): Promise<{ cancelledRuns: number; cancelledChecks: number }> {
    const runs = [...this.#active.values()];
    let checks = 0;
    for (const a of runs) {
      checks += a.procs.size;
      this.#requestCancel(a, 'app_quit');
    }
    for (const q of this.#o.runGate.snapshot().queue) {
      const run = this.#o.db.get<{ state: string; project_id: string }>('SELECT state, project_id FROM runs WHERE id = ?', q);
      if (run?.state === 'queued' && !this.#active.has(q)) this.#cancelQueued(q, run.project_id, 'app_quit');
    }
    await Promise.all([...this.#queued.values()].map((p) => p.catch(() => {})));
    return { cancelledRuns: runs.length, cancelledChecks: checks };
  }

  // ── views ────────────────────────────────────────────────────────────────────────────────────────────────

  #checkRows(runId: string): CheckRunRow[] {
    return this.#o.db.all<CheckRunRow>('SELECT * FROM check_runs WHERE run_id = ? ORDER BY rowid', runId);
  }

  #checkRow(id: string): CheckRunRow {
    return this.#o.db.get<CheckRunRow>('SELECT * FROM check_runs WHERE id = ?', id)!;
  }

  #checkView(c: CheckRunRow): CheckRunView {
    return {
      checkRunId: c.id,
      runId: c.run_id,
      instance: `${c.check_id}@${c.component}`,
      checkId: c.check_id,
      component: c.component,
      state: c.state as CheckRunView['state'],
      outcome: c.outcome as CheckOutcome | null,
      outcomeReason: c.outcome_reason ? (JSON.parse(c.outcome_reason) as Reason) : null,
      readiness: (c.readiness ?? 'ready') as CheckRunView['readiness'],
      coveredByCheckRunId: c.covered_by_check_run_id,
      sharedInvocationKey: c.shared_invocation_key,
      startedAt: c.started_at,
      finishedAt: c.finished_at,
      durationMs: c.duration_ms,
      exitCode: c.exit_code,
      signal: c.signal,
      attempt: c.attempt,
      previousCheckRunId: c.previous_check_run_id,
      lastActivityAt: c.last_activity_at,
      notes: c.notes_json ? (JSON.parse(c.notes_json) as string[]) : [],
      autoOutcome: (c.auto_outcome as CheckOutcome | null) ?? null,
      reviewId: c.review_id,
      origin: (c.origin as CheckRunView['origin']) ?? null,
      findings: c.findings_json ? (JSON.parse(c.findings_json) as VerdictCounts) : { violations: 0, warnings: 0, review: 0, notes: 0, excludedByReview: 0 },
    };
  }

  #counts(runId: string): RunCounts {
    const rows = this.#checkRows(runId);
    const byOutcome: RunCounts['byOutcome'] = {};
    for (const r of rows) if (r.outcome) byOutcome[r.outcome as CheckOutcome] = (byOutcome[r.outcome as CheckOutcome] ?? 0) + 1;
    return {
      planned: rows.filter((r) => r.state === 'planned').length,
      queued: rows.filter((r) => r.state === 'queued').length,
      running: rows.filter((r) => r.state === 'running' || r.state === 'cancelling').length,
      finished: rows.filter((r) => r.state === 'finished').length,
      byOutcome,
    };
  }

  view(runId: string): RunView {
    const r = this.#o.db.get<RunRow>('SELECT * FROM runs WHERE id = ?', runId);
    if (!r) throw new CommandError('not_found', { reason: 'run' });
    const gate = this.#o.runGate.snapshot();
    const at = gate.queue.indexOf(runId);
    return {
      runId: r.id,
      displayId: r.display_id,
      projectId: r.project_id,
      planId: r.plan_id,
      kind: r.kind,
      state: r.state as RunView['state'],
      queuePosition: gate.active === runId ? 0 : at >= 0 ? at + 1 : null,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      counts: this.#counts(runId),
      stateChanged: r.state_changed === 1,
      // 9.6 point 4: no verdict while running; then C-19's, never the number alone (11.5).
      verdict: TERMINAL_RUN.includes(r.state) ? ((r.verdict as RunView['verdict']) ?? null) : null,
      purity: TERMINAL_RUN.includes(r.state) ? this.#o.purity.summaryOf(runId) : null,
      keepForever: r.keep_forever === 1,
      cancelReason: r.cancel_reason === 'user' || r.cancel_reason === 'app_quit' ? r.cancel_reason : null,
      preventSleep: r.prevent_sleep === 1,
    };
  }

  #emitRun(runId: string): void {
    this.#o.events.emit('run.state', this.view(runId));
  }

  list(projectId: string): RunList {
    if (!this.#o.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
    const ids = this.#o.db.all<{ id: string }>("SELECT id FROM runs WHERE project_id = ? ORDER BY coalesce(started_at, '9999') DESC, display_id DESC", projectId);
    return { runs: ids.map((x) => this.view(x.id)), spaceUsedBytes: this.#o.evidence.space(projectId), retainRuns: this.#o.evidence.settings().retainRuns };
  }

  async get(runId: string): Promise<RunDetail> {
    const run = this.view(runId);
    const row = this.#o.db.get<RunRow>('SELECT * FROM runs WHERE id = ?', runId)!;
    const plan = PlanSchema.safeParse(JSON.parse(row.plan_json));
    const checks: CheckRunDetail[] = this.#checkRows(runId).map((c) => ({ ...this.#checkView(c), raw: c.raw_json ? RawSchema.parse(JSON.parse(c.raw_json)) : null, evidence: this.#o.evidence.store.refsOf(c.id) }));
    let stateChange: SideEffects | null = null;
    if (row.snapshot_start_id && row.snapshot_end_id) {
      const [a, b] = await Promise.all([this.#o.evidence.snapshots.load(row.snapshot_start_id), this.#o.evidence.snapshots.load(row.snapshot_end_id)]);
      if (a && b) {
        const root = this.#o.db.get<{ root_realpath: string }>('SELECT root_realpath FROM projects WHERE id = ?', row.project_id)?.root_realpath;
        stateChange = diffManifests(a, b, { declared: this.#declared(row.project_id, plan.success ? plan.data : (null as unknown as RunPlan)), tracked: root ? await trackedPaths(this.#o.ports.fs, root) : null });
      }
    }
    return { run, plan: plan.success ? plan.data : null, checks, stateChange, purity: TERMINAL_RUN.includes(row.state) ? this.#o.purity.resultOf(runId) : null };
  }

  keep(runId: string, keep: boolean): RunView {
    const r = this.view(runId);
    this.#o.db.transaction(() => {
      this.#o.db.run('UPDATE runs SET keep_forever = ? WHERE id = ?', keep ? 1 : 0, runId);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'run.kept', projectId: r.projectId, details: { runId, keep } });
    });
    const v = this.view(runId);
    this.#emitRun(runId);
    return v;
  }

  /** runs.delete: a finished run with its evidence and what only it used (C-17); never one that is active. */
  async delete(runId: string): Promise<{ deleted: true; freedBytes: number; spaceUsedBytes: number }> {
    const r = this.view(runId);
    if (!TERMINAL_RUN.includes(r.state)) throw new CommandError('busy', { reason: 'run_active' });
    const freed = await this.#o.evidence.deleteRuns(r.projectId, [runId]);
    recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'run.deleted', projectId: r.projectId, details: { runId, displayId: r.displayId, freedBytes: freed.freedBytes } });
    return { deleted: true, freedBytes: freed.freedBytes, spaceUsedBytes: this.#o.evidence.space(r.projectId) };
  }
}
