// The purity index contract (C-19, plan 11, D-10; protocol 1.3, DEV-6): `purity/1` for a round and for a section.
// The number is never shown alone (11.5): the result carries the verdict, the karat, the scope (K criteria, |R|
// checks), the counts of outcomes, the breakdown per criterion and per check, the blocking failures that come
// first, why it is incomplete, what a review excluded, the integrity inputs (DEV-9 feeds them), and what 11.9
// says is kept with every value. A section's karat is «جزئي» and has no verdict word (11.5).
import { CheckInstanceKey, Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { Reason } from './profile.ts';
import { CheckOutcome } from './terms.ts';

export const PURITY_FORMULA = 'purity/1' as const;

/** 11.3: «محجوب», «غير مكتمل», «نقي». */
export const PURITY_VERDICTS = ['blocked', 'incomplete', 'pure'] as const;
export const PurityVerdict = z.enum(PURITY_VERDICTS);
export type PurityVerdict = z.infer<typeof PurityVerdict>;

/** One required, applicable check of R, as it counted (11.4). */
export const PurityCheckLine = z.strictObject({
  instance: CheckInstanceKey,
  checkId: z.string(),
  component: z.string(),
  criterion: z.string(),
  blocking: z.boolean(),
  /** Null: required and applicable, but not in this round's results («الغائب», 11.4 rule 1). */
  outcome: CheckOutcome.nullable(),
  /** «اجتاز (بمراجعة)» counts as passed (11.2). */
  reviewed: z.boolean(),
  credit: z.union([z.literal(0), z.literal(1)]),
  checkRunId: Id.nullable(),
});
export type PurityCheckLine = z.infer<typeof PurityCheckLine>;

/** One criterion k of 11.6 with a required check: n_k, how many passed, and its share passed/n_k. */
export const PurityCriterionLine = z.strictObject({
  id: z.string(),
  section: z.string(),
  n: z.int().positive(),
  passed: z.int().nonnegative(),
  /** passed / n, for display; the karat is computed exactly, not from this float. */
  share: z.number().min(0).max(1),
});
export type PurityCriterionLine = z.infer<typeof PurityCriterionLine>;

/** What DEV-9 feeds (C-22 and the integrity checks); DEV-6 tests their effect with synthetic data (task 7). */
export const IntegrityInputs = z.strictObject({
  /** integ.state: the source changed during the scan (outside the declared outputs, 9.9). */
  stateChanged: z.boolean(),
  /** integ.guard findings with no review (11.4 rule 9): they block «نقي» even when their check is outside R. */
  guardUnreviewed: z.int().nonnegative(),
  /** integ.model-claims: claims neither proven locally nor reviewed. */
  modelClaimsOpen: z.int().nonnegative(),
  /** integ.reviews: mandatory reviews whose scope changed (11.4 rule 6). */
  reviewsExpired: z.int().nonnegative(),
  /** The outcome of each integ.* check of the round; «اجتاز» or «غير منطبق» for each, or no «نقي» (11.3). */
  checks: z.array(z.strictObject({ checkId: z.string(), outcome: CheckOutcome.nullable() })),
});
export type IntegrityInputs = z.infer<typeof IntegrityInputs>;

export const PurityScope = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('round'), roundId: Id.nullable() }),
  z.strictObject({ kind: z.literal('section'), section: z.string().regex(/^[a-z]+$/) }),
]);
export type PurityScope = z.infer<typeof PurityScope>;

/** 11.9: what is kept with every value. */
export const PurityMeta = z.strictObject({
  profileVersion: z.int().positive().nullable(),
  profileHash: z.string().nullable(),
  catalogVersion: z.string(),
  toolVersions: z.record(z.string(), z.string()),
  environmentSource: z.string().nullable(),
  snapshotId: Id.nullable(),
  commit: z.string().nullable(),
  computedAt: IsoTimestamp,
});
export type PurityMeta = z.infer<typeof PurityMeta>;

export const PurityResult = z.strictObject({
  formula: z.literal(PURITY_FORMULA),
  scope: PurityScope,
  /** Null for a section (no verdict word, 11.5). */
  verdict: PurityVerdict.nullable(),
  /** floor(24 × P), 0 to 24; null when K = 0 («لا يوجد نطاق قابل للقياس», 11.4 rule 3). */
  karat: z.int().min(0).max(24).nullable(),
  /** P for display, or null when K = 0. The karat is computed with exact integers, never from this float. */
  p: z.number().min(0).max(1).nullable(),
  /** K: criteria with a required check. */
  criteriaCount: z.int().nonnegative(),
  /** |R|: required, applicable checks. */
  checksCount: z.int().nonnegative(),
  /** K below the threshold (3 by default, a setting): «نطاق ضيق: معيار واحد» or «…: معياران» (11.4 rule 4). */
  narrow: z.boolean(),
  narrowThreshold: z.int().positive(),
  criteria: z.array(PurityCriterionLine),
  checks: z.array(PurityCheckLine),
  /** Outcomes of R («تحذير 1، يحتاج مراجعة 2»); `absent` for a required check with no result. */
  counts: z.strictObject({ byOutcome: z.partialRecord(CheckOutcome, z.int().nonnegative()), absent: z.int().nonnegative() }),
  /** 11.5: shown first, before any number, when the verdict is «محجوب». */
  blockingFailures: z.array(z.strictObject({ instance: CheckInstanceKey, checkId: z.string(), component: z.string(), findings: z.int().nonnegative() })),
  /** Why it is not «نقي» (11.3): what is missing, failing, flaky, pending review, the integrity reasons. */
  incompleteReasons: z.array(Reason),
  /** 11.4 rule 7: findings a review excluded, always shown with the index. */
  excludedByReview: z.int().nonnegative(),
  integrity: IntegrityInputs,
  /** 11.5 «المقارنة بين جولتين»: comparability notes, filled when comparing. */
  notes: z.array(Reason),
  meta: PurityMeta,
});
export type PurityResult = z.infer<typeof PurityResult>;

/** What the run list and the run events carry (11.5: never the number alone). */
export const PuritySummary = z.strictObject({
  formula: z.literal(PURITY_FORMULA),
  verdict: PurityVerdict.nullable(),
  karat: z.int().min(0).max(24).nullable(),
  criteriaCount: z.int().nonnegative(),
  checksCount: z.int().nonnegative(),
  narrow: z.boolean(),
  /** A section's karat: «جزئي» (9.10). */
  partial: z.boolean(),
  section: z.string().nullable(),
  roundId: Id.nullable(),
  /** Protocol 1.6 (DEV-11): `ROUND-NNN`, as the purity card and the reports name the round. */
  roundDisplayId: z.string().nullable().optional(),
});
export type PuritySummary = z.infer<typeof PuritySummary>;
