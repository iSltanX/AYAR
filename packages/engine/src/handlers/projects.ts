// project.* (C-05, C-06): the handlers turn grants into paths and call the registry. A path never comes from the
// renderer: only from the grant the main process (or tools/cli, the host) attached to the selection token.
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError } from '../host/errors.ts';

function grantedPath(ctx: Parameters<CommandHandler>[1], field: string): string {
  const g = ctx.grants[field];
  if (!g || (g.kind !== 'selection' && g.kind !== 'source' && g.kind !== 'destination')) throw new CommandError('grant_missing', { field });
  return g.path;
}

export const projectAdd: CommandHandler = (_payload, ctx) => ctx.services.projects.add(grantedPath(ctx, 'selectionToken'));

export const projectConfirm: CommandHandler = (payload, ctx) => ctx.services.projects.confirm((payload as CommandPayload<'project.confirm'>).pendingId);

export const projectList: CommandHandler = async (_payload, ctx) => ({ projects: await ctx.services.projects.list() });

export const projectGet: CommandHandler = async (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'project.get'>;
  return { project: await ctx.services.projects.view(projectId), snapshot: ctx.services.projects.snapshot(projectId) };
};

export const projectRescan: CommandHandler = (payload, ctx) => ({ discoveryId: ctx.services.projects.rescan((payload as CommandPayload<'project.rescan'>).projectId) });

export const projectCancelDiscovery: CommandHandler = (payload, ctx) => ({ cancelled: ctx.services.projects.cancelDiscovery((payload as CommandPayload<'project.cancelDiscovery'>).projectId) });

export const projectRelocate: CommandHandler = (payload, ctx) => ctx.services.projects.relocate((payload as CommandPayload<'project.relocate'>).projectId, grantedPath(ctx, 'selectionToken'));

export const projectRemove: CommandHandler = async (payload, ctx) => {
  await ctx.services.projects.remove((payload as CommandPayload<'project.remove'>).projectId);
  return { removed: true };
};

export const projectSetTrust: CommandHandler = async (payload, ctx) => {
  const { projectId, trusted } = payload as CommandPayload<'project.setTrust'>;
  ctx.services.projects.setTrust(projectId, trusted);
  return { project: await ctx.services.projects.view(projectId) };
};

export const projectRename: CommandHandler = async (payload, ctx) => {
  const { projectId, displayName } = payload as CommandPayload<'project.rename'>;
  ctx.services.projects.rename(projectId, displayName);
  return { project: await ctx.services.projects.view(projectId) };
};
