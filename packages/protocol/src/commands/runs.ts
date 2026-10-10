// Planning and running (C-10, C-12), and the persisted run list and groups (G-19 owners). Implemented in DEV-5.
import { CheckInstanceKey, Id, JsonObject } from '../common.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

const CancelTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('run'), runId: Id }),
  z.strictObject({ kind: z.literal('checkRun'), checkRunId: Id }),
]);

export const runCommands = {
  'run.plan': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id, selection: JsonObject }), result: z.unknown() }),
  // D-33: one active run in the whole app; the engine host's run gate queues the rest visibly.
  'run.start': defineCommand({ ...base, owner: 'C-12', payload: z.strictObject({ planId: Id }), result: z.unknown() }),
  'run.cancel': defineCommand({ ...base, owner: 'C-12', payload: z.strictObject({ target: CancelTarget }), result: z.unknown() }),
  'run.rerun': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ runId: Id, filter: JsonObject }), result: z.unknown() }),
  'run.continueRound': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ roundId: Id }), result: z.unknown() }),
  'runs.keep': defineCommand({ ...base, owner: 'C-17', payload: z.strictObject({ runId: Id, keep: z.boolean() }), result: z.unknown() }),
  'runs.delete': defineCommand({
    ...base,
    owner: 'C-17',
    payload: z.strictObject({ runId: Id, confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'runId' }],
  }),
  // Groups are saved selections for the planner (D-45: keys are checkId@component).
  'groups.save': defineCommand({
    ...base,
    owner: 'C-10',
    payload: z.strictObject({ projectId: Id, name: z.string().trim().min(1).max(120), instanceKeys: z.array(CheckInstanceKey).min(1).max(2000) }),
    result: z.unknown(),
  }),
  'groups.list': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'groups.delete': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ groupId: Id }), result: z.unknown() }),
};
