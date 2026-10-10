// Reports, copying, tasks and the advisor (C-21, C-01, C-20, C-23). Implemented in DEV-8 and DEV-9.
import { Id, JsonObject, Lang } from '../common.ts';
import { DestinationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const ReportTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('run'), runId: Id }),
  z.strictObject({ kind: z.literal('findings'), findingIds: z.array(Id).min(1).max(5000) }),
  z.strictObject({ kind: z.literal('card'), taskId: Id }),
]);

export const CopyKind = z.enum(['report', 'card', 'instructions']);

const renderer = { handler: 'engine', audience: 'renderer', since: '1.0' } as const;

export const reportCommands = {
  'report.build': defineCommand({
    ...renderer,
    owner: 'C-21',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ target: ReportTarget, options: JsonObject }),
    result: z.unknown(),
  }),
  // The main process fetches the model-format text from the engine, writes the clipboard, then the engine
  // records the copy in audit_log as `report.copied` (G-21: an audit record, not an event).
  'clipboard.copy': defineCommand({
    owner: 'C-01',
    handler: 'main',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ kind: CopyKind, id: Id }),
    result: z.unknown(),
  }),
  'tasks.list': defineCommand({ ...renderer, owner: 'C-20', implementedIn: 'DEV-8', payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'task.create': defineCommand({ ...renderer, owner: 'C-20', implementedIn: 'DEV-8', payload: z.strictObject({ source: JsonObject }), result: z.unknown() }),
  'task.update': defineCommand({ ...renderer, owner: 'C-20', implementedIn: 'DEV-8', payload: z.strictObject({ taskId: Id, patch: JsonObject }), result: z.unknown() }),
  'advisor.suggest': defineCommand({ ...renderer, owner: 'C-20', implementedIn: 'DEV-8', payload: z.strictObject({ projectId: Id, context: JsonObject }), result: z.unknown() }),
  'report.export': defineCommand({
    ...renderer,
    owner: 'C-23',
    implementedIn: 'DEV-9',
    // includeScreenshots: the explicit "ضمّن اللقطات" choice of D-46 for the evidence bundle.
    payload: z.strictObject({
      target: ReportTarget,
      format: z.enum(['markdown', 'html', 'json', 'evidence-bundle']),
      lang: Lang,
      destinationToken: DestinationToken,
      includeScreenshots: z.boolean().optional(),
    }),
    result: z.unknown(),
    grants: [{ field: 'destinationToken', kind: 'destination' }],
  }),
};
