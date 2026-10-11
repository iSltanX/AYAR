// The run contracts (C-10, C-12, C-17; protocol 1.2, DEV-5): the vocabularies of 7.5 fixed here (G-DEV3-04),
// the selection modes of FR-18, the plan the planner shows before anything runs (RunPlan, D-24), the raw result
// of one check execution (RawCheckResult: what C-12 hands to C-15/C-16 in DEV-6; it carries no verdict), the
// run view the events carry, and the saved groups (D-45).
import { CheckInstanceKey, Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { Argv, CompanionService, Reason } from './profile.ts';
import { RelPath } from './discovery.ts';
import { VerdictCounts } from './findings.ts';
import { PurityResult, PurityVerdict, PuritySummary } from './purity.ts';
import { CheckOutcome, Origin } from './terms.ts';

/** 7.2-أ: readiness is shown apart from the outcome. `untrusted` is FR-55 (G-20): a project command in «مشروع غير موثوق». */
export const READINESS_VALUES = ['ready', 'needs_setup', 'needs_approval', 'not_applicable', 'not_included', 'untrusted'] as const;
export const Readiness = z.enum(READINESS_VALUES);
export type Readiness = z.infer<typeof Readiness>;

/** 7.5: the states of a check execution. `finished` carries an outcome. */
export const CHECK_STATES = ['planned', 'queued', 'running', 'cancelling', 'finished'] as const;
export const CheckState = z.enum(CHECK_STATES);
export type CheckState = z.infer<typeof CheckState>;

/** The states of a run. `queued` is the visible queue of D-33 (one active run); `interrupted` is set at boot (FR-25). */
export const RUN_STATES = ['queued', 'running', 'cancelling', 'finished', 'interrupted'] as const;
export const RunState = z.enum(RUN_STATES);
export type RunState = z.infer<typeof RunState>;

/** FR-18: the run modes. */
export const RUN_KINDS = ['full', 'section', 'check', 'group', 'rerun_failed', 'rerun_incomplete', 'advisor', 'continue_round'] as const;
export const RunKind = z.enum(RUN_KINDS);
export type RunKind = z.infer<typeof RunKind>;

/** 9.5 point 3: the outcomes a rerun repeats, with their defaults per mode. */
export const RERUN_FAILED_DEFAULT: readonly CheckOutcome[] = ['failed'];
export const RERUN_FAILED_OPTIONAL: readonly CheckOutcome[] = ['flaky', 'unavailable', 'timed_out'];
export const RERUN_INCOMPLETE_DEFAULT: readonly CheckOutcome[] = ['missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped'];

export const RunSelection = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('full') }),
  z.strictObject({ kind: z.literal('section'), section: z.string().regex(/^[a-z]+$/) }),
  z.strictObject({ kind: z.literal('check'), instance: CheckInstanceKey }),
  /** A custom selection (FR-18): instances to run; `exclude` removes from a full scan and is refused for a required check. */
  z.strictObject({ kind: z.literal('group'), instances: z.array(CheckInstanceKey).min(1).max(2000), name: z.string().max(120).optional() }),
  z.strictObject({ kind: z.literal('savedGroup'), groupId: Id }),
  /** A full scan minus some instances (AT-07: excluding a required check is refused with a reason). */
  z.strictObject({ kind: z.literal('fullExcluding'), exclude: z.array(CheckInstanceKey).min(1).max(2000) }),
  z.strictObject({ kind: z.literal('rerun'), runId: Id, mode: z.enum(['failed', 'incomplete']), outcomes: z.array(CheckOutcome).min(1).optional() }),
  z.strictObject({ kind: z.literal('continueRound'), roundId: Id }),
  z.strictObject({ kind: z.literal('advisor'), instances: z.array(CheckInstanceKey).min(1).max(2000) }),
]);
export type RunSelection = z.infer<typeof RunSelection>;

/** `run.rerun`'s filter (9.5 point 3). */
export const RerunFilter = z.strictObject({ mode: z.enum(['failed', 'incomplete']), outcomes: z.array(CheckOutcome).min(1).optional() });
export type RerunFilter = z.infer<typeof RerunFilter>;

/** What the plan says about one instance. */
export const PLAN_ITEM_STATUSES = [
  /** Will be executed. */
  'run',
  /** Shares the invocation of another item (D-45, C-10 point 4): one process, the same raw result, its own classification. */
  'shared',
  /** Covered by a check that includes it (D-24): inherits the verdict from the covering check's execution. */
  'covered',
  /** Not ready (needs setup or approval): outcome «ناقص», never run, never set up implicitly (9.4 point 5). */
  'missing',
  'not_applicable',
  'not_included',
  /** FR-55: a project command refused in «مشروع غير موثوق». */
  'untrusted',
] as const;
export const PlanItemStatus = z.enum(PLAN_ITEM_STATUSES);
export type PlanItemStatus = z.infer<typeof PlanItemStatus>;

/** A resource lock (C-10 point 7): `fs:<path>`, `port:<n>`, `browser`, `heavy`. */
export const Lock = z.string().regex(/^(fs:.+|port:\d+|browser|heavy)$/);

export const PlanItem = z.strictObject({
  instance: CheckInstanceKey,
  checkId: z.string(),
  checkVersion: z.string(),
  component: RelPath,
  section: z.string(),
  criterion: z.string().nullable(),
  status: PlanItemStatus,
  readiness: Readiness,
  reasons: z.array(Reason),
  /** Why it is in the plan: chosen, added as a dependency of others, included by the profile, or always on. */
  origin: z.enum(['selection', 'dependency', 'profile', 'always_on']),
  /** The instances this one was added for (C-10 point 5, «قياس الحجم يضيف البناء»). */
  addedFor: z.array(CheckInstanceKey),
  dependsOn: z.array(CheckInstanceKey),
  coveredBy: CheckInstanceKey.nullable(),
  sharedInvocationKey: z.string().nullable(),
  locks: z.array(Lock),
  resourceClass: z.enum(['light', 'medium', 'heavy', 'very_heavy']),
  timeoutMin: z.int().positive(),
  idleTimeoutSec: z.int().positive().nullable(),
  /** From the median of earlier durations, or null without history; the UI shows it marked «تقديري». */
  estimateMs: z.int().nonnegative().nullable(),
  needs: z.strictObject({
    network: z.enum(['none', 'optional', 'required']),
    services: z.array(CompanionService),
    dataAsset: z.enum(['osv-db', 'browser']).nullable(),
  }),
  command: z.strictObject({ argv: Argv, cwd: RelPath }).nullable(),
  tool: z.strictObject({ key: z.string(), source: z.string(), path: z.string().nullable() }).nullable(),
  specHash: z.string(),
  approved: z.boolean(),
  /** Setup actions that would make it ready (ids in the readiness report). */
  setupActions: z.array(Id),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const RunPlan = z.strictObject({
  id: Id,
  projectId: Id,
  kind: RunKind,
  selection: RunSelection,
  createdAt: IsoTimestamp,
  profileVersion: z.int().positive(),
  profileHash: z.string(),
  catalogVersion: z.string(),
  untrusted: z.boolean(),
  items: z.array(PlanItem),
  /** Execution order (a topological order over dependsOn; the scheduler still applies locks and concurrency). */
  order: z.array(CheckInstanceKey),
  /** C-10 point 9: what will not run, and why (the same items, listed for the plan screen). */
  willNotRun: z.array(z.strictObject({ instance: CheckInstanceKey, status: PlanItemStatus, reasons: z.array(Reason) })),
  /** A rerun: the run it repeats. */
  previousRunId: Id.nullable(),
  /** Sum of the estimates of what runs, when every one has history; otherwise null. */
  estimateMs: z.int().nonnegative().nullable(),
  /** Set when the plan was frozen by run.start (G-24): a frozen plan starts no second run. */
  frozenAt: IsoTimestamp.nullable(),
  runId: Id.nullable(),
});
export type RunPlan = z.infer<typeof RunPlan>;

export const EvidenceRef = z.strictObject({
  id: Id,
  kind: z.string().min(1),
  relPath: RelPath,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.int().nonnegative(),
  redacted: z.boolean(),
  truncated: z.boolean(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/** FR-36: the side effects of one check, from the two state snapshots around it (C-17). */
export const SideEffects = z.strictObject({
  created: z.array(RelPath),
  modified: z.array(RelPath),
  deleted: z.array(RelPath),
  /** Modified files that were in the start snapshot and are not declared outputs: highlighted (AT-34). */
  trackedModified: z.array(RelPath),
  /** Paths under declared outputs (ignored by .gitignore, output folders, or the profile's `outputs` reference). */
  declared: z.array(RelPath),
  /** The snapshot was taken with the fast path (E-25) or with full hashing. */
  fastPath: z.boolean(),
  truncated: z.boolean(),
});
export type SideEffects = z.infer<typeof SideEffects>;

/** C-12 point 6 and 8: what was left running and what was done about it (T12, E-22). */
export const Leftovers = z.strictObject({
  /** Processes of the group still alive after the leader exited, killed by the escalation. */
  groupKilled: z.int().nonnegative(),
  /** Detached descendants found by the environment token and killed (setsid, double fork). */
  tokenKilled: z.int().nonnegative(),
  /** 17: a possible escape (a new launchd child or job of the user outside the system paths): not claimed clean. */
  escapeSuspected: z.array(z.strictObject({ kind: z.enum(['launchd_child', 'launchd_job']), name: z.string() })),
});
export type Leftovers = z.infer<typeof Leftovers>;

export const SleepGap = z.strictObject({ at: IsoTimestamp, ms: z.int().positive() });
export type SleepGap = z.infer<typeof SleepGap>;

/** What the executor hands over for one check execution (C-12 «المخرجات»). No verdict: that is C-15/C-16 (DEV-6). */
export const RawCheckResult = z.strictObject({
  checkRunId: Id,
  runId: Id,
  instance: CheckInstanceKey,
  checkId: z.string(),
  component: RelPath,
  attempt: z.int().positive(),
  /** How the execution ended at the process level. */
  ended: z.enum(['exited', 'timed_out', 'idle_timed_out', 'cancelled', 'spawn_failed', 'service_failed']),
  exitCode: z.int().nullable(),
  signal: z.string().nullable(),
  /** ENOENT, EACCES, EPERM… when the program could not start (C-12 «الأخطاء»). */
  spawnError: z.string().nullable(),
  startedAt: IsoTimestamp,
  finishedAt: IsoTimestamp,
  durationMs: z.int().nonnegative(),
  command: z.strictObject({ argv: Argv, cwd: RelPath }).nullable(),
  /** 9.9: the names of the environment variables, never their values. */
  envKeys: z.array(z.string()),
  toolVersions: z.record(z.string(), z.string()),
  logs: z.strictObject({ stdout: EvidenceRef.nullable(), stderr: EvidenceRef.nullable() }),
  /** The raw reports found in the instance's reports/ folder, redacted and moved to the evidence store (D-46). */
  reports: z.array(EvidenceRef),
  /** The last lines of output (both streams, redacted), kept for the timeout and cancel screens (9.7). */
  tail: z.array(z.string()),
  lastActivityAt: IsoTimestamp.nullable(),
  sideEffects: SideEffects.nullable(),
  resources: z.strictObject({ samples: z.int().nonnegative(), peakRssKb: z.int().nonnegative(), maxCpuPercent: z.number().nonnegative(), lastCpuPercent: z.number().nonnegative() }),
  sleepGaps: z.array(SleepGap),
  leftovers: Leftovers,
  /** Message keys of notes shown with the result (e.g. run.note.escapeSuspected, run.note.outputTruncated). */
  notes: z.array(z.string()),
  /** Raw results the shared execution was copied from (D-45), when this instance did not run its own process. */
  sharedFrom: Id.nullable(),
  /**
   * Protocol 1.3 (DEV-6): one execution may run its invocation more than once, in turn — the attempts of
   * beh.stability's repetition mode, or Semgrep's batches of targets (D-DEV2-01). Each step's end, in order; the
   * fields above give the first step that did not end with 0, or the last one. Absent in results before 1.3.
   */
  steps: z.array(z.strictObject({ n: z.int().positive(), ended: z.enum(['exited', 'timed_out', 'idle_timed_out', 'cancelled', 'spawn_failed', 'service_failed']), exitCode: z.int().nullable(), signal: z.string().nullable(), durationMs: z.int().nonnegative() })).optional(),
  /** Protocol 1.3: the in-engine runner (an analyzer, C-13) that ran instead of a process, with its version. */
  internal: z.strictObject({ runner: z.string(), version: z.string() }).nullable().optional(),
});
export type RawCheckResult = z.infer<typeof RawCheckResult>;

export const RunCounts = z.strictObject({
  planned: z.int().nonnegative(),
  queued: z.int().nonnegative(),
  running: z.int().nonnegative(),
  finished: z.int().nonnegative(),
  byOutcome: z.partialRecord(CheckOutcome, z.int().nonnegative()),
});
export type RunCounts = z.infer<typeof RunCounts>;

/** The run as the events and the run list show it (9.6 point 4: no verdict while running). */
export const RunView = z.strictObject({
  runId: Id,
  displayId: z.string(),
  projectId: Id,
  planId: Id.nullable(),
  kind: RunKind,
  state: RunState,
  /** D-33: position in the visible queue while another run is active; 0 when active. */
  queuePosition: z.int().nonnegative().nullable(),
  startedAt: IsoTimestamp.nullable(),
  finishedAt: IsoTimestamp.nullable(),
  counts: RunCounts,
  /** 9.9: the project source changed during the run, outside the declared outputs. */
  stateChanged: z.boolean(),
  /** C-19 (protocol 1.3): the round's verdict, once the run finished; null for a section, a check, or while running. */
  verdict: PurityVerdict.nullable(),
  /** C-19 (protocol 1.3): never the number alone (11.5); null for a run that computes no index. */
  purity: PuritySummary.nullable(),
  keepForever: z.boolean(),
  /**
   * A cancelled run: the reason (user, app quit). Protocol 1.7 (DEV-12, 13.5 «القرص ممتلئ»): `disk_full`, a run the
   * executor stopped safely because the data volume ran low, before a write could fail.
   */
  cancelReason: z.enum(['user', 'app_quit', 'disk_full']).nullable(),
  /**
   * FR-26: while the run is running, it asks the main process to keep the system awake (the setting
   * run.preventSleep). The main process follows run.state and holds a power-save blocker for such runs.
   */
  preventSleep: z.boolean(),
});
export type RunView = z.infer<typeof RunView>;

export const CheckRunView = z.strictObject({
  checkRunId: Id,
  runId: Id,
  instance: CheckInstanceKey,
  checkId: z.string(),
  component: RelPath,
  state: CheckState,
  outcome: CheckOutcome.nullable(),
  /** A message key (run.outcome.*) with its parameters. */
  outcomeReason: Reason.nullable(),
  readiness: Readiness,
  coveredByCheckRunId: Id.nullable(),
  sharedInvocationKey: z.string().nullable(),
  startedAt: IsoTimestamp.nullable(),
  finishedAt: IsoTimestamp.nullable(),
  durationMs: z.int().nonnegative().nullable(),
  exitCode: z.int().nullable(),
  signal: z.string().nullable(),
  attempt: z.int().positive(),
  previousCheckRunId: Id.nullable(),
  lastActivityAt: IsoTimestamp.nullable(),
  notes: z.array(z.string()),
  /** G-17 (protocol 1.3): the automatic outcome, kept as it was when a review later decides «يحتاج مراجعة». */
  autoOutcome: CheckOutcome.nullable(),
  reviewId: Id.nullable(),
  /** 7.2-د for a «أخفق» or «تعذّر»: the project, or the tool and its configuration, or the environment. */
  origin: Origin.nullable(),
  /** The findings behind the outcome, by effect, with what a review excluded (D-35: never a silent exclusion). */
  findings: VerdictCounts,
});
export type CheckRunView = z.infer<typeof CheckRunView>;

export const SavedGroup = z.strictObject({
  id: Id,
  projectId: Id,
  name: z.string(),
  instances: z.array(CheckInstanceKey),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type SavedGroup = z.infer<typeof SavedGroup>;

/** One check execution with what the executor kept of it (run.get): its raw result and its evidence. */
export const CheckRunDetail = CheckRunView.extend({
  /** The raw result (C-12 «المخرجات»), or null for an execution that never started (missing, skipped…). */
  raw: RawCheckResult.nullable(),
  evidence: z.array(EvidenceRef),
});
export type CheckRunDetail = z.infer<typeof CheckRunDetail>;

/** run.get (protocol 1.2): the run, its frozen plan, and every check execution. */
export const RunDetail = z.strictObject({
  run: RunView,
  plan: RunPlan.nullable(),
  checks: z.array(CheckRunDetail),
  /** FR-36, 9.9: the files the run changed in the project, outside and inside the declared outputs. */
  stateChange: SideEffects.nullable(),
  /** C-19 (protocol 1.3): the round's or the section's index, with its breakdown, once the run finished. */
  purity: PurityResult.nullable(),
  /**
   * Protocol 1.6 (DEV-11): a finished run's state against the latest complete round's, by D-31's rule (no change
   * outside the declared outputs): «changed» makes the round «قديم» on the results and the overview (13.5).
   */
  sinceRound: z.enum(['same', 'changed']).optional(),
});
export type RunDetail = z.infer<typeof RunDetail>;

/** runs.list (protocol 1.2, FR-37): the project's runs, newest first, and the space its evidence uses. */
export const RunList = z.strictObject({
  runs: z.array(RunView),
  /** Evidence and snapshots of this project in AYAR's data folder (C-17 «صفحة توضح المساحة لكل مشروع»). */
  spaceUsedBytes: z.int().nonnegative(),
  retainRuns: z.int().positive(),
});
export type RunList = z.infer<typeof RunList>;
