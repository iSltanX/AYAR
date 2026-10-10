// Commands the main process executes itself (C-01), added to 6.5 [D-DEV3-03]: the UI needs a way to ask for
// the system dialogs that mint path tokens, for a confirmation token after it showed a destructive action,
// and for the supervisor's state. None of them returns a path.
import { DestinationToken, SelectionToken, SourceToken, ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { EngineHealth } from '../events/engine.ts';

const base = { owner: 'C-01', handler: 'main', audience: 'renderer', since: '1.0', implementedIn: 'DEV-3' } as const;

const Cancelled = z.strictObject({ cancelled: z.literal(true) });

/** Destructive commands without a preview: their token comes from confirm.issue after the UI confirmed. */
export const DIRECT_CONFIRM_COMMANDS = ['project.remove', 'runs.delete', 'tools.remove', 'data.purge'] as const;

const FileName = z
  .string()
  .min(1)
  .max(255)
  .refine((n) => !n.includes('/') && !n.includes('\0') && n !== '.' && n !== '..', 'not a file name');

export const systemCommands = {
  'dialog.pickFolder': defineCommand({
    ...base,
    payload: z.strictObject({ purpose: z.enum(['project.add', 'project.relocate']) }),
    result: z.union([z.strictObject({ selectionToken: SelectionToken }), Cancelled]),
  }),
  'dialog.pickDestination': defineCommand({
    ...base,
    payload: z.strictObject({ purpose: z.enum(['profile.export', 'aiChecks.save', 'report.export']), suggestedName: FileName }),
    result: z.union([z.strictObject({ destinationToken: DestinationToken }), Cancelled]),
  }),
  'dialog.pickSource': defineCommand({
    ...base,
    payload: z.strictObject({ purpose: z.enum(['profile.import']) }),
    result: z.union([z.strictObject({ sourceToken: SourceToken }), Cancelled]),
  }),
  /**
   * D-DEV3-15 (implemented in DEV-5): the main process first asks in a native macOS alert it shows itself; only
   * the user's click on its confirm button mints the token. Cancelling mints nothing.
   */
  'confirm.issue': defineCommand({
    ...base,
    implementedIn: 'DEV-5',
    payload: z.strictObject({ command: z.enum(DIRECT_CONFIRM_COMMANDS), target: z.string().min(1).max(256) }),
    result: z.union([z.strictObject({ confirmationToken: ConfirmationToken }), Cancelled]),
  }),
  'engine.status': defineCommand({ ...base, payload: z.strictObject({}), result: EngineHealth }),
  'engine.restart': defineCommand({ ...base, payload: z.strictObject({}), result: z.strictObject({ accepted: z.boolean() }) }),
};
