// Human review (C-16, D-35) and baseline approval (C-14). Implemented in DEV-9 and DEV-7.
// Protocol 1.4 (DEV-7): baseline.approve names its project and the captures it approves (FR-35, D-27).
import { Id } from '../common.ts';
import { BaselineView } from '../domain/probe.ts';
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
    /**
     * The explicit approval of captures as reference images (FR-35, D-27): each becomes the active reference of its
     * key, the previous one of that key is kept as replaced. Never called by AYAR on its own.
     */
    payload: z.strictObject({ projectId: Id, captureIds: z.array(Id).min(1).max(1000) }),
    result: z.strictObject({ approved: z.array(BaselineView), replaced: z.int().nonnegative() }),
  }),
};
