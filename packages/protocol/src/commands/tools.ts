// Comparison (C-22) and managed tools (C-11). Implemented in DEV-9 and DEV-5.
import { Id } from '../common.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { ConfirmablePreview, ConfirmablePreviewWithToken } from './previews.ts';

const tools = { owner: 'C-11', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

export const toolCommands = {
  'compare.runs': defineCommand({
    owner: 'C-22',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ a: Id, b: Id }),
    result: z.unknown(),
  }),
  'tools.list': defineCommand({ ...tools, payload: z.strictObject({}), result: z.unknown() }),
  'tools.preview': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: Id }),
    result: ConfirmablePreview,
    rendererResult: ConfirmablePreviewWithToken,
    confirms: 'tools.install',
  }),
  'tools.install': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: Id, confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'toolId' }],
  }),
  'tools.verify': defineCommand({ ...tools, payload: z.strictObject({ toolId: Id.optional() }), result: z.unknown() }),
  'tools.remove': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: Id, confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'toolId' }],
  }),
};
