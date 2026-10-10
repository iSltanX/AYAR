// C-05: the project registry. Implemented in DEV-4.
import { Id } from '../common.ts';
import { ConfirmationToken, SelectionToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-05', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-4' } as const;

export const projectCommands = {
  'project.add': defineCommand({
    ...base,
    payload: z.strictObject({ selectionToken: SelectionToken }),
    result: z.unknown(),
    grants: [{ field: 'selectionToken', kind: 'selection' }],
  }),
  'project.list': defineCommand({ ...base, payload: z.strictObject({}), result: z.unknown() }),
  'project.get': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'project.rescan': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'project.relocate': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, selectionToken: SelectionToken }),
    result: z.unknown(),
    grants: [{ field: 'selectionToken', kind: 'selection' }],
  }),
  // 14.3 removes a project "بتأكيد"; 6.5 lists no token. The stricter text wins [D-DEV3-04].
  'project.remove': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'projectId' }],
  }),
  'project.setTrust': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, trusted: z.boolean() }),
    result: z.unknown(),
  }),
};
