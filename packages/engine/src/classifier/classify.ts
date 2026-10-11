// C-16 the results classifier [D-30, D-34, D-35, 7.3, 7.4], as a pure function: the outcome of one check execution
// by the ordered rules of 7.3 — the first rule that applies decides — with the policies of 7.4, and every finding
// given its severity, proof, level and effect from the catalog's rule book (G-38). Rule 1 (the process did not
// complete) is the executor's (C-12 «what the process itself says»), and rule 2 (a dependency did not succeed) is the
// scheduler's: neither reaches here, so this function starts at rule 3 with a process that exited on its own.
//
//   3. a requirement missing (the adapter's exit map: no tests, pytest 5, OSV 128 «no lock files») → «ناقص»
//   4. the tool or its configuration failed, or a report could not be read (C-15 «حماية القراءة») → «تعذّر»
//   5. the exit code and the reports disagree, unexplained by the map → «تعذّر» («تعارض الأدلة»; never a pass)
//   6. a proven violation of the success criterion (or a warning the policy makes a failure) → «أخفق»
//   7. a flaky signal → «متذبذب» (or «أخفق» by the flaky policy); with a failure, rule 6 has already decided
//   8. undecided items, a suspicion the catalog sends to review, the integrity guard touching it → «يحتاج مراجعة»
//   9. warnings the policy counts (and suspicions the catalog makes warnings) → «تحذير»
//  10. otherwise, with the full evidence the adapter vouched for → «اجتاز», with its suggestions as notes
//
// A finding a human review marked a false alarm, with its anchor unchanged, is «excluded»: it never counts, and its
// number is always shown (D-35). Lack of data is never a pass: no report reading is «تعذّر» (C-16 «الأخطاء»).
import type { CheckOutcome, ExitSignal, Origin, ParsedFinding, ParsedReport, Proof, Reason, Severity, VerdictCounts } from '@ayar/protocol';

/** What the catalog's rule book says of one rule (G-38). */
export interface RuleFacts {
  severity: Severity;
  proof: Proof;
  level: 'error' | 'warning' | null;
  origin?: 'project' | 'tool';
}

export interface ClassifyPolicy {
  /** 7.4 «سياسة التحذيرات»: ignore (they become notes), warn, or fail. */
  warnings: 'ignore' | 'warn' | 'fail';
  /** 7.4 «سياسة التذبذب». */
  flaky: 'flaky' | 'fail';
}

export type FindingEffect = 'violation' | 'warning' | 'review' | 'note' | 'excluded';

/** A finding of the report, as the classifier weighed it. */
export interface WeighedFinding extends ParsedFinding {
  severity: Severity;
  proof: Proof;
  effect: FindingEffect;
}

export interface ClassifyInput {
  checkId: string;
  exit: ExitSignal;
  report: ParsedReport;
  policy: ClassifyPolicy;
  /** D-34: what a suspected finding of this check gives, per the catalog. */
  suspected: 'warning' | 'needs_review';
  rule: (id: string) => RuleFacts | undefined;
  /** Tool rules whose matches are generic (10.3): their findings are suspicions. */
  suspectedToolRules: readonly string[];
  /** Indexes (into report.findings) of the findings a still-valid review excluded (D-35). */
  excluded: ReadonlySet<number>;
  /** 7.3 rule 8: a finding of the integrity guard touches this check (DEV-9 feeds it). */
  guardTouches: boolean;
}

export interface Classification {
  outcome: CheckOutcome;
  reason: Reason;
  /** 7.2-د for a failure or an error: the project, or the tool and its configuration. Null otherwise. */
  origin: Origin | null;
  findings: WeighedFinding[];
  counts: VerdictCounts;
}

const UNKNOWN_RULE: RuleFacts = { severity: 'medium', proof: 'suspected', level: null };

/** The finding's severity, proof and effect (D-34, 7.4, D-35). */
export function weigh(f: ParsedFinding, i: Pick<ClassifyInput, 'rule' | 'suspectedToolRules' | 'policy' | 'suspected'>, excluded: boolean): WeighedFinding {
  // An unknown rule is a suspicion: never a proven violation on data the book does not vouch for.
  const facts = i.rule(f.rule) ?? UNKNOWN_RULE;
  const severity = f.severity ?? facts.severity;
  let proof: Proof = f.proof ?? facts.proof;
  if (proof === 'proven' && f.toolRule !== null && i.suspectedToolRules.includes(f.toolRule)) proof = 'suspected';
  if (!i.rule(f.rule) && proof === 'proven') proof = 'suspected';
  const level = proof === 'proven' ? (f.level ?? facts.level) : null;
  let effect: FindingEffect;
  if (excluded) effect = 'excluded';
  // C-22 (DEV-9): a guard effect attached to the check it touches is a review item, never a warning (7.3 rule 8).
  else if (f.rule.startsWith('guard.')) effect = 'review';
  else if (proof === 'suggestion') effect = 'note';
  else if (proof === 'suspected') effect = i.suspected === 'needs_review' ? 'review' : 'warning';
  else if (level === 'error') effect = 'violation';
  else if (level === 'warning') effect = i.policy.warnings === 'fail' ? 'violation' : i.policy.warnings === 'warn' ? 'warning' : 'note';
  // A proven signal with no level (test.flaky) is rule 7's, carried by the report's flaky signal; as a finding it
  // is shown, and does not count twice.
  else effect = 'note';
  return { ...f, severity, proof, level, effect };
}

function count(findings: readonly WeighedFinding[]): VerdictCounts {
  const c: VerdictCounts = { violations: 0, warnings: 0, review: 0, notes: 0, excludedByReview: 0 };
  for (const f of findings) {
    if (f.effect === 'violation') c.violations++;
    else if (f.effect === 'warning') c.warnings++;
    else if (f.effect === 'review') c.review++;
    else if (f.effect === 'note') c.notes++;
    else c.excludedByReview++;
  }
  return c;
}

/** A reason key is camelCase (the Reason schema): the problem's code in it (too_large → tooLarge). */
export const reportWord = (code: string): string => code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The first report problem, as a «تعذّر» reason (C-15 «حماية القراءة»). */
function problemReason(p: ParsedReport['problems'][number]): Reason {
  return { key: `verdict.reason.report.${reportWord(p.code)}`, params: { file: p.file, detail: p.detail.slice(0, 300) } };
}

export function classify(i: ClassifyInput): Classification {
  const findings = i.report.findings.map((f, n) => weigh(f, i, i.excluded.has(n)));
  const counts = count(findings);
  const done = (outcome: CheckOutcome, reason: Reason, origin: Origin | null = null): Classification => ({ outcome, reason, origin, findings, counts });

  // 3. A requirement is missing.
  if (i.exit.kind === 'missing') return done('missing', i.exit.reason);
  // 4. The tool or its configuration failed; or a report could not be read.
  if (i.exit.kind === 'tool_error') return done('unavailable', i.exit.reason, 'tool');
  if (i.report.problems.length) return done('unavailable', problemReason(i.report.problems[0]!), 'tool');
  // 5. The exit and the reports disagree: never a pass.
  if (i.exit.kind === 'conflict') return done('unavailable', i.exit.reason, 'tool');

  // 6. A proven violation (D-34: «حاجب» plays no part here; 11.3 alone).
  const tests = i.report.tests;
  if (i.exit.kind === 'project_failure') return done('failed', i.exit.reason, 'project');
  if (counts.violations > 0) {
    const reason: Reason = tests && tests.failed > 0 ? { key: 'verdict.reason.testsFailed', params: { failed: tests.failed, total: tests.total } } : { key: 'verdict.reason.violations', params: { count: counts.violations } };
    return done('failed', reason, findings.some((f) => f.effect === 'violation' && f.origin === 'project') ? 'project' : 'tool');
  }
  // 7. Flakiness (D-20): counted for nothing; or a failure by the policy.
  const flaky = i.report.signals.flaky;
  if (flaky) {
    const n = Math.max(tests?.flaky ?? 0, findings.filter((f) => f.rule === 'test.flaky').length, 1);
    return i.policy.flaky === 'fail' ? done('failed', { key: 'verdict.reason.flakyAsFailure', params: { count: n } }, 'project') : done('flaky', { key: 'verdict.reason.flaky', params: { count: n } });
  }
  // 8. Undecided: a suspicion the catalog sends to review, items the tool left open, the integrity guard.
  if (i.guardTouches) return done('needs_review', { key: 'verdict.reason.guardTouched' });
  if (i.report.signals.unresolved > 0) return done('needs_review', { key: 'verdict.reason.unresolved', params: { count: i.report.signals.unresolved } });
  if (counts.review > 0) return done('needs_review', { key: 'verdict.reason.review', params: { count: counts.review } });
  // 9. Warnings the policy counts.
  if (counts.warnings > 0) return done('warning', { key: 'verdict.reason.warnings', params: { count: counts.warnings } });
  // 10. A pass, with the evidence the adapter vouched for (its exit map said ok); a test report where no test ran
  //     vouches for nothing: «ناقص» (2.5 «لا اجتياز بلا دليل»), whatever an adapter's map let through.
  if (tests && tests.passed + tests.flaky === 0) return done('missing', { key: 'verdict.reason.noTestsRan', params: { total: tests.total } });
  if (tests) return done('passed', { key: 'verdict.reason.testsPassed', params: { passed: tests.passed, total: tests.total } });
  return done('passed', { key: counts.notes > 0 ? 'verdict.reason.passedWithNotes' : 'verdict.reason.passed', params: { notes: counts.notes } });
}
