// The report contracts (C-21, C-23; plan 12, D-11, D-40; protocol 1.5, DEV-9). One data object `report/1` is built
// from the verdict and the evidence of a run, of chosen findings (a fix prompt, `FIX-…`) or of a task card; from it,
// and from nothing else, two formats are derived: «لك» (12.2, human) and «للنموذج» (12.3 and 12.4, the
// `model-report/1` template). A parity check over the ids, the outcomes, the counts, the scope and the verdict runs
// before anything is shown (12.1: «فلا تقول صيغة ما تنكره الأخرى»); its failure is an internal error. The JSON export
// `ayar-report/1` (14.2) is the serialization of `report/1` with a `meta` head (G-22).
import { Id, IsoTimestamp, Lang } from '../common.ts';
import { z } from '../zod.ts';
import { FindingLocation } from './findings.ts';
import { Reason } from './profile.ts';
import { PurityResult } from './purity.ts';
import { CheckOutcome, CrossRunStatus, Origin, Proof, Severity } from './terms.ts';

export const REPORT_SCHEMA = 'report/1' as const;
export const MODEL_REPORT_TEMPLATE = 'model-report/1' as const;
export const EXPORT_REPORT_SCHEMA = 'ayar-report/1' as const;

/** 12.7: the next step of a result or a finding; «none» shows its reason and has no button. */
export const NEXT_STEPS = ['direct', 'model', 'review', 'none'] as const;
export const NextStep = z.enum(NEXT_STEPS);
export type NextStep = z.infer<typeof NextStep>;

/**
 * 12.7: the classified next step with the button it gets in «لك». `direct` names its action (setup, approve,
 * define, install, re-check a claim); `model` is «حدّد للنسخ»; `review` is «راجع وقرّر»; `none` carries its reason.
 */
export const NextStepInfo = z.strictObject({
  kind: NextStep,
  /** For `direct`: setup | approve | define | install | recheck; for the others null. */
  action: z.enum(['setup', 'approve', 'define', 'install', 'recheck']).nullable(),
  reason: Reason,
  /** 12.7: a warning that may be fixed by hand too («أو عدّله بنفسك إن كان بسيطًا»). */
  orByHand: z.boolean(),
});
export type NextStepInfo = z.infer<typeof NextStepInfo>;

/** 12.10: the cost tag of a check or an action. */
export const CostTag = z.enum(['local', 'network', 'model']);
export type CostTag = z.infer<typeof CostTag>;

/** The head of the report (12.1 «رأس التقرير»). */
export const ReportHead = z.strictObject({
  project: z.strictObject({ id: Id, name: z.string(), ecosystems: z.array(z.string()) }),
  run: z
    .strictObject({
      id: Id,
      displayId: z.string(),
      kind: z.string(),
      startedAt: IsoTimestamp.nullable(),
      finishedAt: IsoTimestamp.nullable(),
      durationMs: z.int().nonnegative().nullable(),
      roundDisplayId: z.string().nullable(),
      /** Protocol 1.6 (DEV-11): the run was cancelled — no verdict and no karat (plan 4 «أُلغي التشغيل»). */
      cancelled: z.literal(true).optional(),
    })
    .nullable(),
  /** The run's selection as words (full, section, chosen checks). */
  scope: z.strictObject({ kind: z.string(), section: z.string().nullable(), instances: z.int().nonnegative(), criteria: z.int().nonnegative(), checks: z.int().nonnegative() }),
  verdict: z.enum(['pure', 'incomplete', 'blocked']).nullable(),
  karat: z.int().min(0).max(24).nullable(),
  narrow: z.boolean(),
  counts: z.partialRecord(CheckOutcome, z.int().nonnegative()),
  /** Protocol 1.8: `ayar` is the version of AYAR the run was made with (null for an older run that did not record it). */
  versions: z.strictObject({ ayar: z.string().nullable(), profile: z.int().nullable(), profileHash: z.string().nullable(), catalog: z.string(), template: z.literal(MODEL_REPORT_TEMPLATE), tools: z.record(z.string(), z.string()) }),
  /**
   * The environment of the run as it recorded it when it started (protocol 1.8): the system, the environment's source,
   * Node and Python as its tools reported them (else as the project declared them), and the package manager. An
   * older run that recorded none has `recorded: false` and these null, never the machine's or the project's now.
   */
  environment: z.strictObject({ recorded: z.boolean(), source: z.string().nullable(), os: z.string().nullable(), node: z.string().nullable(), python: z.string().nullable(), packageManager: z.string().nullable() }),
  state: z.strictObject({
    /** The branch and the commit the run recorded when it started (18.1), never the project's later head (AUD-07). */
    branch: z.string().nullable(),
    commit: z.string().nullable(),
    /** Protocol 1.8 (AUD-07): the run recorded its Git head; false for an older run that did not (branch and commit null). */
    recorded: z.boolean(),
    /** Git's uncommitted changes: AYAR never runs Git in a project (D-38) and does not measure them, so null (unknown). */
    dirty: z.boolean().nullable(),
    /** Protocol 1.8 (AUD-05): the source changed during the run (integ.state's measure); null when the inventory could not tell. */
    changedDuringRun: z.boolean().nullable(),
    snapshotId: Id.nullable(),
    /** Protocol 1.6 (DEV-11): the state against the latest complete round's (D-31's rule); absent with no round. */
    sinceRound: z.enum(['same', 'changed']).optional(),
  }),
  createdAt: IsoTimestamp,
});
export type ReportHead = z.infer<typeof ReportHead>;

/** What a passed check proved (12.1 «ما أثبته إن اجتاز»). */
export const ProofOfPass = z.strictObject({
  /** A message key of the catalog (`catalog.check.<id>.proves`) with its parameters (counts). */
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  /** The scope the pass holds in: the component and the files counted. */
  scope: z.string(),
});

/** One check of the report (12.1 «لكل فحص»). */
export const ReportCheck = z.strictObject({
  instance: z.string(),
  checkId: z.string(),
  component: z.string(),
  section: z.string(),
  criterion: z.string().nullable(),
  checkRunId: Id.nullable(),
  outcome: CheckOutcome.nullable(),
  reason: Reason.nullable(),
  /** G-17: the automatic outcome a review changed, or null. */
  autoOutcome: CheckOutcome.nullable(),
  reviewed: z.boolean(),
  required: z.boolean(),
  blocking: z.boolean(),
  origin: Origin.nullable(),
  proves: ProofOfPass.nullable(),
  /** `catalog.check.<id>.limits`. */
  limitsKey: z.string(),
  cost: CostTag,
  nextStep: NextStepInfo,
  evidenceIds: z.array(Id),
  findingIds: z.array(z.string()),
  /** The literal command (the approved invocation), for the «خطوات الإعادة» (12.1). */
  command: z.strictObject({ argv: z.array(z.string()), cwd: z.string() }).nullable(),
  /** Notes of the run (run.note.projectCommandNetwork, probe.note.externalBlocked…): message keys. */
  notes: z.array(z.string()),
  tests: z.strictObject({ total: z.int().nonnegative(), passed: z.int().nonnegative(), failed: z.int().nonnegative(), skipped: z.int().nonnegative(), flaky: z.int().nonnegative() }).nullable(),
  durationMs: z.int().nonnegative().nullable(),
});
export type ReportCheck = z.infer<typeof ReportCheck>;

/** An excerpt of evidence, redacted and bounded (12.5: 40 lines or 4000 characters), with where it came from. */
export const EvidenceExcerpt = z.strictObject({
  evidenceId: Id.nullable(),
  source: z.string(),
  range: z.string(),
  text: z.string(),
  truncated: z.boolean(),
});
export type EvidenceExcerpt = z.infer<typeof EvidenceExcerpt>;

/** One finding of the report, with the mandatory fields of 12.1 (D-11). */
export const ReportFinding = z.strictObject({
  id: Id,
  displayId: z.string(),
  fingerprint: z.string(),
  checkId: z.string(),
  component: z.string(),
  checkRunId: Id,
  ruleId: z.string(),
  ruleVersion: z.string(),
  toolRuleId: z.string().nullable(),
  /** `catalog.rule.<rule>.title`. */
  titleKey: z.string(),
  message: z.string(),
  severity: Severity,
  proof: Proof,
  origin: Origin,
  blocking: z.boolean(),
  effect: z.enum(['violation', 'warning', 'review', 'note', 'excluded']),
  crossRunStatus: CrossRunStatus,
  location: FindingLocation.nullable(),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  /** 12.1 «خطوات الإعادة والأمر». */
  reproduce: z.strictObject({ steps: z.array(z.string()), command: z.string().nullable() }),
  evidence: EvidenceExcerpt.nullable(),
  /** `catalog.rule.<rule>.impact` (the «لك» text) — absent when the catalog has none. */
  impactKey: z.string().nullable(),
  /** 12.5 rule 5: the fix from the rule's template when the cause is the rule's, else a diagnosis request. */
  fix: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('suggested'), key: z.string(), evidence: z.string() }), z.strictObject({ kind: z.literal('diagnose'), steps: z.array(z.string()) })]),
  /** 12.1 «اختبار القبول»: what must hold, and the check that proves it. */
  acceptance: z.strictObject({ key: z.string(), check: z.string() }),
  reference: z.strictObject({ name: z.string(), url: z.string() }).nullable(),
  nextStep: NextStepInfo,
  reviewId: Id.nullable(),
  /** A model claim this finding was proven from (12.9: «مع الإشارة إلى الادعاء مصدرًا»), or null. */
  fromClaim: z.string().nullable(),
});
export type ReportFinding = z.infer<typeof ReportFinding>;

/** 12.1 «ما لم يُشغَّل». */
export const ReportNotRun = z.strictObject({
  instance: z.string(),
  checkId: z.string(),
  component: z.string(),
  outcome: CheckOutcome,
  reason: Reason.nullable(),
  nextStep: NextStepInfo,
  cost: CostTag,
});
export type ReportNotRun = z.infer<typeof ReportNotRun>;

/** A model claim as the report shows it (12.9): never a finding, never a pass. */
export const ReportClaim = z.strictObject({
  displayId: z.string(),
  aiCheckDisplayId: z.string(),
  template: z.string(),
  kind: z.enum(['suspicion', 'suggestion', 'question']),
  severitySuggested: Severity.nullable(),
  location: FindingLocation.nullable(),
  summary: z.string(),
  status: z.enum(['open', 'proven', 'decided_card', 'decided_not_issue']),
  matchedCheckId: z.string().nullable(),
  provenFindingDisplayId: z.string().nullable(),
  nextStep: NextStepInfo,
});
export type ReportClaim = z.infer<typeof ReportClaim>;

/** 12.1 «النزاهة». */
export const ReportIntegrity = z.strictObject({
  checks: z.array(z.strictObject({ checkId: z.string(), outcome: CheckOutcome.nullable(), reason: Reason.nullable(), findingIds: z.array(z.string()) })),
  stateChanged: z.boolean(),
  changedFiles: z.array(z.string()),
  guardUnreviewed: z.int().nonnegative(),
  claimsOpen: z.int().nonnegative(),
  reviewsExpired: z.int().nonnegative(),
  reviews: z.array(z.strictObject({ id: Id, target: z.string(), decision: z.string(), valid: z.boolean(), createdAt: IsoTimestamp })),
  claims: z.array(ReportClaim),
  /** 11.3: how many of the four panels block «نقي». */
  blocksPure: z.int().nonnegative(),
});
export type ReportIntegrity = z.infer<typeof ReportIntegrity>;

/** 12.1 «ما يبقى غير مثبت». */
export const ReportUnproven = z.strictObject({
  limitsKeys: z.array(z.string()),
  pendingReviews: z.array(z.string()),
  notIncluded: z.array(z.string()),
});
export type ReportUnproven = z.infer<typeof ReportUnproven>;

export const ReportTargetView = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('run'), runId: Id }),
  z.strictObject({ kind: z.literal('findings'), findingIds: z.array(Id) }),
  z.strictObject({ kind: z.literal('card'), taskId: Id, taskDisplayId: z.string() }),
]);
export type ReportTargetView = z.infer<typeof ReportTargetView>;

/** The one data object (12.1, D-40). */
export const Report = z.strictObject({
  schema: z.literal(REPORT_SCHEMA),
  /** `RUN-…` for a run, `FIX-YYYYMMDD-NNN` for chosen findings, `TASK-NNNN` for a card (G-23, D-36). */
  displayId: z.string(),
  target: ReportTargetView,
  head: ReportHead,
  checks: z.array(ReportCheck),
  findings: z.array(ReportFinding),
  notRun: z.array(ReportNotRun),
  integrity: ReportIntegrity,
  unproven: ReportUnproven,
  purity: PurityResult.nullable(),
  /** The card's text (a card report) — the model text is the card itself, with the rules. */
  card: z.string().nullable(),
  /** 12.5 rule 3: the random six-hex-digit token of this report's data boundaries. */
  token: z.string().regex(/^[0-9a-f]{6}$/),
});
export type Report = z.infer<typeof Report>;

/** report.build options (12.6 «الخيارات»). */
export const ReportOptions = z.strictObject({
  lang: Lang,
  /** For a run: the whole run with what passed (default), or its issues alone. */
  scope: z.enum(['wholeRun', 'allFindings']).optional(),
  /** 12.6: the longer evidence appendix. */
  longEvidence: z.boolean().optional(),
  /** 12.5 rule 2: the limits, when the user adjusted them. */
  limits: z.strictObject({ excerptLines: z.int().min(5).max(400).optional(), excerptChars: z.int().min(200).max(40_000).optional(), promptChars: z.int().min(2000).max(400_000).optional(), runChars: z.int().min(2000).max(1_000_000).optional() }).optional(),
  /** 12.6: «وأنشئ بطاقة تحقق» — a fix-verification card per chosen finding, kept until the recheck. */
  createVerificationCards: z.boolean().optional(),
});
export type ReportOptions = z.infer<typeof ReportOptions>;

export const RedactionSummary = z.strictObject({ total: z.int().nonnegative(), byRule: z.record(z.string(), z.int().nonnegative()) });
export type RedactionSummary = z.infer<typeof RedactionSummary>;

/** The parity check of 12.1 (FR-63): what was compared, and where the formats disagreed. */
export const ParityResult = z.strictObject({
  ok: z.boolean(),
  /** Each line: `ids`, `outcomes`, `counts`, `scope`, `verdict`, `limits`, with what differed. */
  mismatches: z.array(z.strictObject({ field: z.string(), human: z.string(), model: z.string() })),
  checked: z.strictObject({ findingIds: z.int().nonnegative(), checks: z.int().nonnegative(), limits: z.int().nonnegative() }),
});
export type ParityResult = z.infer<typeof ParityResult>;

/** One rendered format with its counters (12.6 «عدادات»). */
export const RenderedFormat = z.strictObject({
  text: z.string(),
  chars: z.int().nonnegative(),
  /** 12.5 rule 2: the text was cut at its limit; `suggestion` says how to split (by sections, then by findings). */
  truncated: z.boolean(),
  splitSuggestion: Reason.nullable(),
  redactions: RedactionSummary,
});
export type RenderedFormat = z.infer<typeof RenderedFormat>;

/** report.build's result: the report, both formats, the parity, and the row kept in `reports`. */
export const ReportBuilt = z.strictObject({
  reportId: Id,
  displayId: z.string(),
  lang: Lang,
  report: Report,
  human: RenderedFormat,
  model: RenderedFormat,
  parity: ParityResult,
  /** 12.5 rule 1: a high-confidence secret survived the second pass; copying and exporting are refused. */
  blocked: z.strictObject({ reason: z.string(), where: z.string() }).nullable(),
  /** The `TASK-NNNN` of the verification cards created with it (12.6). */
  verificationCards: z.array(z.string()),
});
export type ReportBuilt = z.infer<typeof ReportBuilt>;

/** 11.5 and C-22 «المقارنة»: two runs side by side, with comparability notes (AT-22). */
export const RunComparison = z.strictObject({
  from: z.strictObject({ runId: Id, displayId: z.string(), roundDisplayId: z.string().nullable(), karat: z.int().nullable(), verdict: z.string().nullable(), criteria: z.int().nonnegative(), checks: z.int().nonnegative(), blockingFailures: z.int().nonnegative() }),
  to: z.strictObject({ runId: Id, displayId: z.string(), roundDisplayId: z.string().nullable(), karat: z.int().nullable(), verdict: z.string().nullable(), criteria: z.int().nonnegative(), checks: z.int().nonnegative(), blockingFailures: z.int().nonnegative() }),
  /** 11.5: profile version, catalog, formula, tool versions, environment, scope. Empty: directly comparable. */
  notes: z.array(Reason),
  /** 11.5: «لا يُوصف ارتفاع العيار «تحسنًا» إن زادت الإخفاقات الحاجبة أو تغير النطاق». */
  karatChange: z.enum(['improved', 'declined', 'same', 'not_comparable', 'no_karat']),
  checks: z.array(z.strictObject({ instance: z.string(), before: CheckOutcome.nullable(), after: CheckOutcome.nullable(), changed: z.boolean() })),
  findings: z.strictObject({
    resolved: z.array(z.strictObject({ displayId: z.string(), checkId: z.string(), ruleId: z.string(), location: FindingLocation.nullable() })),
    new: z.array(z.strictObject({ displayId: z.string(), checkId: z.string(), ruleId: z.string(), location: FindingLocation.nullable() })),
    persisting: z.array(z.strictObject({ displayId: z.string(), checkId: z.string(), ruleId: z.string(), location: FindingLocation.nullable() })),
    reappeared: z.array(z.strictObject({ displayId: z.string(), checkId: z.string(), ruleId: z.string(), location: FindingLocation.nullable() })),
  }),
});
export type RunComparison = z.infer<typeof RunComparison>;

/** The `meta` head of `ayar-report/1` (14.2). */
export const ExportMeta = z.strictObject({
  schema: z.literal(EXPORT_REPORT_SCHEMA),
  ayar: z.string(),
  format: z.enum(['markdown', 'html', 'json', 'evidence-bundle']),
  lang: Lang,
  generatedAt: IsoTimestamp,
  profile: z.int().nullable(),
  catalog: z.string(),
  environment: z.string().nullable(),
  git: z.strictObject({ branch: z.string().nullable(), commit: z.string().nullable() }),
  snapshotId: Id.nullable(),
});

/** report.export's result. */
export const ReportExported = z.strictObject({
  written: z.literal(true),
  format: z.enum(['markdown', 'html', 'json', 'evidence-bundle']),
  bytes: z.int().nonnegative(),
  sha256: z.string(),
  /** The evidence files included in a bundle, and those excluded as damaged (C-23 «الأخطاء»). */
  evidence: z.strictObject({ included: z.int().nonnegative(), damaged: z.array(Id), screenshots: z.int().nonnegative() }).nullable(),
  redactions: RedactionSummary,
});
export type ReportExported = z.infer<typeof ReportExported>;

/** A kept report (the `reports` table), listed for a project. */
export const ReportRecord = z.strictObject({
  id: Id,
  displayId: z.string(),
  projectId: Id,
  runId: Id.nullable(),
  targetKind: z.enum(['run', 'findings', 'card']),
  findingIds: z.array(Id),
  lang: Lang,
  templateVersion: z.string(),
  humanChars: z.int().nonnegative().nullable(),
  modelChars: z.int().nonnegative().nullable(),
  redactions: RedactionSummary,
  parityOk: z.boolean().nullable(),
  copiedAt: IsoTimestamp.nullable(),
  createdAt: IsoTimestamp,
});
export type ReportRecord = z.infer<typeof ReportRecord>;
