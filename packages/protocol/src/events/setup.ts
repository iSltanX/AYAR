// Setup progress (C-11, protocol 1.2): the event 6.5 lacks for a running setup action (G-21 «الأحداث الناقصة:
// تقدم التجهيز»). A tool whose hash or signature does not match ends with a `rejected` phase marked as a security
// alert (C-11 «عدم تطابق البصمة: إيقاف وحذف وتنبيه أمني»).
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

export const SetupPhase = z.enum(['started', 'downloading', 'verifying', 'extracting', 'running', 'probing', 'done', 'failed', 'rejected']);
export type SetupPhase = z.infer<typeof SetupPhase>;

export const setupEvents = {
  'setup.progress': defineEvent({
    owner: 'C-11',
    since: '1.2',
    implementedIn: 'DEV-5',
    payload: z.strictObject({
      actionId: Id,
      phase: SetupPhase,
      bytes: z.int().nonnegative().nullable(),
      totalBytes: z.int().nonnegative().nullable(),
      /** A message key (setup.phase.*, setup.rejected.*). */
      messageKey: z.string(),
      securityAlert: z.boolean(),
    }),
  }),
};
