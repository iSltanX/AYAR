// Erasing all AYAR data (14.3: from the settings, with a double confirmation in the UI and one token here).
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const dataCommands = {
  'data.purge': defineCommand({
    owner: 'C-17',
    handler: 'engine',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-12',
    payload: z.strictObject({ confirmationToken: ConfirmationToken }),
    result: z.unknown(),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: null }],
  }),
};
