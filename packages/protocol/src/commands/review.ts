// Human review (C-16, D-35) and baseline approval (C-14). Implemented in DEV-9 and DEV-7.
// Protocol 1.4 (DEV-7): baseline.approve names its project and the captures it approves (FR-35, D-27).
// Protocol 1.5 (DEV-9): review.record's decisions and result, and reviews.list.
import { Id } from '../common.ts';
import { BaselineView } from '../domain/probe.ts';
import { ReviewDecision, ReviewRecord, ReviewRecorded, ReviewTarget } from '../domain/reviews.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const reviewCommands = {
  /**
   * FR-34: a human decision on a check («اجتاز بمراجعة» / «أخفق بمراجعة», G-17), a finding (agreement, dispute, or a
   * false alarm that excludes it, D-35), or a model claim («حوّل إلى بطاقة» / «ليس مشكلة», 12.7), with a note.
   * The scope is the files the decision holds for; a change in them expires it (11.4 rule 6).
   */
  'review.record': defineCommand({
    owner: 'C-16',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ target: ReviewTarget, decision: ReviewDecision, note: z.string().max(4000) }),
    result: ReviewRecorded,
  }),
  'reviews.list': defineCommand({ owner: 'C-16', handler: 'engine', audience: 'renderer', since: '1.5', implementedIn: 'DEV-9', payload: z.strictObject({ projectId: Id }), result: z.strictObject({ reviews: z.array(ReviewRecord) }) }),
  'baseline.approve': defineCommand({
    owner: 'C-14',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-7',
    /**
     * The explicit approval of captures as reference images (FR-35, D-27): each becomes the active reference of its
     * key, the previous one of that key is kept as replaced. Never called by AYAR on its own.
     */
    payload: z.strictObject({ projectId: Id, captureIds: z.array(Id).min(1).max(1000) }),
    result: z.strictObject({ approved: z.array(BaselineView), replaced: z.int().nonnegative() }),
  }),
};
