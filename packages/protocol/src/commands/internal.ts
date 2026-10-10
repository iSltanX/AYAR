// Host-only commands: the main process (or tools/cli) sends them to the engine; the renderer cannot.
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { CopyKind } from './reports.ts';
import { EvidenceToken } from './results.ts';

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
  /**
   * Resolves an evidence token (evidence.token) into the file the ayar-evidence:// handler serves (C-01, C-17,
   * protocol 1.2 [D-DEV5-01]). Single use and short-lived; an unknown token is not_found, and no path ever reaches the UI.
   */
  'internal.evidencePath': defineCommand({
    ...base,
    owner: 'C-17',
    since: '1.2',
    implementedIn: 'DEV-5',
    payload: z.strictObject({ token: EvidenceToken }),
    result: z.strictObject({ path: z.string(), kind: z.string(), size: z.int().nonnegative(), sha256: z.string() }),
  }),
  /**
   * 9.7 «إغلاق التطبيق أثناء التشغيل» (C-01, protocol 1.2 [D-DEV5-01]): before it stops the engine, the main
   * process asks it to end the active run the short way — SIGTERM to every check's group, 2 s, SIGKILL and the
   * token sweep — with the running checks «أُلغي» because the app is quitting; and a running setup command
   * («ثبّت التبعيات», the OSV download) the same way (C-12 point 11, T12). Resolves when that is done.
   */
  'internal.prepareQuit': defineCommand({
    ...base,
    owner: 'C-12',
    since: '1.2',
    implementedIn: 'DEV-5',
    payload: z.strictObject({}),
    result: z.strictObject({ cancelledRuns: z.int().nonnegative(), cancelledChecks: z.int().nonnegative(), cancelledSetups: z.int().nonnegative() }),
  }),
};
