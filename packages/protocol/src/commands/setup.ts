// Readiness and setup (G-19: owners assigned here). readiness.evaluate belongs to the planner (C-10), which
// labels readiness from C-07 and C-11; setup actions belong to C-11. Implemented in DEV-5.
import { Id } from '../common.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { ConfirmablePreview, ConfirmablePreviewWithToken } from './previews.ts';

const base = { handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

export const setupCommands = {
  'readiness.evaluate': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'setup.preview': defineCommand({
    ...base,
    owner: 'C-11',
    payload: z.strictObject({ actionId: Id }),
    result: ConfirmablePreview,
    rendererResult: ConfirmablePreviewWithToken,
    confirms: 'setup.execute',
  }),
  // C-04: "setup.execute يرفض دون رمز تأكيد صالح".
  'setup.execute': defineCommand({
    ...base,
    owner: 'C-11',
    payload: z.strictObject({ actionId: Id, confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'actionId' }],
  }),
};
