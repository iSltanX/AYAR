// Model checks (C-25, D-41). Implemented in DEV-9.
import { Id, Lang } from '../common.ts';
import { DestinationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-25', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-9' } as const;

export const aiCheckCommands = {
  'aiChecks.needs': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'aiChecks.provideInput': defineCommand({ ...base, payload: z.strictObject({ needId: Id, value: z.string().max(10_000) }), result: z.unknown() }),
  'aiChecks.generate': defineCommand({ ...base, payload: z.strictObject({ needId: Id, lang: Lang }), result: z.unknown() }),
  'aiChecks.save': defineCommand({
    ...base,
    payload: z.strictObject({ aiCheckId: Id, destinationToken: DestinationToken }),
    result: z.unknown(),
    grants: [{ field: 'destinationToken', kind: 'destination' }],
  }),
  'aiChecks.importResults': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
};
