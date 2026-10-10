// profile.* (C-09).
import type { CommandPayload } from '@ayar/protocol';
import { posix } from 'node:path';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError } from '../host/errors.ts';

const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

export const profileGet: CommandHandler = (payload, ctx) => ctx.services.profiles.view((payload as CommandPayload<'profile.get'>).projectId);

export const profilePropose: CommandHandler = (payload, ctx) => ctx.services.profiles.propose((payload as CommandPayload<'profile.propose'>).projectId);

export const profileUpdate: CommandHandler = (payload, ctx) => {
  const { projectId, patch } = payload as CommandPayload<'profile.update'>;
  return ctx.services.profiles.update(projectId, patch);
};

export const profileApprove: CommandHandler = (payload, ctx) => {
  const { projectId, changeSetId, instances, note } = payload as CommandPayload<'profile.approve'>;
  return ctx.services.profiles.approve(projectId, changeSetId, instances, note);
};

/** The repository's own .ayar/profile.json, read only when it really is inside the root (no link out of it). */
async function repoProfile(ctx: Parameters<CommandHandler>[1], projectId: string): Promise<string | null> {
  const root = (await ctx.services.projects.view(projectId)).rootPath;
  const path = posix.join(root, '.ayar', 'profile.json');
  const st = await ctx.ports.fs.lstat(path);
  if (!st?.isFile) return null;
  const real = await ctx.ports.fs.realpath(path);
  const realRoot = await ctx.ports.fs.realpath(root);
  if (!real || !realRoot || !real.startsWith(`${realRoot}/`)) throw new CommandError('profile_invalid', { rule: 'outside_project' });
  if (st.size > MAX_PROFILE_BYTES) throw new CommandError('profile_invalid', { rule: 'too_large' });
  return new TextDecoder().decode((await ctx.ports.fs.readFilePrefix(path, MAX_PROFILE_BYTES)).data);
}

export const profileExportPreview: CommandHandler = async (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'profile.exportPreview'>;
  return ctx.services.profiles.exportPreview(projectId, await repoProfile(ctx, projectId));
};

export const profileExport: CommandHandler = (payload, ctx) => {
  const { projectId, previewDigest } = payload as CommandPayload<'profile.export'>;
  const g = ctx.grants.destinationToken;
  if (!g || g.kind !== 'destination') throw new CommandError('grant_missing', { field: 'destinationToken' });
  return ctx.services.profiles.exportTo(projectId, g.path, previewDigest);
};

export const profileImport: CommandHandler = async (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'profile.import'>;
  const g = ctx.grants.sourceToken;
  if (!g || g.kind !== 'source') throw new CommandError('grant_missing', { field: 'sourceToken' });
  const st = await ctx.ports.fs.stat(g.path);
  if (!st?.isFile) throw new CommandError('path_missing');
  if (st.size > MAX_PROFILE_BYTES) throw new CommandError('profile_invalid', { rule: 'too_large' });
  const text = new TextDecoder().decode((await ctx.ports.fs.readFilePrefix(g.path, MAX_PROFILE_BYTES)).data);
  return ctx.services.profiles.importText(projectId, text, 'file');
};

export const profileImportFromRepo: CommandHandler = async (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'profile.importFromRepo'>;
  const text = await repoProfile(ctx, projectId);
  if (text === null) throw new CommandError('not_found', { reason: 'no_repository_profile' });
  return ctx.services.profiles.importText(projectId, text, 'repository');
};
