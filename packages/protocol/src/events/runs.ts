// Run and check events (C-12). The state vocabularies of 7.5 are fixed with RunPlan in DEV-5 (minor version).
import { Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

const base = { owner: 'C-12', since: '1.0', implementedIn: 'DEV-5' } as const;

export const runEvents = {
  'run.state': defineEvent({ ...base, payload: z.looseObject({ runId: Id, state: z.string().min(1) }) }),
  'check.state': defineEvent({ ...base, payload: z.looseObject({ runId: Id, checkRunId: Id, state: z.string().min(1) }) }),
  // 6.5: the step, the total when known, the last activity and the processor.
  'check.progress': defineEvent({
    ...base,
    payload: z.looseObject({
      runId: Id,
      checkRunId: Id,
      step: z.int().nonnegative(),
      total: z.int().nonnegative().nullable(),
      lastActivityAt: IsoTimestamp,
      processor: z.string().nullable(),
    }),
  }),
  // References to log segments, rate-limited by the engine's event bus (C-04 aggregation).
  'check.log': defineEvent({
    ...base,
    payload: z.looseObject({
      runId: Id,
      checkRunId: Id,
      segments: z.array(z.strictObject({ stream: z.enum(['stdout', 'stderr']), offset: z.int().nonnegative(), length: z.int().nonnegative() })),
    }),
  }),
  'run.summary': defineEvent({ owner: 'C-16', since: '1.0', implementedIn: 'DEV-6', payload: z.looseObject({ runId: Id }) }),
};
