// captures.list, baselines.list and baseline.approve (C-14, FR-35; protocol 1.4, DEV-7). The approval is explicit,
// capture by capture (D-27): the engine never approves a reference on its own.
import type { CommandPayload } from '@ayar/protocol';
import { CommandError } from '../host/errors.ts';
import type { CommandHandler } from '../host/dispatcher.ts';

export const capturesList: CommandHandler = (payload, ctx) => {
  const { checkRunId } = payload as CommandPayload<'captures.list'>;
  return ctx.services.baselines.captures(checkRunId);
};

export const baselinesList: CommandHandler = async (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'baselines.list'>;
  await ctx.services.projects.view(projectId);
  return { baselines: ctx.services.baselines.list(projectId) };
};

export const baselineApprove: CommandHandler = async (payload, ctx) => {
  const { projectId, captureIds } = payload as CommandPayload<'baseline.approve'>;
  await ctx.services.projects.view(projectId);
  if (ctx.services.runs.busy(projectId)) throw new CommandError('busy', { reason: 'run_active' });
  return ctx.services.baselines.approve(projectId, captureIds);
};
