// The verdict contracts (C-13, C-15, C-16; protocol 1.3, DEV-6). An adapter reads a tool's reports, an analyzer
// reads the project's files: both hand over a ParsedReport — test counts, the findings in AYAR's terms (each
// with an AYAR rule from the catalog and the tool's own rule beside it), the signals 7.3 needs (no inputs, a
// collection error, a configuration error, flakiness) and the problems met while reading (C-15 «حماية القراءة»).
// The adapter's exit map turns the exit code and the reports into one ExitSignal (rules 3 to 5 of 7.3). The
// classifier (C-16) then gives the outcome by the ordered rules of 7.3 and the policies of 7.4, and the findings
// become unified findings (14.2): fingerprint, display id, severity, proof, origin, cross-run status, review.
import { Id, IsoTimestamp, JsonValue } from '../common.ts';
import { z } from '../zod.ts';
import { Reason } from './profile.ts';
import { CheckOutcome, CrossRunStatus, Origin, Proof, Severity } from './terms.ts';

/**
 * 14.2 «الموضع»: a file (normalized relative to the project root, NFC; `outside` when the tool named a path
 * outside it, C-15), a line and column, a key (a manifest key, a permission, a test's full name), a commit (a
 * secret in the history), or a rendered state (the probe, DEV-7).
 */
export const FindingLocation = z.strictObject({
  path: z.string().max(4096).nullable(),
  outside: z.boolean().optional(),
  line: z.int().positive().optional(),
  column: z.int().positive().optional(),
  endLine: z.int().positive().optional(),
  endColumn: z.int().positive().optional(),
  key: z.string().max(1024).optional(),
  commit: z.string().regex(/^[0-9a-f]{7,64}$/).optional(),
  page: z.string().max(1024).optional(),
  state: z.string().max(256).optional(),
  viewport: z.string().max(32).optional(),
  theme: z.string().max(64).optional(),
  lang: z.string().max(16).optional(),
});
export type FindingLocation = z.infer<typeof FindingLocation>;

/**
 * C-15 «بصمة الاكتشاف»: what the anchor is made of, by kind. `code` and `secret` are computed by the engine from
 * the state snapshot (the normalized line with its neighbours; an HMAC of the value, in memory); the others carry
 * their value: a test's full name, `package@version#id` for a dependency, a permission's name, a manifest key, a
 * rendered state's key; `text` is the normalized message, for a finding with no place of its own.
 */
export const ANCHOR_KINDS = ['code', 'secret', 'test', 'dependency', 'permission', 'key', 'state', 'text'] as const;
export const FindingAnchor = z.strictObject({ kind: z.enum(ANCHOR_KINDS), value: z.string().max(4096) });
export type FindingAnchor = z.infer<typeof FindingAnchor>;

/**
 * What an adapter or analyzer reports, before the classifier. `level` matters for a proven finding: `error`
 * breaks the check's success criterion (7.3 rule 6), `warning` is what 7.4's warnings policy decides (rule 9).
 * A suspected finding's outcome is the catalog's per check (D-34); a suggestion never changes the outcome.
 */
export const ParsedFinding = z.strictObject({
  /** AYAR's rule (catalog `rules`), e.g. `test.failed`, `manifest.missing-file`, `ayar.js.eval-dynamic`. */
  rule: z.string().regex(/^[a-z][a-z0-9._-]*$/).max(128),
  /** The tool's own rule (`no-unused-vars`, `TS6133`, `F401`), or null. */
  toolRule: z.string().max(256).nullable(),
  /** From the tool or rule data (axe impact, CVSS, Semgrep severity); null: the rule's default. */
  severity: Severity.nullable(),
  /** Null: the rule's default. */
  proof: Proof.nullable(),
  level: z.enum(['error', 'warning']).nullable(),
  origin: Origin,
  /** The tool's message (read from a report already redacted on its way in, D-46; redacted again when stored). */
  message: z.string().max(4000),
  location: FindingLocation.nullable(),
  anchor: FindingAnchor,
  expected: z.string().max(2000).nullable(),
  actual: z.string().max(2000).nullable(),
});
export type ParsedFinding = z.infer<typeof ParsedFinding>;

export const TestCounts = z.strictObject({
  total: z.int().nonnegative(),
  passed: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  /** Errors outside a test (a collection error, a suite that failed to load). */
  errors: z.int().nonnegative(),
  /** Tests that passed after a retry (Playwright's `flaky`). */
  flaky: z.int().nonnegative(),
});
export type TestCounts = z.infer<typeof TestCounts>;

/** C-15 «حماية القراءة»: why a report could not be read, each a «تعذّر» reason of its own. */
export const REPORT_PROBLEMS = ['missing', 'empty', 'too_large', 'too_deep', 'malformed', 'dtd', 'unsupported', 'incomplete'] as const;
export const ReportProblem = z.strictObject({ code: z.enum(REPORT_PROBLEMS), file: z.string().max(512), detail: z.string().max(1000) });
export type ReportProblem = z.infer<typeof ReportProblem>;

export const ParsedReport = z.strictObject({
  /** The adapter or analyzer that read it, and its version (the adapter's mapping is part of the evidence). */
  reader: z.string(),
  readerVersion: z.string(),
  /** The formats read (`junit-xml`, `vitest-json`, `sarif-2.1.0`…). */
  formats: z.array(z.string()),
  tests: TestCounts.nullable(),
  findings: z.array(ParsedFinding).max(100_000),
  /** Findings beyond the limit kept: counted, not stored one by one. */
  findingsDropped: z.int().nonnegative(),
  signals: z.strictObject({
    /** The tool said it had nothing to run or read (Vitest «No test files found», `numTotalTests = 0`). */
    noInputs: z.boolean(),
    /** A collection or import error in a test file (pytest code 2 with an `<error>` in collection). */
    collectionError: z.boolean(),
    /** The tool reported its own configuration as broken. */
    configError: z.boolean(),
    /** A flaky signal: Playwright's `flaky`, or attempts that disagree (beh.stability). */
    flaky: z.boolean(),
    /** Items the tool left undecided (axe «incomplete», lychee 401/403/429). */
    unresolved: z.int().nonnegative(),
  }),
  problems: z.array(ReportProblem),
  /** Facts the reader keeps with the evidence (the OSV database date, sizes, the attempts…). */
  info: z.record(z.string(), JsonValue),
});
export type ParsedReport = z.infer<typeof ParsedReport>;

/**
 * The adapter's exit map (C-15 `exitMap`): the process's end with the reports, as one signal for 7.3 rules 3 to
 * 5. `ok` hands the decision to the findings (rules 6 to 10). Rule 1 (the process did not complete) is the
 * executor's and the classifier's, before any adapter is asked.
 */
export const ExitSignal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok') }),
  z.strictObject({ kind: z.literal('missing'), reason: Reason }),
  z.strictObject({ kind: z.literal('tool_error'), reason: Reason }),
  z.strictObject({ kind: z.literal('conflict'), reason: Reason }),
  /** The tool's run was a project failure that no single finding carries (a build that broke without a parsed error). */
  z.strictObject({ kind: z.literal('project_failure'), reason: Reason }),
]);
export type ExitSignal = z.infer<typeof ExitSignal>;

/** The unified finding (14.2): what results.query and finding.get return. */
export const Finding = z.strictObject({
  id: Id,
  /** `AYR-{SECTION}-{CODE}-{NNNN}`, stable for the fingerprint within the project (C-16, G-33). */
  displayId: z.string().regex(/^AYR-[A-Z]{3}-[A-Z0-9]{2,8}-\d{4,}$/),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  runId: Id,
  checkRunId: Id,
  checkId: z.string(),
  component: z.string(),
  ruleId: z.string(),
  ruleVersion: z.string(),
  toolRuleId: z.string().nullable(),
  severity: Severity,
  proof: Proof,
  origin: Origin,
  /** `catalog.rule.<rule>.title`. */
  titleKey: z.string(),
  message: z.string(),
  location: FindingLocation.nullable(),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  evidenceIds: z.array(Id),
  firstSeenRunId: Id.nullable(),
  crossRunStatus: CrossRunStatus,
  reviewId: Id.nullable(),
  /** D-35: a human review marked it a false alarm and its anchor has not changed: it does not count, and shows. */
  excludedByReview: z.boolean(),
  /** How it weighed in the outcome: a violation, a warning, a review item, or a note (suggestion, ignored warning). */
  effect: z.enum(['violation', 'warning', 'review', 'note', 'excluded']),
});
export type Finding = z.infer<typeof Finding>;

/** results.query (protocol 1.3): the filters, all optional. */
export const ResultsFilter = z.strictObject({
  runId: Id.optional(),
  checkRunId: Id.optional(),
  checkId: z.string().max(200).optional(),
  section: z.string().regex(/^[a-z]+$/).optional(),
  severity: z.array(Severity).optional(),
  proof: z.array(Proof).optional(),
  crossRun: z.array(CrossRunStatus).optional(),
  /** Include the findings a review excluded (they are always counted apart). */
  includeExcluded: z.boolean().optional(),
  limit: z.int().min(1).max(1000).optional(),
  offset: z.int().nonnegative().optional(),
});
export type ResultsFilter = z.infer<typeof ResultsFilter>;

export const ResultsPage = z.strictObject({
  findings: z.array(Finding),
  total: z.int().nonnegative(),
  /** The fingerprints of the previous comparable executions that are gone in the run asked for («زال», AT-22). */
  resolved: z.array(z.strictObject({ fingerprint: z.string(), displayId: z.string(), checkId: z.string(), component: z.string(), ruleId: z.string(), location: FindingLocation.nullable() })),
  excludedByReview: z.int().nonnegative(),
});
export type ResultsPage = z.infer<typeof ResultsPage>;

export const FindingDetail = z.strictObject({
  finding: Finding,
  /** Earlier executions of the same instance where the same fingerprint was seen, newest first. */
  history: z.array(z.strictObject({ runId: Id, checkRunId: Id, at: IsoTimestamp.nullable(), outcome: CheckOutcome.nullable() })),
});
export type FindingDetail = z.infer<typeof FindingDetail>;

/** How the classifier explains an outcome beside its reason: counts by effect, and what a review excluded. */
export const VerdictCounts = z.strictObject({
  violations: z.int().nonnegative(),
  warnings: z.int().nonnegative(),
  review: z.int().nonnegative(),
  notes: z.int().nonnegative(),
  excludedByReview: z.int().nonnegative(),
});
export type VerdictCounts = z.infer<typeof VerdictCounts>;
