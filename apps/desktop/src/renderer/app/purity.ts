// The purity index as the screens show it (plan 11, C-19): the purity card's inputs from `purity/1`, a section's
// partial karat from the round's criterion lines (the same formula, exact integers, 11.4), and the scoring details
// of 13.3. The number never travels without its verdict and scope (11.5).
import type { CheckOutcome, PurityResult } from '@ayar/protocol';
import type { Lang, Translate } from '@ayar/i18n';
import type { ResultCount as StatusCount } from '../lib/shell.ts';
import type { ScoredCriterion, ScoringSummary } from '../lib/sheets.ts';
import { checkTitle, countsInOrder, resultOf, textOr } from './format.ts';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** floor(24 × P), P the mean of passed/n over the criteria, with exact integers (never from a float). */
export function karatOf(lines: readonly { n: number; passed: number }[]): number | null {
  if (!lines.length) return null;
  const l = lines.reduce((m, x) => lcm(m, x.n), 1);
  const num = lines.reduce((s, x) => s + x.passed * (l / x.n), 0);
  return Math.floor((24 * num) / (lines.length * l));
}

/** A section's partial karat (9.10) and its scope, from the round's criteria in that section. */
export function sectionKarat(purity: PurityResult | null, section: string): { karat: number | null; criteria: number } {
  const lines = purity?.criteria.filter((c) => c.section === section) ?? [];
  return { karat: karatOf(lines), criteria: lines.length };
}

/** What blocks «نقي» from the integrity side (11.3): unreviewed guard findings, open claims, expired reviews, a changed state. */
export function integrityHold(p: PurityResult): number {
  return p.integrity.guardUnreviewed + p.integrity.modelClaimsOpen + p.integrity.reviewsExpired + (p.integrity.stateChanged ? 1 : 0);
}

/** The outcomes that keep an incomplete round from «نقي» (11.3), by status, for the card's «ينقص لـ ‹نقي›». */
export function missingForPure(p: PurityResult): StatusCount[] {
  const keep: CheckOutcome[] = ['warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped'];
  const by: Partial<Record<CheckOutcome, number>> = {};
  for (const o of keep) if (p.counts.byOutcome[o]) by[o] = p.counts.byOutcome[o];
  if (p.counts.absent) by.missing = (by.missing ?? 0) + p.counts.absent;
  return countsInOrder(by);
}

/** The scoring details sheet (13.3 «تفاصيل الاحتساب»). */
export function scoringOf(t: Translate, lang: Lang, p: PurityResult, appVersion: string): { criteria: ScoredCriterion[]; summary: ScoringSummary } {
  const criteria: ScoredCriterion[] = p.criteria.map((c) => ({
    name: textOr(t, lang, `catalog.criterion.${c.id}`, c.id),
    checks: p.checks.filter((x) => x.criterion === c.id).map((x) => ({ id: x.checkId, result: x.outcome ? resultOf(x.outcome) : 'missing' })),
    passed: c.passed,
    total: c.n,
  }));
  const average = p.p ?? 0;
  return {
    criteria,
    summary: {
      criteria: p.criteriaCount,
      requiredChecks: p.checksCount,
      average: Math.round(average * 100) / 100,
      karatRaw: Math.round(24 * average * 100) / 100,
      karat: p.karat ?? 0,
      blockingFailures: p.blockingFailures.length,
      pendingReviews: p.counts.byOutcome.needs_review ?? 0,
      excludedByReview: p.excludedByReview,
      openIntegrityItems: integrityHold(p),
      notApplicable: p.counts.byOutcome.not_applicable ?? 0,
      appVersion,
      catalogVersion: p.meta.catalogVersion,
    },
  };
}

/** The blocking failures, named, before any number (11.5). */
export function blockingOf(t: Translate, lang: Lang, p: PurityResult): { id: string; name: string }[] {
  return p.blockingFailures.map((b) => ({ id: b.checkId, name: checkTitle(t, lang, b.checkId) }));
}
