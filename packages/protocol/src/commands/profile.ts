// C-09: the standards profile. Implemented in DEV-4.
import { Id, JsonObject } from '../common.ts';
import { DestinationToken, SourceToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-09', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-4' } as const;

export const profileCommands = {
  'profile.propose': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'profile.get': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.unknown() }),
  'profile.update': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, patch: JsonObject }),
    result: z.unknown(),
  }),
  'profile.approve': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, changeSetId: Id }),
    result: z.unknown(),
  }),
  'profile.export': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, destinationToken: DestinationToken }),
    result: z.unknown(),
    grants: [{ field: 'destinationToken', kind: 'destination' }],
  }),
  'profile.import': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, sourceToken: SourceToken }),
    result: z.unknown(),
    grants: [{ field: 'sourceToken', kind: 'source' }],
  }),
};
