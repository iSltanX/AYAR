// Finding events: provisional from the adapters' live parsers (C-15), final from the classifier (C-16).
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

export const findingEvents = {
  'finding.provisional': defineEvent({
    owner: 'C-15',
    since: '1.0',
    implementedIn: 'DEV-6',
    payload: z.looseObject({ runId: Id, checkRunId: Id, fingerprint: z.string().min(1) }),
  }),
  'finding.final': defineEvent({
    owner: 'C-16',
    since: '1.0',
    implementedIn: 'DEV-6',
    payload: z.looseObject({ runId: Id, findingId: Id, displayId: z.string().min(1) }),
  }),
};
