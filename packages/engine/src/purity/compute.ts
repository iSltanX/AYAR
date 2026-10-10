// C-19 the purity index `purity/1` (plan 11, D-10), as a pure function: the property tests and the examples of 11.7
// drive it directly. R is the required, applicable checks of the index in scope (11.2); each belongs to one
// criterion k; a criterion counts once, whatever the number of its checks (weight 1/n_k inside it, 1/K overall);
// credit is 1 for «اجتاز» (and «اجتاز بمراجعة») only (11.4 rule 1). The karat is floor(24 × P), computed with exact
// integers so that 24 appears only when P is exactly 1 (11.2: «لا تُقرّب درجة ناقصة إلى اكتمال»). The verdict
// (11.3) is «محجوب» on any blocking failure, else «غير مكتمل» when P < 1, K = 0, or an integrity reason holds
// (an integ.* check neither passed nor not applicable, the state changed, a guard finding or a model claim
// unreviewed, a review expired), else «نقي». A section has a karat marked «جزئي» and no verdict (11.5).
import type { CheckOutcome, IntegrityInputs, PurityCheckLine, PurityCriterionLine, PurityMeta, PurityResult, PurityScope, PuritySummary, Reason } from '@ayar/protocol';
import { PURITY_FORMULA } from '@ayar/protocol';

export const DEFAULT_NARROW_THRESHOLD = 3;

/** One instance of the profile in the round or section, as the classifier left it. */
export interface PurityCheckInput {
  instance: string;
  checkId: string;
  component: string;
  section: string;
  /** The criterion of 11.6, or null for a check outside the index (code.complexity, integ.*). */
  criterion: string | null;
  inIndex: boolean;
  required: boolean;
  applicable: boolean;
  blocking: boolean;
  /** Null: no result in this round («الغائب»). */
  outcome: CheckOutcome | null;
  /** The outcome came from a human review («اجتاز بمراجعة» / «أخفق بمراجعة», G-17). */
  reviewed: boolean;
  /** Violations behind a failure (shown with a blocking failure, 11.5). */
  violations: number;
  /** Findings a review excluded as false alarms (11.4 rule 7). */
  excludedByReview: number;
  checkRunId: string | null;
}

export interface PurityInput {
  scope: PurityScope;
  checks: readonly PurityCheckInput[];
  integrity: IntegrityInputs;
  /** 11.4 rule 4: below this K the scope is narrow (3 by default; a setting). */
  narrowThreshold?: number;
  meta: PurityMeta;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const lcm = (a: bigint, b: bigint): bigint => (a / gcd(a, b)) * b;

/** A reason key is camelCase (the Reason schema): the outcome's word in it. */
export const outcomeWord = (o: CheckOutcome): string => o.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The outcomes that keep a check out of the count, in the order the reasons list them (11.4 rule 1). */
const NOT_COUNTED: readonly CheckOutcome[] = ['failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped'];

/** Is this instance in R (11.2): required, applicable, of the index, with a criterion, and in scope. */
export function inR(c: PurityCheckInput, scope: PurityScope): boolean {
  if (!c.required || !c.applicable || !c.inIndex || c.criterion === null) return false;
  if (c.section === 'integrity' || c.section === 'model') return false;
  return scope.kind === 'round' || c.section === scope.section;
}

export function computePurity(input: PurityInput): PurityResult {
  const threshold = input.narrowThreshold ?? DEFAULT_NARROW_THRESHOLD;
  const scoped = input.checks.filter((c) => input.scope.kind === 'round' || c.section === input.scope.section);
  const R = scoped.filter((c) => inR(c, input.scope)).sort((a, b) => (a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : 0));

  // Criteria, in the order their first check appears in R (sorted), so the breakdown is stable (NFR-10).
  const byCriterion = new Map<string, { section: string; n: number; passed: number }>();
  const lines: PurityCheckLine[] = [];
  const byOutcome: Partial<Record<CheckOutcome, number>> = {};
  let absent = 0;
  for (const c of R) {
    const credit = c.outcome === 'passed' ? 1 : 0;
    const k = byCriterion.get(c.criterion!) ?? { section: c.section, n: 0, passed: 0 };
    k.n += 1;
    k.passed += credit;
    byCriterion.set(c.criterion!, k);
    if (c.outcome === null) absent += 1;
    else byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;
    lines.push({ instance: c.instance, checkId: c.checkId, component: c.component, criterion: c.criterion!, blocking: c.blocking, outcome: c.outcome, reviewed: c.reviewed, credit, checkRunId: c.checkRunId });
  }
  const criteria: PurityCriterionLine[] = [...byCriterion]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, k]) => ({ id, section: k.section, n: k.n, passed: k.passed, share: k.passed / k.n }));
  const K = criteria.length;

  // P = (Σ_k passed_k / n_k) / K, exactly: over the common denominator L = lcm(n_k), P = Σ passed_k·(L/n_k) / (K·L).
  let karat: number | null = null;
  let p: number | null = null;
  if (K > 0) {
    const L = criteria.reduce((acc, k) => lcm(acc, BigInt(k.n)), 1n);
    const num = criteria.reduce((acc, k) => acc + BigInt(k.passed) * (L / BigInt(k.n)), 0n);
    const den = BigInt(K) * L;
    karat = Number((24n * num) / den);
    p = Number(num) / Number(den);
    if (num === den) p = 1;
  }

  // Blocking failures (11.3): any blocking check of the scope that failed, required or not (D-10: never hidden).
  const blockingFailures = scoped
    .filter((c) => c.blocking && c.applicable && c.outcome === 'failed')
    .sort((a, b) => (a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : 0))
    .map((c) => ({ instance: c.instance, checkId: c.checkId, component: c.component, findings: c.violations }));

  // Why it is not «نقي», in a fixed order.
  const reasons: Reason[] = [];
  if (K === 0) reasons.push({ key: 'purity.reason.noScope' });
  for (const o of NOT_COUNTED) {
    const n = byOutcome[o] ?? 0;
    if (!n) continue;
    if (o === 'failed') {
      const blockingN = lines.filter((l) => l.outcome === 'failed' && l.blocking).length;
      if (n - blockingN > 0) reasons.push({ key: 'purity.reason.failed', params: { count: n - blockingN } });
    } else reasons.push({ key: `purity.reason.${outcomeWord(o)}`, params: { count: n } });
  }
  if (absent) reasons.push({ key: 'purity.reason.absent', params: { count: absent } });
  const integ = input.integrity;
  for (const c of [...integ.checks].sort((a, b) => (a.checkId < b.checkId ? -1 : 1))) {
    if (c.outcome !== 'passed' && c.outcome !== 'not_applicable') reasons.push({ key: 'purity.reason.integrityCheck', params: { check: c.checkId, outcome: c.outcome ?? 'absent' } });
  }
  if (integ.stateChanged) reasons.push({ key: 'purity.reason.stateChanged' });
  if (integ.guardUnreviewed) reasons.push({ key: 'purity.reason.guardUnreviewed', params: { count: integ.guardUnreviewed } });
  if (integ.modelClaimsOpen) reasons.push({ key: 'purity.reason.modelClaimsOpen', params: { count: integ.modelClaimsOpen } });
  if (integ.reviewsExpired) reasons.push({ key: 'purity.reason.reviewsExpired', params: { count: integ.reviewsExpired } });

  const integrityHolds = integ.checks.every((c) => c.outcome === 'passed' || c.outcome === 'not_applicable') && !integ.stateChanged && integ.guardUnreviewed === 0 && integ.modelClaimsOpen === 0 && integ.reviewsExpired === 0;
  let verdict: PurityResult['verdict'] = null;
  if (input.scope.kind === 'round') {
    if (blockingFailures.length) verdict = 'blocked';
    else if (K === 0 || karat !== 24 || !integrityHolds) verdict = 'incomplete';
    else verdict = 'pure';
  }
  // A section is «جزئي»: no verdict, and its reasons are its own checks' (the integrity reasons are the round's).
  const incompleteReasons = input.scope.kind === 'section' ? reasons.filter((r) => !r.key.startsWith('purity.reason.integrity') && !['purity.reason.stateChanged', 'purity.reason.guardUnreviewed', 'purity.reason.modelClaimsOpen', 'purity.reason.reviewsExpired'].includes(r.key)) : verdict === 'pure' ? [] : reasons;

  return {
    formula: PURITY_FORMULA,
    scope: input.scope,
    verdict,
    karat,
    p,
    criteriaCount: K,
    checksCount: R.length,
    narrow: K > 0 && K < threshold,
    narrowThreshold: threshold,
    criteria,
    checks: lines,
    counts: { byOutcome, absent },
    blockingFailures,
    incompleteReasons,
    excludedByReview: scoped.reduce((n, c) => n + c.excludedByReview, 0),
    integrity: integ,
    notes: [],
    meta: input.meta,
  };
}

/** What the run list and the events carry (11.5: never the number alone). */
export function puritySummary(r: PurityResult): PuritySummary {
  return {
    formula: PURITY_FORMULA,
    verdict: r.verdict,
    karat: r.karat,
    criteriaCount: r.criteriaCount,
    checksCount: r.checksCount,
    narrow: r.narrow,
    partial: r.scope.kind === 'section',
    section: r.scope.kind === 'section' ? r.scope.section : null,
    roundId: r.scope.kind === 'round' ? r.scope.roundId : null,
  };
}
