// Commands the main process executes itself (C-01), added to 6.5 [D-DEV3-03]: the UI needs a way to ask for
// the system dialogs that mint path tokens, for a confirmation token after it showed a destructive action,
// and for the supervisor's state. None of them returns a path.
import { Id } from '../common.ts';
import { DestinationToken, SelectionToken, SourceToken, ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { EngineHealth } from '../events/engine.ts';

const base = { owner: 'C-01', handler: 'main', audience: 'renderer', since: '1.0', implementedIn: 'DEV-3' } as const;
/** Protocol 1.6 (DEV-11, D-DEV11-02): what the screens need from the main process and macOS itself. */
const shell = { ...base, since: '1.6', implementedIn: 'DEV-11' } as const;

/**
 * One entry of a native menu the renderer asks for (D-DES3-07: context menus are macOS menus). The renderer sends
 * the translated text; the main process only shows it and answers with the chosen id. No path, no command.
 */
export const NativeMenuEntry = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('item'),
    id: z.string().regex(/^[a-zA-Z][\w.:-]{0,127}$/),
    label: z.string().min(1).max(200),
    accelerator: z.string().max(40).optional(),
    enabled: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('separator') }),
  z.strictObject({ kind: z.literal('header'), label: z.string().min(1).max(200) }),
]);
export type NativeMenuEntry = z.infer<typeof NativeMenuEntry>;

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
  /**
   * D-54 (E-23): where macOS draws the window buttons, from the first language of the system's global preferences
   * (never from the app's own language), so the title bar reserves that corner.
   */
  'window.layout': defineCommand({ ...shell, payload: z.strictObject({}), result: z.strictObject({ controls: z.enum(['left', 'right']) }) }),
  /** 13.3 «أظهر في Finder»: the main process reads the project's folder from the engine; the UI sends its id only. */
  'project.reveal': defineCommand({ ...shell, payload: z.strictObject({ projectId: Id }), result: z.strictObject({ revealed: z.literal(true) }) }),
  /**
   * 13.3 «افتح في المحرر» (E-17): the file of a finding, resolved inside its project's real root by the main process,
   * opened with the default of E-17 (`open -t`). The editor template setting is DEV-12's.
   */
  'editor.open': defineCommand({ ...shell, payload: z.strictObject({ findingId: Id }), result: z.strictObject({ opened: z.literal(true) }) }),
  /** D-DES3-07: a native context menu at the pointer; the chosen item's id, or null when it was dismissed. */
  'menu.popup': defineCommand({
    ...shell,
    payload: z.strictObject({ entries: z.array(NativeMenuEntry).min(1).max(40), x: z.int().min(0).max(100_000).optional(), y: z.int().min(0).max(100_000).optional() }),
    result: z.strictObject({ id: z.string().nullable() }),
  }),
  'engine.restart': defineCommand({ ...base, payload: z.strictObject({}), result: z.strictObject({ accepted: z.boolean() }) }),
};
