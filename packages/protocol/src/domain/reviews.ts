// Human reviews (C-16, FR-34, D-35, 11.4 rules 6 and 7; protocol 1.5, DEV-9). A review is recorded on a check
// instance, a finding or a model claim, with a decision, a note, a scope (the files it holds for) and the state
// snapshot it was taken on; it expires when a file of its scope changes (11.4 rule 6), and the automatic outcome
// it changed is kept beside it (G-17).
import { Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { CheckOutcome } from './terms.ts';

export const ReviewTargetType = z.enum(['check', 'finding', 'modelClaim']);
export type ReviewTargetType = z.infer<typeof ReviewTargetType>;

/**
 * FR-34 «قبول، أو رفض، أو إنذار كاذب», and 12.7's two decisions on a model claim. On a check: `accept` makes it
 * «اجتاز (بمراجعة)», `reject` makes it «أخفق (بمراجعة)»; on a finding: `accept` records agreement, `reject`
 * disputes it, `false_positive` excludes it while its fingerprint is unchanged (D-35); on a claim: `card` turns
 * it into a task card, `not_issue` closes it without one.
 */
export const REVIEW_DECISIONS = ['accept', 'reject', 'false_positive', 'card', 'not_issue'] as const;
export const ReviewDecision = z.enum(REVIEW_DECISIONS);
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const ReviewTarget = z.strictObject({ type: ReviewTargetType, id: Id });
export type ReviewTarget = z.infer<typeof ReviewTarget>;

export const ReviewRecord = z.strictObject({
  id: Id,
  projectId: Id,
  target: ReviewTarget,
  /** The instance, the finding's fingerprint or the claim's display id the review is remembered by. */
  targetRef: z.string(),
  decision: ReviewDecision,
  note: z.string(),
  /** The files the review holds for (11.4 rule 6); a change in one of them expires it. */
  scope: z.strictObject({ files: z.array(z.string()), fingerprint: z.string().nullable() }),
  snapshotId: Id.nullable(),
  createdAt: IsoTimestamp,
  /** Still holding, as of the latest state AYAR knows (the last run's snapshot). */
  valid: z.boolean(),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/** review.record's result: the review, and what it changed. */
export const ReviewRecorded = z.strictObject({
  review: ReviewRecord,
  /** On a check: the execution whose outcome the review changed, with the automatic outcome kept (G-17). */
  check: z.strictObject({ checkRunId: Id, instance: z.string(), outcome: CheckOutcome.nullable(), autoOutcome: CheckOutcome.nullable(), roundRecomputed: z.boolean() }).nullable(),
  /** On a finding: excluded now (false alarm), or recorded. */
  finding: z.strictObject({ findingId: Id, displayId: z.string(), excluded: z.boolean() }).nullable(),
  /** On a claim: its new status, and the card made from it. */
  claim: z.strictObject({ claimId: Id, displayId: z.string(), status: z.enum(['decided_card', 'decided_not_issue']), taskDisplayId: z.string().nullable() }).nullable(),
});
export type ReviewRecorded = z.infer<typeof ReviewRecorded>;
