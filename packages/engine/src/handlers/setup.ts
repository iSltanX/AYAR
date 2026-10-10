// readiness.evaluate, setup.preview, setup.execute (C-10, C-11, 9.4) and tools.* (C-11, FR-49, FR-50).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';

/** The digest a confirmation was bound to (D-DEV3-05): the handler compares it with the preview recomputed now. */
function confirmedDigest(ctx: Parameters<CommandHandler>[1]): string | null {
  const g = ctx.grants.confirmationToken;
  return g?.kind === 'confirmation' ? g.digest : null;
}

export const readinessEvaluate: CommandHandler = (payload, ctx) => {
  const { projectId, probe } = payload as CommandPayload<'readiness.evaluate'>;
  return ctx.services.setup.evaluate(projectId, probe ?? true);
};

export const setupPreview: CommandHandler = (payload, ctx) => ctx.services.setup.preview((payload as CommandPayload<'setup.preview'>).actionId);

export const setupExecute: CommandHandler = (payload, ctx) => ctx.services.setup.execute((payload as CommandPayload<'setup.execute'>).actionId, confirmedDigest(ctx));

export const toolsList: CommandHandler = (_payload, ctx) => ctx.services.tools.list();

export const toolsPreview: CommandHandler = (payload, ctx) => ctx.services.tools.preview((payload as CommandPayload<'tools.preview'>).toolId);

export const toolsInstall: CommandHandler = (payload, ctx) => ctx.services.tools.install((payload as CommandPayload<'tools.install'>).toolId, { digest: confirmedDigest(ctx) });

export const toolsVerify: CommandHandler = async (payload, ctx) => ({ tools: await ctx.services.tools.verify((payload as CommandPayload<'tools.verify'>).toolId) });

export const toolsRemove: CommandHandler = (payload, ctx) => ctx.services.tools.remove((payload as CommandPayload<'tools.remove'>).toolId);
