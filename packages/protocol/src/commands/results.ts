// Reading results, findings and evidence (C-17 data access; C-16 produces them). Implemented in DEV-5/DEV-6.
import { Id, JsonObject } from '../common.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-17', handler: 'engine', audience: 'renderer', since: '1.0' } as const;

export const resultCommands = {
  'results.query': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ projectId: Id, filters: JsonObject }), result: z.unknown() }),
  'finding.get': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ findingId: Id }), result: z.unknown() }),
  // A short-lived token for ayar-evidence:// (C-01); an invalid token answers "not found" without a path.
  'evidence.token': defineCommand({ ...base, implementedIn: 'DEV-5', payload: z.strictObject({ evidenceId: Id }), result: z.unknown() }),
};
