// Planning and running (C-10, C-12), and the persisted run list and groups (G-19 owners). Implemented in DEV-5;
// protocol 1.2 gives them their contracts (RunPlan, RunView, SavedGroup) and narrows run.plan's selection and
// run.rerun's filter to their schemas [D-DEV5-01].
import { CheckInstanceKey, Id } from '../common.ts';
import { RerunFilter, RunDetail, RunList, RunPlan, RunSelection, RunView, SavedGroup } from '../domain/runs.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

const CancelTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('run'), runId: Id }),
  z.strictObject({ kind: z.literal('checkRun'), checkRunId: Id }),
]);

export const runCommands = {
  /** C-10: builds and saves a plan (G-24: the plan has an id and a row); it is shown before «ابدأ». */
  'run.plan': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id, selection: RunSelection }), result: RunPlan }),
  // D-33: one active run in the whole app; the engine host's run gate queues the rest visibly.
  'run.start': defineCommand({ ...base, owner: 'C-12', payload: z.strictObject({ planId: Id }), result: RunView }),
  'run.cancel': defineCommand({ ...base, owner: 'C-12', payload: z.strictObject({ target: CancelTarget }), result: z.strictObject({ accepted: z.boolean(), state: z.string().nullable() }) }),
  /** 9.5 point 3: a new plan over a previous run's outcomes; the new executions link to the old ones. */
  'run.rerun': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ runId: Id, filter: RerunFilter }), result: RunPlan }),
  /** 9.12-4: a plan that completes a round: what its base run left incomplete. */
  'run.continueRound': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ roundId: Id }), result: RunPlan }),
  /**
   * FR-37 (protocol 1.2, D-DEV5-01): the persisted run list with the space it uses. 6.5 has runs.keep and
   * runs.delete but nothing that lists the runs they act on; results.query (DEV-6) reads results, not runs.
   */
  'runs.list': defineCommand({ ...base, owner: 'C-17', since: '1.2', payload: z.strictObject({ projectId: Id }), result: RunList }),
  /** One run: its frozen plan, every execution with its raw result and evidence (protocol 1.2, D-DEV5-01). */
  'run.get': defineCommand({ ...base, owner: 'C-17', since: '1.2', payload: z.strictObject({ runId: Id }), result: RunDetail }),
  'runs.keep': defineCommand({ ...base, owner: 'C-17', payload: z.strictObject({ runId: Id, keep: z.boolean() }), result: RunView }),
  'runs.delete': defineCommand({
    ...base,
    owner: 'C-17',
    payload: z.strictObject({ runId: Id, confirmationToken: ConfirmationToken }),
    result: z.strictObject({ deleted: z.literal(true), freedBytes: z.int().nonnegative(), spaceUsedBytes: z.int().nonnegative() }),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'runId' }],
  }),
  // Groups are saved selections for the planner (D-45: keys are checkId@component).
  'groups.save': defineCommand({
    ...base,
    owner: 'C-10',
    payload: z.strictObject({ projectId: Id, name: z.string().trim().min(1).max(120), instanceKeys: z.array(CheckInstanceKey).min(1).max(2000) }),
    result: SavedGroup,
  }),
  'groups.list': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id }), result: z.strictObject({ groups: z.array(SavedGroup) }) }),
  'groups.delete': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ groupId: Id }), result: z.strictObject({ deleted: z.boolean() }) }),
};
