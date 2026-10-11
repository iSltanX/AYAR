// Reading results, findings and evidence (C-17 data access; C-16 produces them). Implemented in DEV-5/DEV-6.
// Protocol 1.3 (DEV-6) gives results.query and finding.get their contracts: the filters, the page of unified
// findings with what is gone since the previous comparable execution («زال»), and one finding with its history.
import { Id, IsoTimestamp } from '../common.ts';
import { CheckReport, FindingDetail, ResultsFilter, ResultsPage } from '../domain/findings.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-17', handler: 'engine', audience: 'renderer', since: '1.0' } as const;

/** An evidence token: `evt_` and 32 random bytes; the main process resolves it through internal.evidencePath. */
export const EvidenceToken = z.string().regex(/^evt_[A-Za-z0-9_-]{43}$/);

export const resultCommands = {
  'results.query': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ projectId: Id, filters: ResultsFilter }), result: ResultsPage }),
  'finding.get': defineCommand({ ...base, implementedIn: 'DEV-6', payload: z.strictObject({ findingId: Id }), result: FindingDetail }),
  /**
   * Protocol 1.6 (DEV-11, D-DEV11-03): the last lines of a check's log — while it runs, from the executor's redacted
   * tail (9.7 keeps the last 200), after it, from its raw result — for the live row's «ذيل السجل» (9.6 point 3, 13.3).
   * Text only, redacted before it was kept; the UI draws it as text (C-03). A line longer than 20,000 characters
   * is cut there and ends with «…» (AT-29: a long line neither freezes the page nor fails the call).
   */
  'check.tail': defineCommand({
    ...base,
    since: '1.6',
    implementedIn: 'DEV-11',
    payload: z.strictObject({ checkRunId: Id, maxLines: z.int().min(1).max(200).optional() }),
    result: z.strictObject({ lines: z.array(z.string().max(20_000)), totalLines: z.int().nonnegative(), live: z.boolean() }),
  }),
  /**
   * Protocol 1.7 (DEV-12, D-DEV12-01): a check execution's unified report without its findings (test counts, signals,
   * the reader's facts) and the declared outputs it wrote with their sizes, for the section pages' panels (13.3).
   * Null when the execution kept no unified report (it never ran, or nothing was read).
   */
  'check.report': defineCommand({ ...base, since: '1.7', implementedIn: 'DEV-12', payload: z.strictObject({ checkRunId: Id }), result: CheckReport.nullable() }),
  // A short-lived token for ayar-evidence:// (C-01); an invalid token answers "not found" without a path.
  'evidence.token': defineCommand({
    ...base,
    implementedIn: 'DEV-5',
    payload: z.strictObject({ evidenceId: Id }),
    result: z.strictObject({ token: EvidenceToken, expiresAt: IsoTimestamp, kind: z.string(), size: z.int().nonnegative(), sha256: z.string() }),
  }),
};
