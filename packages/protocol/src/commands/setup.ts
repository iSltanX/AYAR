// Readiness and setup (G-19: owners assigned here). readiness.evaluate belongs to the planner (C-10), which
// labels readiness from C-07 and C-11; setup actions belong to C-11. Implemented in DEV-5 (protocol 1.2 gives
// them their contracts). «ثبّت التبعيات» is a setup action too (G-19), with the preview of 9.4.
import { Id } from '../common.ts';
import { ReadinessReport, SetupExecuteResult } from '../domain/tools.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { ConfirmablePreview, ConfirmablePreviewWithToken } from './previews.ts';

const base = { handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

export const setupCommands = {
  /**
   * C-10 point 6: readiness per applicable instance, with the setup actions that would fix it. `probe` runs the
   * version probes of C-07 (G-DEV4-04); readiness is the one place that runs them (default: true).
   */
  'readiness.evaluate': defineCommand({ ...base, owner: 'C-10', payload: z.strictObject({ projectId: Id, probe: z.boolean().optional() }), result: ReadinessReport }),
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
    result: SetupExecuteResult,
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'actionId' }],
  }),
};
