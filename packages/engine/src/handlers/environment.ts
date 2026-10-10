// environment.resolve (C-07): the login environment and the toolchain of a project; with an instance, the
// environment that instance would get (names only).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError } from '../host/errors.ts';
import { latestProfile } from '../profile/store.ts';

export const environmentResolve: CommandHandler = async (payload, ctx) => {
  const { projectId, refresh, probe, instance } = payload as CommandPayload<'environment.resolve'>;
  const project = await ctx.services.projects.view(projectId);
  const snapshot = ctx.services.projects.snapshot(projectId);
  const env = await ctx.services.environment.resolve({ projectRoot: project.rootPath, facts: snapshot?.facts ?? [], refresh: refresh ?? false, probe: probe ?? false });
  let child = null;
  if (instance) {
    const spec = latestProfile(ctx.db, projectId)?.content.checks.find((c) => c.instance === instance);
    if (!spec) throw new CommandError('not_found', { reason: 'instance' });
    child = await ctx.services.environment.childSummary(instance, spec.env);
  }
  return { env, child };
};
