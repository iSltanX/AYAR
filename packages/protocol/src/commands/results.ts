// Reading results, findings and evidence (C-17 data access; C-16 produces them). Implemented in DEV-5/DEV-6.
// Protocol 1.3 (DEV-6) gives results.query and finding.get their contracts: the filters, the page of unified
// findings with what is gone since the previous comparable execution («زال»), and one finding with its history.
import { Id, IsoTimestamp } from '../common.ts';
import { FindingDetail, ResultsFilter, ResultsPage } from '../domain/findings.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-17', handler: 'engine', audience: 'renderer', since: '1.0' } as const;

/** An evidence token: `evt_` and 32 random bytes; the main process resolves it through internal.evidencePath. */
export const EvidenceToken = z.string().regex(/^evt_[A-Za-z0-9_-]{43}$/);

export const resultCommands = {
  'results.query': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ projectId: Id, filters: ResultsFilter }), result: ResultsPage }),
  'finding.get': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ findingId: Id }), result: FindingDetail }),
  // A short-lived token for ayar-evidence:// (C-01); an invalid token answers "not found" without a path.
  'evidence.token': defineCommand({
    ...base,
    implementedIn: 'DEV-5',
    payload: z.strictObject({ evidenceId: Id }),
    result: z.strictObject({ token: EvidenceToken, expiresAt: IsoTimestamp, kind: z.string(), size: z.int().nonnegative(), sha256: z.string() }),
  }),
};
