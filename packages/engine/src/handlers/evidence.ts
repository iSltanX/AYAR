// evidence.token and internal.evidencePath (C-17, C-01): the UI never sees a path; the main process resolves a
// short-lived, single-use token into the one file it then serves on ayar-evidence://.
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';

export const evidenceToken: CommandHandler = (payload, ctx) => ctx.services.evidence.store.token((payload as CommandPayload<'evidence.token'>).evidenceId);

export const internalEvidencePath: CommandHandler = (payload, ctx) => ctx.services.evidence.store.resolve((payload as CommandPayload<'internal.evidencePath'>).token);
