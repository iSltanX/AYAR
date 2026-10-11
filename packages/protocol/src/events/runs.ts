// Run and check events (C-12). The state vocabularies of 7.5 are fixed with RunPlan in protocol 1.2 (DEV-5,
// G-DEV3-04); run.state carries the run view, check.state the check execution view, so the UI never guesses.
import { Id, IsoTimestamp } from '../common.ts';
import { PuritySummary } from '../domain/purity.ts';
import { CheckRunView, RunCounts, RunView } from '../domain/runs.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

const base = { owner: 'C-12', since: '1.0', implementedIn: 'DEV-5' } as const;

export const runEvents = {
  'run.state': defineEvent({ ...base, payload: RunView }),
  'check.state': defineEvent({ ...base, payload: CheckRunView }),
  // 6.5: the step, the total when known, the last activity and the processor.
  'check.progress': defineEvent({
    ...base,
    payload: z.strictObject({
      runId: Id,
      checkRunId: Id,
      step: z.int().nonnegative(),
      total: z.int().nonnegative().nullable(),
      lastActivityAt: IsoTimestamp,
      /** CPU of the process group as a percentage («المعالج نشط 85%»), or null before the first sample. */
      processor: z.string().nullable(),
      /** Milliseconds since the last output line (9.6 point 6: «لا خرج منذ 2:10»). */
      silentMs: z.int().nonnegative(),
      /** 9.6 point 5: what could be counted from the output so far (lines of output in DEV-5; adapters refine it). */
      linesSeen: z.int().nonnegative(),
      /** Protocol 1.6 (DEV-11): the process group's resident memory in KB at this sample (13.3 «مؤشر موارد»). */
      memoryKb: z.int().nonnegative().optional(),
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
  // Protocol 1.3 (DEV-6): when a run finished, its index (never the number alone) and its counts.
  'run.summary': defineEvent({ owner: 'C-16', since: '1.0', implementedIn: 'DEV-6', payload: z.strictObject({ runId: Id, purity: PuritySummary.nullable(), counts: RunCounts, findings: z.int().nonnegative() }) }),
};
