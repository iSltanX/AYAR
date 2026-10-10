// Host-only commands: the main process (or tools/cli) sends them to the engine; the renderer cannot.
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { CopyKind } from './reports.ts';

const base = { handler: 'engine', audience: 'host', since: '1.0', implementedIn: 'DEV-9' } as const;

export const internalCommands = {
  /** The model-format text to copy (FR-44: the copy button always copies the model format). */
  'internal.clipboardText': defineCommand({
    ...base,
    owner: 'C-21',
    payload: z.strictObject({ kind: CopyKind, id: Id }),
    result: z.strictObject({ text: z.string() }),
  }),
  /** Records `report.copied` in audit_log after the clipboard write succeeded (G-21). */
  'internal.recordCopy': defineCommand({
    ...base,
    owner: 'C-17',
    payload: z.strictObject({ kind: CopyKind, id: Id, chars: z.int().nonnegative() }),
    result: z.strictObject({}),
  }),
};
