// results.query and finding.get (C-17 data access over C-16's findings; protocol 1.3, DEV-6).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';

export const resultsQuery: CommandHandler = (payload, ctx) => {
  const { projectId, filters } = payload as CommandPayload<'results.query'>;
  return ctx.services.verdict.query(projectId, filters);
};

export const findingGet: CommandHandler = (payload, ctx) => ctx.services.verdict.get((payload as CommandPayload<'finding.get'>).findingId);
