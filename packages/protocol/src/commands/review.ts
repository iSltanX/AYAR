// Human review (C-16, D-35) and baseline approval (C-14). Implemented in DEV-9 and DEV-7.
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const ReviewTarget = z.strictObject({ type: z.enum(['check', 'finding', 'modelClaim']), id: Id });

export const reviewCommands = {
  'review.record': defineCommand({
    owner: 'C-16',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ target: ReviewTarget, decision: z.string().min(1).max(64), note: z.string().max(4000) }),
    result: z.unknown(),
  }),
  'baseline.approve': defineCommand({
    owner: 'C-14',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-7',
    payload: z.strictObject({ captureIds: z.array(Id).min(1).max(1000) }),
    result: z.unknown(),
  }),
};
