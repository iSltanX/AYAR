// Finding events: provisional from the adapters' live parsers (C-15), final from the classifier (C-16). Protocol
// 1.3 (DEV-6) fixes their payloads: a provisional finding is a line the live parser recognised (a failing test, a
// diagnostic), shown while the check runs and confirmed or dropped by the final reading (9.8 point 3).
import { Id } from '../common.ts';
import { FindingLocation } from '../domain/findings.ts';
import { Proof, Severity } from '../domain/terms.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

export const findingEvents = {
  'finding.provisional': defineEvent({
    owner: 'C-15',
    since: '1.0',
    implementedIn: 'DEV-6',
    payload: z.strictObject({ runId: Id, checkRunId: Id, fingerprint: z.string().min(1), rule: z.string(), title: z.string().max(500), location: FindingLocation.nullable() }),
  }),
  'finding.final': defineEvent({
    owner: 'C-16',
    since: '1.0',
    implementedIn: 'DEV-6',
    payload: z.strictObject({ runId: Id, checkRunId: Id, findingId: Id, displayId: z.string().min(1), severity: Severity, proof: Proof }),
  }),
};
