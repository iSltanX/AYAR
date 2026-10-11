// aiChecks.* (C-25, D-41, FR-66 to FR-68; DEV-9). AYAR calls no model here or anywhere.
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError, withFs } from '../host/errors.ts';

export const aiChecksNeeds: CommandHandler = (payload, ctx) => ctx.services.aiChecks.needs((payload as CommandPayload<'aiChecks.needs'>).projectId);

export const aiChecksProvideInput: CommandHandler = (payload, ctx) => {
  const { needId, key, value } = payload as CommandPayload<'aiChecks.provideInput'>;
  return ctx.services.aiChecks.provideInput(needId, key, value);
};

export const aiChecksGenerate: CommandHandler = (payload, ctx) => {
  const { needId, lang } = payload as CommandPayload<'aiChecks.generate'>;
  return ctx.services.aiChecks.generate(needId, lang);
};

export const aiChecksSave: CommandHandler = (payload, ctx) => {
  const { aiCheckId } = payload as CommandPayload<'aiChecks.save'>;
  const g = ctx.grants.destinationToken;
  if (!g || g.kind !== 'destination') throw new CommandError('grant_missing', { field: 'destinationToken' });
  return withFs(() => ctx.services.aiChecks.save(aiCheckId, g.path));
};

export const aiChecksImportResults: CommandHandler = (payload, ctx) => withFs(() => ctx.services.aiChecks.importResults((payload as CommandPayload<'aiChecks.importResults'>).projectId));

export const aiChecksGet: CommandHandler = (payload, ctx) => ctx.services.aiChecks.get((payload as CommandPayload<'aiChecks.get'>).aiCheckId);

export const aiChecksList: CommandHandler = (payload, ctx) => ctx.services.aiChecks.list((payload as CommandPayload<'aiChecks.list'>).projectId);
