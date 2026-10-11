// report.*, reports.list, compare.runs, task.update, tasks.verify, internal.clipboardText, internal.recordCopy
// (C-21, C-22, C-23, C-20; DEV-9).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError, withFs } from '../host/errors.ts';
import { CardSourceError } from '../tasks/cards.ts';

export const reportBuild: CommandHandler = (payload, ctx) => {
  const { target, options } = payload as CommandPayload<'report.build'>;
  return ctx.services.reports.build(target, options);
};

export const reportsList: CommandHandler = (payload, ctx) => ({ reports: ctx.services.reports.list((payload as CommandPayload<'reports.list'>).projectId) });

export const compareRuns: CommandHandler = (payload, ctx) => {
  const { fromRunId, toRunId } = payload as CommandPayload<'compare.runs'>;
  return ctx.services.reports.compare(fromRunId, toRunId);
};

export const reportExport: CommandHandler = (payload, ctx) => {
  const { target, format, lang, includeScreenshots, content } = payload as CommandPayload<'report.export'>;
  const g = ctx.grants.destinationToken;
  if (!g || g.kind !== 'destination') throw new CommandError('grant_missing', { field: 'destinationToken' });
  return withFs(() => ctx.services.reports.export(target, { format, lang, destination: g.path, includeScreenshots: includeScreenshots === true, content: content ?? 'both' }));
};

/** internal.clipboardText (FR-44): the model format, a card, or an instruction file — never the «لك» text. */
export const internalClipboardText: CommandHandler = (payload, ctx) => {
  const { kind, id } = payload as CommandPayload<'internal.clipboardText'>;
  return { text: ctx.services.reports.clipboardText(kind, id) };
};

/** internal.recordCopy (G-21): after the clipboard write succeeded. */
export const internalRecordCopy: CommandHandler = (payload, ctx) => {
  const { kind, id, chars } = payload as CommandPayload<'internal.recordCopy'>;
  ctx.services.reports.recordCopy(kind, id, chars);
  return {};
};

export const taskUpdate: CommandHandler = (payload, ctx) => {
  const { taskId, patch } = payload as CommandPayload<'task.update'>;
  return { task: ctx.services.tasks.update(taskId, patch) };
};

export const tasksVerify: CommandHandler = async (payload, ctx) => {
  const { projectId, runId } = payload as CommandPayload<'tasks.verify'>;
  if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
  const run = runId ?? ctx.db.get<{ id: string }>("SELECT id FROM runs WHERE project_id = ? AND state IN ('finished', 'interrupted') ORDER BY coalesce(finished_at, started_at, '') DESC LIMIT 1", projectId)?.id;
  if (!run) throw new CommandError('not_found', { reason: 'run' });
  try {
    return { verified: await ctx.services.tasks.verifyAfterRun(run, projectId) };
  } catch (e) {
    if (e instanceof CardSourceError) throw new CommandError('invalid_payload', { path: 'source', reason: e.reason });
    throw e;
  }
};

/** reports.copies (protocol 1.7, DEV-12): the project's «انسخ للنموذج» in the last days, from the audit records (G-21). */
export const reportsCopies: CommandHandler = (payload, ctx) => {
  const { projectId, days } = payload as CommandPayload<'reports.copies'>;
  if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
  const since = new Date(ctx.clock.now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const row = ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE action = 'report.copied' AND project_id = ? AND at >= ?", projectId, since);
  return { count: row?.n ?? 0 };
};
