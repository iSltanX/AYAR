// run.*, runs.*, groups.* (C-10, C-12, C-17).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';

export const runPlan: CommandHandler = (payload, ctx) => {
  const { projectId, selection } = payload as CommandPayload<'run.plan'>;
  return ctx.services.planner.plan(projectId, selection);
};

export const runStart: CommandHandler = (payload, ctx) => ctx.services.runs.start((payload as CommandPayload<'run.start'>).planId);

export const runCancel: CommandHandler = (payload, ctx) => ctx.services.runs.cancel((payload as CommandPayload<'run.cancel'>).target);

export const runRerun: CommandHandler = (payload, ctx) => {
  const { runId, filter } = payload as CommandPayload<'run.rerun'>;
  return ctx.services.planner.rerun(runId, filter);
};

export const runContinueRound: CommandHandler = (payload, ctx) => ctx.services.planner.continueRound((payload as CommandPayload<'run.continueRound'>).roundId);

export const runsList: CommandHandler = (payload, ctx) => ctx.services.runs.list((payload as CommandPayload<'runs.list'>).projectId);

export const checkTail: CommandHandler = (payload, ctx) => {
  const { checkRunId, maxLines } = payload as CommandPayload<'check.tail'>;
  return ctx.services.runs.tail(checkRunId, maxLines);
};

export const runGet: CommandHandler = (payload, ctx) => ctx.services.runs.get((payload as CommandPayload<'run.get'>).runId);

export const runsKeep: CommandHandler = (payload, ctx) => {
  const { runId, keep } = payload as CommandPayload<'runs.keep'>;
  return ctx.services.runs.keep(runId, keep);
};

export const runsDelete: CommandHandler = (payload, ctx) => ctx.services.runs.delete((payload as CommandPayload<'runs.delete'>).runId);

export const groupsSave: CommandHandler = (payload, ctx) => {
  const { projectId, name, instanceKeys } = payload as CommandPayload<'groups.save'>;
  return ctx.services.planner.saveGroup(projectId, name, instanceKeys);
};

export const groupsList: CommandHandler = (payload, ctx) => ({ groups: ctx.services.planner.groups((payload as CommandPayload<'groups.list'>).projectId) });

export const groupsDelete: CommandHandler = (payload, ctx) => ({ deleted: ctx.services.planner.deleteGroup((payload as CommandPayload<'groups.delete'>).groupId) });

/** internal.prepareQuit (host only): the short ending of the active run before the app quits (9.7, C-01). */
export const internalPrepareQuit: CommandHandler = async (_payload, ctx) => {
  // The runs and a running setup action end together, the short way (9.7, C-12 point 11).
  const [runs, cancelledSetups] = await Promise.all([ctx.services.runs.prepareQuit(), ctx.services.setup.prepareQuit()]);
  return { ...runs, cancelledSetups };
};

/** check.report (protocol 1.7, DEV-12): an execution's unified report without its findings, for the section panels. */
export const checkReport: CommandHandler = (payload, ctx) => ctx.services.runs.report((payload as CommandPayload<'check.report'>).checkRunId);
